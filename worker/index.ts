import bcrypt from 'bcryptjs';

/**
 * Cloudflare Worker API entry point for Kestrel Forge Marketplace.
 * Full API parity with Express + SQLite backend using Cloudflare D1 (SQLite),
 * Cloudflare R2 (asset storage), and Web Crypto APIs (HMAC-SHA256 JWT & webhooks).
 */

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes?: number; last_row_id?: number } }>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string };
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
}

interface AssetsFetcher {
  fetch(request: Request): Promise<Response>;
}

export interface Env {
  DB: D1Database;
  BUCKET?: R2Bucket;
  ASSETS?: AssetsFetcher;
  JWT_SECRET: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD_HASH?: string;
  GITHUB_TOKEN?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_CACHE_TTL_MINUTES?: string;
  APP_URL?: string;
}

const COOKIE_NAME = 'kf_admin_session';

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isSafeUrlOrPath(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  if (!val) return true;
  return val.startsWith('/') || val.startsWith('https://') || val.startsWith('http://');
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

async function signJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        ...payload,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
      })
    )
  );
  const sig = toBase64Url(await hmacSha256(secret, `${header}.${body}`));
  return `${header}.${body}.${sig}`;
}

async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  if (!secret || secret === 'replace-with-strong-random-32-byte-secret') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = toBase64Url(await hmacSha256(secret, `${header}.${body}`));
  if (!constantTimeEqual(sig, expected)) return null;
  try {
    const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Record<string, unknown>;
    if (typeof decoded.exp === 'number' && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyPasswordHash(plain: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    return bcrypt.compareSync(plain, storedHash);
  }
  const sha = await sha256Hex(plain);
  return constantTimeEqual(sha, storedHash);
}

async function getAuthenticatedAdmin(request: Request, env: Env): Promise<{ userId: number; email: string; role: string } | null> {
  const cookies = parseCookies(request.headers.get('Cookie'));
  const token = cookies[COOKIE_NAME];
  if (!token || !env.JWT_SECRET) return null;
  const decoded = await verifyJwt(token, env.JWT_SECRET);
  if (!decoded || decoded.role !== 'admin' || typeof decoded.email !== 'string') return null;
  return {
    userId: Number(decoded.userId || 1),
    email: decoded.email,
    role: 'admin',
  };
}

function parseGitHubOwnerAndRepo(repoUrl: string): { owner: string; repo: string } {
  const cleaned = repoUrl.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) return { owner: '', repo: '' };
  return { owner: match[1], repo: match[2] };
}

function inferAssetFormat(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.apk')) return 'APK';
  if (lower.endsWith('.aab')) return 'AAB';
  if (lower.endsWith('.exe')) return 'EXE';
  if (lower.endsWith('.msi')) return 'MSI';
  if (lower.endsWith('.zip')) return 'ZIP';
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'TAR.GZ';
  if (lower.endsWith('.tar.xz')) return 'TAR.XZ';
  if (lower.endsWith('.dmg')) return 'DMG';
  if (lower.endsWith('.pkg')) return 'PKG';
  if (lower.endsWith('.appimage')) return 'AppImage';
  if (lower.endsWith('.deb')) return 'DEB';
  if (lower.endsWith('.rpm')) return 'RPM';
  const ext = fileName.split('.').pop();
  return ext ? ext.toUpperCase() : 'FILE';
}

function inferPlatformHint(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.apk') || lower.endsWith('.aab') || lower.includes('android')) return 'Android';
  if (lower.endsWith('.exe') || lower.endsWith('.msi') || lower.includes('win64') || lower.includes('win32') || lower.includes('windows')) return 'Windows';
  if (lower.endsWith('.dmg') || lower.endsWith('.pkg') || lower.includes('macos') || lower.includes('darwin')) return 'macOS';
  if (lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.rpm') || lower.includes('linux')) return 'Linux';
  return 'Cross-platform';
}

function mapCacheRow(cacheRow: Record<string, unknown> | null | undefined): {
  repoFullName: string;
  latestTag: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  assets: unknown[];
  allReleases: unknown[];
  fetchedAt: string | null;
  fetchStatus: string;
  errorMessage: string | null;
} | null {
  if (!cacheRow) return null;
  return {
    repoFullName: String(cacheRow.repo_full_name || ''),
    latestTag: cacheRow.latest_tag ? String(cacheRow.latest_tag) : null,
    releaseName: cacheRow.release_name ? String(cacheRow.release_name) : null,
    releaseNotes: cacheRow.release_notes ? String(cacheRow.release_notes) : null,
    publishedAt: cacheRow.published_at ? String(cacheRow.published_at) : null,
    htmlUrl: cacheRow.html_url ? String(cacheRow.html_url) : null,
    assets: safeParseJson<unknown[]>(cacheRow.assets_json, []),
    allReleases: safeParseJson<unknown[]>(cacheRow.all_releases_json, []),
    fetchedAt: cacheRow.fetched_at ? String(cacheRow.fetched_at) : null,
    fetchStatus: String(cacheRow.fetch_status || 'error'),
    errorMessage: cacheRow.error_message ? String(cacheRow.error_message) : null,
  };
}

function mapProduct(
  row: Record<string, unknown>,
  counts?: { total?: number; direct?: number; github?: number; web?: number },
  githubCache?: ReturnType<typeof mapCacheRow>
) {
  const id = String(row.id);
  const githubOwner = String(row.github_owner || '');
  const githubRepoName = String(row.github_repo_name || '');
  return {
    id,
    slug: String(row.slug || id),
    name: String(row.name),
    nameAr: String(row.name_ar || row.name),
    tagline: String(row.tagline || ''),
    taglineAr: String(row.tagline_ar || row.tagline || ''),
    category: String(row.category),
    description: String(row.description),
    descriptionAr: String(row.description_ar || row.description),
    features: safeParseJson(row.features_json, []),
    featuresAr: safeParseJson(row.features_ar_json, []),
    icon: String(row.icon || ''),
    coverImage: String(row.cover_image || ''),
    screenshots: safeParseJson(row.screenshots_json, []),
    githubRepo: String(row.github_repo || ''),
    githubOwner,
    githubRepoName,
    githubReleases: String(row.github_releases || ''),
    githubApiUrl:
      githubOwner && githubRepoName
        ? `https://api.github.com/repos/${githubOwner}/${githubRepoName}/releases`
        : '',
    liveUrl: row.live_url ? String(row.live_url) : null,
    featured: Boolean(row.featured),
    published: row.published === undefined ? true : Boolean(row.published),
    releaseSync: row.release_sync === undefined ? true : Boolean(row.release_sync),
    managedBy: row.managed_by === 'dashboard' ? 'dashboard' : 'config',
    isSampleDemo: Boolean(row.is_sample_demo),
    assetFilter: safeParseJson(row.asset_filter_json, {}),
    platforms: safeParseJson(row.platforms_json, []),
    technologies: safeParseJson(row.technologies_json, []),
    systemRequirements: safeParseJson(row.system_requirements_json, {}),
    version: String(row.version || '1.0.0'),
    releaseDate: String(row.release_date),
    updatedAt: String(row.updated_at),
    developer: String(row.developer || 'Kestrel Forge'),
    license: String(row.license || 'MIT'),
    manualDownloads: safeParseJson(row.manual_downloads_json, []),
    versionHistory: safeParseJson(row.version_history_json, []),
    totalDownloads: counts?.total || 0,
    directDownloads: counts?.direct || 0,
    githubClicks: counts?.github || 0,
    webLaunches: counts?.web || 0,
    ...(githubCache ? { githubCache } : {}),
  };
}

async function computeStatsD1(env: Env) {
  const prods = await env.DB.prepare('SELECT category FROM products WHERE published = 1').all<{ category: string }>();
  const dl = await env.DB.prepare(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
      SUM(CASE WHEN source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
      SUM(CASE WHEN source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web
     FROM download_events`
  ).first<{ total: number; direct: number; github: number; web: number }>();

  const totalGames = prods.results.filter((r) => r.category === 'games').length;
  return {
    totalProducts: prods.results.length,
    totalGames,
    totalApplications: prods.results.length - totalGames,
    totalAndroid: prods.results.filter((r) => r.category === 'android').length,
    totalWindows: prods.results.filter((r) => r.category === 'windows').length,
    totalWeb: prods.results.filter((r) => r.category === 'web').length,
    totalDownloads: dl?.total || 0,
    directDownloads: dl?.direct || 0,
    githubReleaseClicks: dl?.github || 0,
    webAppLaunches: dl?.web || 0,
  };
}

async function syncGitHubReleasesD1(
  env: Env,
  productId: string,
  owner: string,
  repo: string,
  force = false,
  assetFilter?: { extensions?: string[]; pattern?: string }
) {
  if (!owner || !repo) {
    return {
      repoFullName: '',
      latestTag: null,
      releaseName: null,
      releaseNotes: null,
      publishedAt: null,
      htmlUrl: null,
      assets: [],
      allReleases: [],
      fetchedAt: null,
      fetchStatus: 'unconfigured',
      errorMessage: 'No GitHub repository configured for this product.',
    };
  }

  const repoFullName = `${owner}/${repo}`;
  const ttlMs = (Number(env.GITHUB_CACHE_TTL_MINUTES) || 15) * 60 * 1000;
  const existingRow = await env.DB.prepare('SELECT * FROM github_releases_cache WHERE product_id = ?')
    .bind(productId)
    .first();
  const existing = mapCacheRow(existingRow);

  if (!force && existing && existing.fetchedAt && existing.repoFullName === repoFullName) {
    const age = Date.now() - new Date(existing.fetchedAt).getTime();
    if (age < ttlMs && existing.fetchStatus === 'ok') {
      return existing;
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Kestrel-Forge-Worker/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const ghToken = env.GITHUB_TOKEN?.trim();
  if (ghToken && ghToken.length > 5 && ghToken !== '.' && !ghToken.startsWith('replace-')) {
    headers.Authorization = `Bearer ${ghToken}`;
  }

  const now = new Date().toISOString();

  try {
    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=8`,
      { headers }
    );

    if (!res.ok) {
      const status = res.status === 404 ? 'not_found' : res.status === 403 || res.status === 429 ? 'rate_limited' : 'error';
      const summary = {
        repoFullName,
        latestTag: existing?.latestTag || null,
        releaseName: existing?.releaseName || null,
        releaseNotes: existing?.releaseNotes || null,
        publishedAt: existing?.publishedAt || null,
        htmlUrl: existing?.htmlUrl || `https://github.com/${repoFullName}/releases`,
        assets: existing?.assets || [],
        allReleases: existing?.allReleases || [],
        fetchedAt: now,
        fetchStatus: status,
        errorMessage:
          status === 'not_found'
            ? `GitHub repository "${repoFullName}" was not found or has no public releases.`
            : status === 'rate_limited'
              ? 'GitHub API rate limit reached. Configure GITHUB_TOKEN secret.'
              : `GitHub API returned HTTP ${res.status}`,
      };
      await upsertCacheD1(env, productId, summary);
      return summary;
    }

    const releases = (await res.json()) as Array<{
      id: number;
      tag_name: string;
      name: string | null;
      body: string | null;
      published_at: string;
      created_at?: string;
      html_url: string;
      prerelease: boolean;
      draft: boolean;
      assets: Array<{
        id: number;
        name: string;
        size: number;
        content_type?: string;
        browser_download_url: string;
        download_count: number;
      }>;
    }>;

    const allowedExt = (assetFilter?.extensions || []).map((e) => e.trim().toLowerCase().replace(/^\./, '')).filter(Boolean);
    const pattern = (assetFilter?.pattern || '').trim().toLowerCase();

    const mappedReleases = releases
      .filter((r) => !r.draft)
      .map((r) => {
        const mappedAssets = (r.assets || []).map((a) => ({
          id: Number(a.id),
          name: String(a.name),
          size: Number(a.size || 0),
          downloadUrl: String(a.browser_download_url),
          contentType: String(a.content_type || 'application/octet-stream'),
          downloadCount: Number(a.download_count || 0),
          format: inferAssetFormat(String(a.name)),
          platformHint: inferPlatformHint(String(a.name)),
        }));

        const filtered = mappedAssets.filter((a) => {
          const lower = a.name.toLowerCase();
          if (pattern && !lower.includes(pattern)) return false;
          if (allowedExt.length > 0 && !allowedExt.some((ext) => lower.endsWith(`.${ext}`))) return false;
          return true;
        });

        return {
          id: Number(r.id),
          tagName: String(r.tag_name || ''),
          name: String(r.name || r.tag_name || 'Release'),
          body: String(r.body || ''),
          publishedAt: String(r.published_at || r.created_at || now),
          htmlUrl: String(r.html_url || ''),
          prerelease: Boolean(r.prerelease),
          assets: filtered.length > 0 ? filtered : mappedAssets,
        };
      });

    const latest = mappedReleases.find((r) => !r.prerelease) || mappedReleases[0] || null;
    const summary = {
      repoFullName,
      latestTag: latest?.tagName || null,
      releaseName: latest?.name || null,
      releaseNotes: latest?.body || null,
      publishedAt: latest?.publishedAt || null,
      htmlUrl: latest?.htmlUrl || `https://github.com/${repoFullName}/releases`,
      assets: latest?.assets || [],
      allReleases: mappedReleases,
      fetchedAt: now,
      fetchStatus: 'ok',
      errorMessage: mappedReleases.length === 0 ? 'Repository exists but has no published releases yet.' : null,
    };

    await upsertCacheD1(env, productId, summary);

    if (latest?.tagName) {
      await env.DB.prepare('UPDATE products SET version = ?, updated_at = ? WHERE id = ?')
        .bind(latest.tagName.replace(/^v/i, ''), latest.publishedAt || now, productId)
        .run();
    }

    return summary;
  } catch (err) {
    const summary = {
      repoFullName,
      latestTag: existing?.latestTag || null,
      releaseName: existing?.releaseName || null,
      releaseNotes: existing?.releaseNotes || null,
      publishedAt: existing?.publishedAt || null,
      htmlUrl: existing?.htmlUrl || `https://github.com/${repoFullName}/releases`,
      assets: existing?.assets || [],
      allReleases: existing?.allReleases || [],
      fetchedAt: now,
      fetchStatus: 'error',
      errorMessage: err instanceof Error ? err.message : 'GitHub fetch failed',
    };
    await upsertCacheD1(env, productId, summary);
    return summary;
  }
}

async function upsertCacheD1(
  env: Env,
  productId: string,
  summary: {
    repoFullName: string;
    latestTag: string | null;
    releaseName: string | null;
    releaseNotes: string | null;
    publishedAt: string | null;
    htmlUrl: string | null;
    assets: unknown[];
    allReleases: unknown[];
    fetchedAt: string;
    fetchStatus: string;
    errorMessage: string | null;
  }
) {
  await env.DB.prepare(
    `INSERT INTO github_releases_cache (
      product_id, repo_full_name, latest_tag, release_name, release_notes,
      published_at, html_url, assets_json, all_releases_json, fetched_at, fetch_status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      repo_full_name = excluded.repo_full_name,
      latest_tag = excluded.latest_tag,
      release_name = excluded.release_name,
      release_notes = excluded.release_notes,
      published_at = excluded.published_at,
      html_url = excluded.html_url,
      assets_json = excluded.assets_json,
      all_releases_json = excluded.all_releases_json,
      fetched_at = excluded.fetched_at,
      fetch_status = excluded.fetch_status,
      error_message = excluded.error_message`
  )
    .bind(
      productId,
      summary.repoFullName,
      summary.latestTag,
      summary.releaseName,
      summary.releaseNotes,
      summary.publishedAt,
      summary.htmlUrl,
      JSON.stringify(summary.assets),
      JSON.stringify(summary.allReleases),
      summary.fetchedAt,
      summary.fetchStatus,
      summary.errorMessage
    )
    .run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const isProtectedPath = pathname.startsWith('/api/auth') || pathname.startsWith('/api/admin');
    const noStoreHeaders: Record<string, string> = isProtectedPath ? { 'Cache-Control': 'no-store' } : {};

    if (pathname === '/api/health') {
      return json({ ok: true, runtime: 'cloudflare-workers', timestamp: new Date().toISOString() });
    }

    if (pathname === '/robots.txt') {
      const origin = (env.APP_URL || url.origin).replace(/\/+$/, '');
      return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${origin}/sitemap.xml\n`, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (pathname === '/sitemap.xml') {
      const origin = (env.APP_URL || url.origin).replace(/\/+$/, '');
      const staticRoutes = ['/', '/products', '/games', '/android', '/windows', '/web-apps', '/about', '/contact', '/privacy', '/terms'];
      const rows = await env.DB.prepare('SELECT id, slug, updated_at FROM products WHERE published = 1').all<{
        id: string;
        slug: string;
        updated_at: string;
      }>();
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...staticRoutes.map((route) => `  <url><loc>${origin}${route}</loc><changefreq>weekly</changefreq></url>`),
        ...rows.results.map(
          (r) =>
            `  <url><loc>${origin}/product/${encodeURIComponent(r.slug || r.id)}</loc><lastmod>${String(r.updated_at).slice(0, 10)}</lastmod><changefreq>weekly</changefreq></url>`
        ),
        '</urlset>',
      ].join('\n');
      return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    }

    if (pathname.startsWith('/uploads/') && env.BUCKET) {
      const key = pathname.replace(/^\/uploads\//, '');
      const obj = await env.BUCKET.get(key);
      if (!obj) return json({ error: 'Asset not found' }, 404);
      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    if (pathname === '/api/stats' && request.method === 'GET') {
      return json(await computeStatsD1(env));
    }

    if (pathname === '/api/categories' && request.method === 'GET') {
      const cats = await env.DB.prepare(
        `SELECT c.*, COUNT(p.id) as productCount
         FROM categories c
         LEFT JOIN products p ON p.category = c.id AND p.published = 1
         GROUP BY c.id ORDER BY c.sort_order ASC`
      ).all();
      return json(
        cats.results.map((c) => ({
          id: String(c.id),
          slug: String(c.slug),
          name: String(c.name),
          nameAr: String(c.name_ar),
          description: String(c.description),
          descriptionAr: String(c.description_ar),
          productCount: Number(c.productCount || 0),
        }))
      );
    }

    if (pathname === '/api/products' && request.method === 'GET') {
      const admin = await getAuthenticatedAdmin(request, env);
      const includeUnpublished = url.searchParams.get('includeUnpublished') === 'true' && Boolean(admin);
      const sql = includeUnpublished
        ? 'SELECT * FROM products ORDER BY sort_order ASC, updated_at DESC'
        : 'SELECT * FROM products WHERE published = 1 ORDER BY sort_order ASC, updated_at DESC';

      const [rows, countsRows, cacheRows] = await Promise.all([
        env.DB.prepare(sql).all(),
        env.DB.prepare(
          `SELECT product_id, COUNT(*) as total,
            SUM(CASE WHEN source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
            SUM(CASE WHEN source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
            SUM(CASE WHEN source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web
           FROM download_events GROUP BY product_id`
        ).all<{ product_id: string; total: number; direct: number; github: number; web: number }>(),
        env.DB.prepare('SELECT * FROM github_releases_cache').all(),
      ]);

      const countMap = new Map(countsRows.results.map((c) => [c.product_id, c]));
      const cacheMap = new Map(cacheRows.results.map((c) => [String(c.product_id), mapCacheRow(c)]));
      let items = rows.results.map((r) => mapProduct(r, countMap.get(String(r.id)), cacheMap.get(String(r.id))));

      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const category = (url.searchParams.get('category') || '').trim().toLowerCase();
      const platform = (url.searchParams.get('platform') || '').trim().toLowerCase();
      const os = (url.searchParams.get('os') || '').trim().toLowerCase();
      const productType = (url.searchParams.get('type') || 'all').trim().toLowerCase();
      const featuredOnly = url.searchParams.get('featured') === 'true';
      const sort = url.searchParams.get('sort') || 'newest';
      const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 24));

      if (category && category !== 'all') items = items.filter((p) => p.category === category);
      if (featuredOnly) items = items.filter((p) => p.featured);
      if (productType === 'web') items = items.filter((p) => Boolean(p.liveUrl));
      else if (productType === 'hybrid') items = items.filter((p) => Boolean(p.liveUrl) && p.manualDownloads.length > 0);
      else if (productType === 'downloadable') {
        items = items.filter(
          (p) => p.manualDownloads.length > 0 || ((p as { githubCache?: { assets?: unknown[] } }).githubCache?.assets?.length ?? 0) > 0 || !p.liveUrl
        );
      }

      if (platform && platform !== 'all') {
        items = items.filter((p) => p.platforms.some((pl: string) => pl.toLowerCase() === platform));
      }
      if (os && os !== 'all') {
        items = items.filter(
          (p) =>
            p.platforms.some((pl: string) => pl.toLowerCase().includes(os)) ||
            String((p.systemRequirements as { os?: string }).os || '')
              .toLowerCase()
              .includes(os)
        );
      }
      if (q) {
        items = items.filter((p) =>
          [p.name, p.nameAr, p.tagline, p.taglineAr, p.description, p.descriptionAr, p.category, ...p.features, ...p.platforms, ...p.technologies]
            .join(' ')
            .toLowerCase()
            .includes(q)
        );
      }

      if (sort === 'alpha') items.sort((a, b) => a.name.localeCompare(b.name));
      else if (sort === 'popular') {
        items.sort((a, b) => {
          if (b.totalDownloads !== a.totalDownloads) return b.totalDownloads - a.totalDownloads;
          if (b.featured !== a.featured) return Number(b.featured) - Number(a.featured);
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
        });
      } else if (sort === 'updated') items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      else items.sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));

      const total = items.length;
      const paged = items.slice((page - 1) * limit, page * limit);
      return json({ items: paged, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
    }

    const ghReleaseMatch = pathname.match(/^\/api\/products\/([^/]+)\/github-releases$/);
    if (ghReleaseMatch && request.method === 'GET') {
      const key = decodeURIComponent(ghReleaseMatch[1]);
      const row = await env.DB.prepare('SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE id = ? OR slug = ?')
        .bind(key, key)
        .first<{ id: string; github_owner: string; github_repo_name: string; asset_filter_json: string }>();
      if (!row) return json({ error: 'Product not found' }, 404);
      const summary = await syncGitHubReleasesD1(
        env,
        row.id,
        row.github_owner,
        row.github_repo_name,
        false,
        safeParseJson(row.asset_filter_json, {})
      );
      return json(summary);
    }

    const detailMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
    if (detailMatch && request.method === 'GET') {
      const slugOrId = decodeURIComponent(detailMatch[1]);
      const row = await env.DB.prepare('SELECT * FROM products WHERE id = ? OR slug = ?').bind(slugOrId, slugOrId).first();
      if (!row) return json({ error: 'Product not found' }, 404);
      const isAdmin = Boolean(await getAuthenticatedAdmin(request, env));
      if (!row.published && !isAdmin) return json({ error: 'Product not found' }, 404);

      const dl = await env.DB.prepare(
        `SELECT COUNT(*) as total,
          SUM(CASE WHEN source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
          SUM(CASE WHEN source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
          SUM(CASE WHEN source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web
         FROM download_events WHERE product_id = ?`
      )
        .bind(String(row.id))
        .first<{ total: number; direct: number; github: number; web: number }>();

      const product = mapProduct(row, dl || undefined);
      const cacheRow = await env.DB.prepare('SELECT * FROM github_releases_cache WHERE product_id = ?')
        .bind(product.id)
        .first();
      let githubCache = mapCacheRow(cacheRow);

      if (product.releaseSync && product.githubOwner && product.githubRepoName) {
        githubCache = await syncGitHubReleasesD1(
          env,
          product.id,
          product.githubOwner,
          product.githubRepoName,
          false,
          product.assetFilter as { extensions?: string[]; pattern?: string }
        );
      }

      const relatedRows = await env.DB.prepare(
        'SELECT * FROM products WHERE id != ? AND published = 1 AND category = ? ORDER BY featured DESC, updated_at DESC LIMIT 3'
      )
        .bind(product.id, product.category)
        .all();

      return json({
        product: { ...product, githubCache },
        related: relatedRows.results.map((r) => mapProduct(r)),
      });
    }

    if (pathname === '/api/downloads/track' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const allowedSources = ['direct_file', 'github_release_click', 'web_app_launch'];
      if (!body?.productId || !body?.fileName || !body?.fileFormat || !allowedSources.includes(String(body?.sourceType))) {
        return json({ error: 'Invalid tracking payload' }, 400);
      }
      const exists = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(String(body.productId)).first();
      if (!exists) return json({ error: 'Product not found' }, 404);
      await env.DB.prepare(
        'INSERT INTO download_events (product_id, file_name, file_format, source_type, version, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
        .bind(
          String(body.productId),
          String(body.fileName).slice(0, 200),
          String(body.fileFormat).slice(0, 30),
          String(body.sourceType),
          String(body.version || '').slice(0, 40),
          new Date().toISOString()
        )
        .run();
      return json({ ok: true });
    }

    const pkgMatch = pathname.match(/^\/api\/downloads\/package\/([^/]+)\/([^/]+)$/);
    if (pkgMatch && request.method === 'GET') {
      const productId = decodeURIComponent(pkgMatch[1]);
      const fileName = decodeURIComponent(pkgMatch[2]);
      const row = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(productId).first();
      if (!row) return json({ error: 'Product not found' }, 404);
      const product = mapProduct(row);
      const asset = (product.manualDownloads as Array<{ name: string; format: string; sizeBytes: number; version?: string; releaseDate?: string }>).find(
        (d) => d.name === fileName
      );
      if (!asset) return json({ error: 'Requested build artifact not found' }, 404);

      await env.DB.prepare(
        "INSERT INTO download_events (product_id, file_name, file_format, source_type, version, created_at) VALUES (?, ?, ?, 'direct_file', ?, ?)"
      )
        .bind(product.id, asset.name, asset.format, asset.version || product.version, new Date().toISOString())
        .run();

      const manifest = {
        productId: product.id,
        productName: product.name,
        version: asset.version || product.version,
        artifact: asset.name,
        format: asset.format,
        declaredSizeBytes: asset.sizeBytes,
        releaseDate: asset.releaseDate,
        developer: product.developer,
        license: product.license,
        githubReleases: product.githubReleases,
        note: 'Sample release manifest. Link a GitHub Repository with published Releases or upload compiled binaries to Cloudflare R2.',
        generatedAt: new Date().toISOString(),
      };
      return new Response(JSON.stringify(manifest, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${asset.name}.manifest.json"`,
        },
      });
    }

    if (pathname === '/api/messages' && request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const type = body?.type === 'bug_report' ? 'bug_report' : body?.type === 'contact' ? 'contact' : null;
      const name = String(body?.name || '').replace(/[<>]/g, '').trim();
      const email = String(body?.email || '').trim().toLowerCase();
      const subject = String(body?.subject || '').replace(/[<>]/g, '').trim();
      const message = String(body?.message || '').replace(/[<>]/g, '').trim();

      if (!type || name.length < 2 || !email.includes('@') || subject.length < 3 || message.length < 10) {
        return json({ error: 'Please complete all required message fields' }, 400);
      }

      const res = await env.DB.prepare(
        "INSERT INTO messages (type, product_id, name, email, subject, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)"
      )
        .bind(type, body?.productId ? String(body.productId) : null, name, email, subject, message, new Date().toISOString())
        .run();

      return json({ ok: true, id: res.meta.last_row_id || 0 }, 201);
    }

    if (pathname === '/api/webhooks/github' && request.method === 'POST') {
      const rawText = await request.text();
      if (env.GITHUB_WEBHOOK_SECRET) {
        const sig = request.headers.get('x-hub-signature-256') || '';
        const digest = await hmacSha256(env.GITHUB_WEBHOOK_SECRET, rawText);
        const expected =
          'sha256=' +
          Array.from(digest)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        if (!constantTimeEqual(sig, expected)) return json({ error: 'Invalid webhook signature' }, 401);
      }
      const event = request.headers.get('x-github-event') || '';
      if (event === 'ping') return json({ ok: true, pong: true });
      const payload = safeParseJson<{ repository?: { full_name?: string } }>(rawText, {});
      if (event === 'release' && payload.repository?.full_name) {
        const [owner, repo] = payload.repository.full_name.split('/');
        const matches = await env.DB.prepare(
          'SELECT id, asset_filter_json FROM products WHERE LOWER(github_owner) = LOWER(?) AND LOWER(github_repo_name) = LOWER(?) AND release_sync = 1'
        )
          .bind(owner, repo)
          .all<{ id: string; asset_filter_json: string }>();
        for (const m of matches.results) {
          await syncGitHubReleasesD1(env, m.id, owner, repo, true, safeParseJson(m.asset_filter_json, {}));
        }
        return json({ ok: true, syncedProducts: matches.results.length });
      }
      return json({ ok: true, ignored: true });
    }

    if (pathname === '/api/auth/login' && request.method === 'POST') {
      if (!env.JWT_SECRET || env.JWT_SECRET === 'replace-with-strong-random-32-byte-secret') {
        return json({ error: 'Server JWT_SECRET is not configured' }, 500, noStoreHeaders);
      }
      const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
      if (!body?.email || !body?.password) return json({ error: 'Email and password required' }, 400, noStoreHeaders);

      const email = body.email.trim().toLowerCase();
      const adminRow = await env.DB.prepare('SELECT id, email, password_hash, role FROM admin_users WHERE email = ?')
        .bind(email)
        .first<{ id: number; email: string; password_hash: string; role: string }>();

      const matchesDb = adminRow ? await verifyPasswordHash(body.password, adminRow.password_hash) : false;
      const matchesEnv =
        Boolean(env.ADMIN_EMAIL && env.ADMIN_PASSWORD_HASH) &&
        email === env.ADMIN_EMAIL!.trim().toLowerCase() &&
        (await verifyPasswordHash(body.password, env.ADMIN_PASSWORD_HASH!));

      if (!matchesDb && !matchesEnv) {
        return json({ error: 'Invalid email or password' }, 401, noStoreHeaders);
      }

      const userPayload = {
        userId: adminRow?.id || 1,
        email,
        role: adminRow?.role || 'admin',
      };
      const token = await signJwt(userPayload, env.JWT_SECRET);
      return json(
        { user: userPayload },
        200,
        {
          ...noStoreHeaders,
          'Set-Cookie': `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=86400`,
        }
      );
    }

    if (pathname === '/api/auth/logout' && request.method === 'POST') {
      return json(
        { ok: true },
        200,
        {
          ...noStoreHeaders,
          'Set-Cookie': `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Secure; Max-Age=0`,
        }
      );
    }

    if (pathname === '/api/auth/me' && request.method === 'GET') {
      const user = await getAuthenticatedAdmin(request, env);
      return json({ user }, 200, noStoreHeaders);
    }

    // Protected Admin Endpoints
    if (pathname.startsWith('/api/admin/')) {
      const admin = await getAuthenticatedAdmin(request, env);
      if (!admin) return json({ error: 'Authentication required' }, 401, noStoreHeaders);

      if (pathname === '/api/admin/change-password' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null;
        if (!body?.currentPassword || !body?.newPassword || body.newPassword.length < 8) {
          return json({ error: 'New password must be at least 8 characters' }, 400, noStoreHeaders);
        }
        const row = await env.DB.prepare('SELECT id, password_hash FROM admin_users WHERE email = ?')
          .bind(admin.email)
          .first<{ id: number; password_hash: string }>();
        if (!row || !(await verifyPasswordHash(body.currentPassword, row.password_hash))) {
          return json({ error: 'Current password is incorrect' }, 401, noStoreHeaders);
        }
        const newHash = bcrypt.hashSync(body.newPassword, 10);
        await env.DB.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').bind(newHash, row.id).run();
        return json({ ok: true }, 200, noStoreHeaders);
      }

      if (pathname === '/api/admin/reconcile-config' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as { products?: Array<Record<string, unknown>> } | null;
        const entries = Array.isArray(body?.products) ? body.products : [];
        if (entries.length === 0) {
          return json(
            {
              inserted: 0,
              updatedConfigOwned: 0,
              skippedDashboardOwned: 0,
              note: 'Send { products: [...] } from products.config.json or run scripts/sync-d1-from-config.ts in CI to reconcile D1.',
            },
            200,
            noStoreHeaders
          );
        }

        let inserted = 0;
        let updatedConfigOwned = 0;
        let skippedDashboardOwned = 0;
        const now = new Date().toISOString();

        for (const entry of entries) {
          const id = String(entry.id || '').trim();
          if (!id) continue;
          const existing = await env.DB.prepare('SELECT id, managed_by FROM products WHERE id = ?')
            .bind(id)
            .first<{ id: string; managed_by: string }>();
          if (existing && existing.managed_by === 'dashboard') {
            skippedDashboardOwned += 1;
            continue;
          }
          const githubRepo = String(entry.githubRepo || '');
          const { owner, repo } = parseGitHubOwnerAndRepo(githubRepo);
          const slug = String(entry.slug || id);

          if (!existing) {
            await env.DB.prepare(
              `INSERT INTO products (
                id, slug, name, name_ar, tagline, tagline_ar, category, description, description_ar,
                icon, cover_image, screenshots_json, github_repo, github_owner, github_repo_name,
                github_releases, live_url, featured, published, release_sync, managed_by,
                is_sample_demo, asset_filter_json, platforms_json, technologies_json,
                version, release_date, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'config', ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(
                id,
                slug,
                String(entry.name || id),
                String(entry.nameAr || entry.name || id),
                String(entry.shortDescription || ''),
                String(entry.shortDescriptionAr || entry.shortDescription || ''),
                String(entry.category || 'other'),
                String(entry.description || ''),
                String(entry.descriptionAr || entry.description || ''),
                String(entry.icon || entry.coverImage || ''),
                String(entry.coverImage || ''),
                JSON.stringify(Array.isArray(entry.screenshots) ? entry.screenshots : []),
                githubRepo,
                owner,
                repo,
                String(entry.githubReleases || (githubRepo ? `${githubRepo}/releases` : '')),
                entry.liveUrl ? String(entry.liveUrl) : null,
                entry.featured ? 1 : 0,
                entry.published === false ? 0 : 1,
                entry.releaseSync === false ? 0 : 1,
                entry.isSampleDemo ? 1 : 0,
                JSON.stringify(entry.assetFilter || {}),
                JSON.stringify(Array.isArray(entry.platforms) ? entry.platforms : ['Web']),
                JSON.stringify(Array.isArray(entry.technologies) ? entry.technologies : []),
                String(entry.version || '1.0.0'),
                now,
                now
              )
              .run();
            inserted += 1;
          } else {
            await env.DB.prepare(
              `UPDATE products SET
                slug = ?, name = ?, name_ar = ?, tagline = ?, tagline_ar = ?, category = ?,
                description = ?, description_ar = ?, icon = ?, cover_image = ?, screenshots_json = ?,
                github_repo = ?, github_owner = ?, github_repo_name = ?, github_releases = ?,
                live_url = ?, featured = ?, published = ?, release_sync = ?, is_sample_demo = ?,
                asset_filter_json = ?, platforms_json = ?, technologies_json = ?, version = ?, updated_at = ?
               WHERE id = ? AND managed_by = 'config'`
            )
              .bind(
                slug,
                String(entry.name || id),
                String(entry.nameAr || entry.name || id),
                String(entry.shortDescription || ''),
                String(entry.shortDescriptionAr || entry.shortDescription || ''),
                String(entry.category || 'other'),
                String(entry.description || ''),
                String(entry.descriptionAr || entry.description || ''),
                String(entry.icon || entry.coverImage || ''),
                String(entry.coverImage || ''),
                JSON.stringify(Array.isArray(entry.screenshots) ? entry.screenshots : []),
                githubRepo,
                owner,
                repo,
                String(entry.githubReleases || (githubRepo ? `${githubRepo}/releases` : '')),
                entry.liveUrl ? String(entry.liveUrl) : null,
                entry.featured ? 1 : 0,
                entry.published === false ? 0 : 1,
                entry.releaseSync === false ? 0 : 1,
                entry.isSampleDemo ? 1 : 0,
                JSON.stringify(entry.assetFilter || {}),
                JSON.stringify(Array.isArray(entry.platforms) ? entry.platforms : ['Web']),
                JSON.stringify(Array.isArray(entry.technologies) ? entry.technologies : []),
                String(entry.version || '1.0.0'),
                now,
                id
              )
              .run();
            updatedConfigOwned += 1;
          }
        }
        return json({ inserted, updatedConfigOwned, skippedDashboardOwned }, 200, noStoreHeaders);
      }

      if (pathname === '/api/admin/upload' && request.method === 'POST') {
        if (!env.BUCKET) return json({ error: 'R2 bucket binding BUCKET is not configured' }, 500, noStoreHeaders);
        const form = await request.formData();
        const file = form.get('image');
        if (!file || typeof file === 'string') return json({ error: 'No image provided' }, 400, noStoreHeaders);

        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
          return json({ error: 'Only PNG, JPEG, WEBP, and GIF images are allowed' }, 400, noStoreHeaders);
        }
        if (file.size > 5 * 1024 * 1024) {
          return json({ error: 'Image size must be under 5 MB' }, 400, noStoreHeaders);
        }

        const safeName = file.name.toLowerCase().replace(/[^a-z0-9.-]/g, '-');
        const key = `${Date.now()}-${safeName}`;
        await env.BUCKET.put(key, await file.arrayBuffer(), {
          httpMetadata: { contentType: file.type },
        });
        return json({ url: `/uploads/${key}` }, 200, noStoreHeaders);
      }

      if (pathname === '/api/admin/products' && request.method === 'POST') {
        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body?.id || !body?.name || !body?.category || !body?.description) {
          return json({ error: 'Missing required product fields' }, 400, noStoreHeaders);
        }
        const id = String(body.id).trim().toLowerCase();
        const slug = String(body.slug || id).trim().toLowerCase();
        if (!/^[a-z0-9-]+$/.test(id) || !/^[a-z0-9-]+$/.test(slug)) {
          return json({ error: 'ID and slug must use lowercase letters, numbers, and hyphens only' }, 400, noStoreHeaders);
        }
        if (
          !isSafeUrlOrPath(body.coverImage || '') ||
          !isSafeUrlOrPath(body.icon || '') ||
          !isSafeUrlOrPath(body.githubRepo || '') ||
          (body.liveUrl && !isSafeUrlOrPath(body.liveUrl))
        ) {
          return json({ error: 'Invalid URL scheme detected' }, 400, noStoreHeaders);
        }

        const conflict = await env.DB.prepare('SELECT id FROM products WHERE id = ? OR slug = ?').bind(id, slug).first();
        if (conflict) return json({ error: 'A product with this ID or URL slug already exists' }, 409, noStoreHeaders);

        const { owner, repo } = parseGitHubOwnerAndRepo(String(body.githubRepo || ''));
        const now = new Date().toISOString();
        await env.DB.prepare(
          `INSERT INTO products (
            id, slug, name, name_ar, tagline, tagline_ar, category, description, description_ar,
            features_json, features_ar_json, icon, cover_image, screenshots_json,
            github_repo, github_owner, github_repo_name, github_releases, live_url,
            featured, published, release_sync, managed_by, is_sample_demo, asset_filter_json,
            platforms_json, technologies_json, system_requirements_json,
            version, release_date, updated_at, developer, license, manual_downloads_json, version_history_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'dashboard', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            id,
            slug,
            String(body.name),
            String(body.nameAr || body.name),
            String(body.tagline || ''),
            String(body.taglineAr || body.tagline || ''),
            String(body.category),
            String(body.description),
            String(body.descriptionAr || body.description),
            JSON.stringify(body.features || []),
            JSON.stringify(body.featuresAr || []),
            String(body.icon || body.coverImage || ''),
            String(body.coverImage || ''),
            JSON.stringify(body.screenshots || []),
            String(body.githubRepo || ''),
            owner,
            repo,
            String(body.githubReleases || (body.githubRepo ? `${String(body.githubRepo).replace(/\/+$/, '')}/releases` : '')),
            body.liveUrl ? String(body.liveUrl) : null,
            body.featured ? 1 : 0,
            body.published === false ? 0 : 1,
            body.releaseSync === false ? 0 : 1,
            JSON.stringify(body.assetFilter || {}),
            JSON.stringify(body.platforms || ['Web']),
            JSON.stringify(body.technologies || []),
            JSON.stringify(body.systemRequirements || {}),
            String(body.version || '1.0.0'),
            String(body.releaseDate || now),
            now,
            String(body.developer || 'Kestrel Forge'),
            String(body.license || 'MIT'),
            JSON.stringify(body.manualDownloads || []),
            JSON.stringify(body.versionHistory || [])
          )
          .run();

        const created = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
        return json(created ? mapProduct(created) : { ok: true }, 201, noStoreHeaders);
      }

      const syncSingleMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)\/sync-github$/);
      if (syncSingleMatch && request.method === 'POST') {
        const id = decodeURIComponent(syncSingleMatch[1]);
        const row = await env.DB.prepare('SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE id = ?')
          .bind(id)
          .first<{ id: string; github_owner: string; github_repo_name: string; asset_filter_json: string }>();
        if (!row) return json({ error: 'Product not found' }, 404, noStoreHeaders);
        const summary = await syncGitHubReleasesD1(
          env,
          row.id,
          row.github_owner,
          row.github_repo_name,
          true,
          safeParseJson(row.asset_filter_json, {})
        );
        return json(summary, 200, noStoreHeaders);
      }

      const prodIdMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)$/);
      if (prodIdMatch && request.method === 'PUT') {
        const id = decodeURIComponent(prodIdMatch[1]);
        const existing = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
        if (!existing) return json({ error: 'Product not found' }, 404, noStoreHeaders);

        const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body?.name || !body?.category || !body?.description) {
          return json({ error: 'Missing required product fields' }, 400, noStoreHeaders);
        }
        const slug = String(body.slug || id).trim().toLowerCase();
        const slugConflict = await env.DB.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').bind(slug, id).first();
        if (slugConflict) return json({ error: 'Another product already uses this URL slug' }, 409, noStoreHeaders);

        const { owner, repo } = parseGitHubOwnerAndRepo(String(body.githubRepo || ''));
        const now = new Date().toISOString();

        await env.DB.prepare(
          `UPDATE products SET
            slug = ?, name = ?, name_ar = ?, tagline = ?, tagline_ar = ?, category = ?,
            description = ?, description_ar = ?, features_json = ?, features_ar_json = ?,
            icon = ?, cover_image = ?, screenshots_json = ?, github_repo = ?, github_owner = ?,
            github_repo_name = ?, github_releases = ?, live_url = ?, featured = ?, published = ?,
            release_sync = ?, managed_by = 'dashboard', asset_filter_json = ?, platforms_json = ?,
            technologies_json = ?, system_requirements_json = ?, version = ?, release_date = ?,
            updated_at = ?, developer = ?, license = ?, manual_downloads_json = ?, version_history_json = ?
           WHERE id = ?`
        )
          .bind(
            slug,
            String(body.name),
            String(body.nameAr || body.name),
            String(body.tagline || ''),
            String(body.taglineAr || body.tagline || ''),
            String(body.category),
            String(body.description),
            String(body.descriptionAr || body.description),
            JSON.stringify(body.features || []),
            JSON.stringify(body.featuresAr || []),
            String(body.icon || body.coverImage || ''),
            String(body.coverImage || ''),
            JSON.stringify(body.screenshots || []),
            String(body.githubRepo || ''),
            owner,
            repo,
            String(body.githubReleases || (body.githubRepo ? `${String(body.githubRepo).replace(/\/+$/, '')}/releases` : '')),
            body.liveUrl ? String(body.liveUrl) : null,
            body.featured ? 1 : 0,
            body.published === false ? 0 : 1,
            body.releaseSync === false ? 0 : 1,
            JSON.stringify(body.assetFilter || {}),
            JSON.stringify(body.platforms || ['Web']),
            JSON.stringify(body.technologies || []),
            JSON.stringify(body.systemRequirements || {}),
            String(body.version || '1.0.0'),
            String(body.releaseDate || existing.release_date),
            now,
            String(body.developer || 'Kestrel Forge'),
            String(body.license || 'MIT'),
            JSON.stringify(body.manualDownloads || []),
            JSON.stringify(body.versionHistory || []),
            id
          )
          .run();

        const updated = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first();
        return json(updated ? mapProduct(updated) : { ok: true }, 200, noStoreHeaders);
      }

      if (prodIdMatch && request.method === 'DELETE') {
        const id = decodeURIComponent(prodIdMatch[1]);
        const result = await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
        if (!result.meta.changes) return json({ error: 'Product not found' }, 404, noStoreHeaders);
        return json({ ok: true }, 200, noStoreHeaders);
      }

      if (pathname === '/api/admin/sync-all-github' && request.method === 'POST') {
        const rows = await env.DB.prepare(
          'SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE release_sync = 1 AND github_owner != "" AND github_repo_name != ""'
        ).all<{ id: string; github_owner: string; github_repo_name: string; asset_filter_json: string }>();
        const results = [];
        for (const r of rows.results) {
          const summary = await syncGitHubReleasesD1(
            env,
            r.id,
            r.github_owner,
            r.github_repo_name,
            true,
            safeParseJson(r.asset_filter_json, {})
          );
          results.push({ productId: r.id, status: summary.fetchStatus, latestTag: summary.latestTag });
        }
        return json({ synced: results.length, results }, 200, noStoreHeaders);
      }

      if (pathname === '/api/admin/analytics' && request.method === 'GET') {
        const stats = await computeStatsD1(env);
        const days: Array<{ date: string; direct: number; github: number; web: number; total: number }> = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - i);
          days.push({ date: d.toISOString().slice(0, 10), direct: 0, github: 0, web: 0, total: 0 });
        }

        const [rawDaily, byProduct, byPlatform, byVersion, byFormat, recentEvents] = await Promise.all([
          env.DB.prepare(
            `SELECT substr(created_at, 1, 10) as day, source_type, COUNT(*) as count
             FROM download_events WHERE created_at >= date('now', '-14 days') GROUP BY day, source_type`
          ).all<{ day: string; source_type: string; count: number }>(),
          env.DB.prepare(
            `SELECT p.id as productId, p.name as productName, p.category as category,
              SUM(CASE WHEN e.source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
              SUM(CASE WHEN e.source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
              SUM(CASE WHEN e.source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web,
              COUNT(e.id) as total
             FROM products p LEFT JOIN download_events e ON e.product_id = p.id
             GROUP BY p.id ORDER BY total DESC, p.name ASC`
          ).all(),
          env.DB.prepare(
            `SELECT CASE
               WHEN UPPER(file_format) IN ('APK', 'AAB') THEN 'Android'
               WHEN UPPER(file_format) IN ('EXE', 'MSI') THEN 'Windows'
               WHEN UPPER(file_format) = 'WEB' THEN 'Web'
               ELSE 'Cross-platform'
             END as platform, COUNT(*) as count
             FROM download_events GROUP BY platform ORDER BY count DESC`
          ).all(),
          env.DB.prepare(
            `SELECT CASE WHEN version = '' THEN 'Unspecified' ELSE version END as version, COUNT(*) as count
             FROM download_events GROUP BY version ORDER BY count DESC LIMIT 10`
          ).all(),
          env.DB.prepare(
            'SELECT file_format as format, COUNT(*) as count FROM download_events GROUP BY file_format ORDER BY count DESC'
          ).all(),
          env.DB.prepare(
            `SELECT e.id, e.product_id as productId, p.name as productName,
              e.file_name as fileName, e.file_format as fileFormat,
              e.source_type as sourceType, e.version, e.created_at as createdAt
             FROM download_events e JOIN products p ON p.id = e.product_id
             ORDER BY e.id DESC LIMIT 30`
          ).all(),
        ]);

        for (const r of rawDaily.results) {
          const bucket = days.find((d) => d.date === r.day);
          if (!bucket) continue;
          if (r.source_type === 'direct_file') bucket.direct += r.count;
          if (r.source_type === 'github_release_click') bucket.github += r.count;
          if (r.source_type === 'web_app_launch') bucket.web += r.count;
          bucket.total += r.count;
        }

        return json(
          {
            stats,
            dailySeries: days,
            byProduct: byProduct.results,
            byPlatform: byPlatform.results,
            byVersion: byVersion.results,
            byFormat: byFormat.results,
            recentEvents: recentEvents.results,
          },
          200,
          noStoreHeaders
        );
      }

      if (pathname === '/api/admin/messages' && request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT * FROM messages ORDER BY id DESC').all();
        return json(
          rows.results.map((r) => ({
            id: Number(r.id),
            type: r.type,
            productId: r.product_id ? String(r.product_id) : null,
            name: String(r.name),
            email: String(r.email),
            subject: String(r.subject),
            message: String(r.message),
            status: String(r.status),
            createdAt: String(r.created_at),
          })),
          200,
          noStoreHeaders
        );
      }

      const msgPatchMatch = pathname.match(/^\/api\/admin\/messages\/(\d+)$/);
      if (msgPatchMatch && request.method === 'PATCH') {
        const body = (await request.json().catch(() => null)) as { status?: string } | null;
        const status = body?.status === 'open' ? 'open' : 'resolved';
        const res = await env.DB.prepare('UPDATE messages SET status = ? WHERE id = ?')
          .bind(status, Number(msgPatchMatch[1]))
          .run();
        if (!res.meta.changes) return json({ error: 'Message not found' }, 404, noStoreHeaders);
        return json({ ok: true }, 200, noStoreHeaders);
      }
    }

    if (pathname.startsWith('/api/')) {
      return json({ error: 'API route not found' }, 404);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
