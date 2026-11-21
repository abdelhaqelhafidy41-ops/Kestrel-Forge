import fs from 'fs';
import path from 'path';
import { db } from './db.ts';
import type { AssetFilterConfig, GitHubAsset, GitHubCacheSummary, GitHubRelease } from '../src/types/product.ts';

const CACHE_TTL_MS = (Number(process.env.GITHUB_CACHE_TTL_MINUTES) || 15) * 60 * 1000;

export function inferAssetFormat(fileName: string): string {
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

export function inferPlatformHint(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.apk') || lower.endsWith('.aab') || lower.includes('android')) return 'Android';
  if (lower.endsWith('.exe') || lower.endsWith('.msi') || lower.includes('win64') || lower.includes('win32') || lower.includes('windows')) return 'Windows';
  if (lower.endsWith('.dmg') || lower.endsWith('.pkg') || lower.includes('macos') || lower.includes('darwin')) return 'macOS';
  if (lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.rpm') || lower.includes('linux')) return 'Linux';
  return 'Cross-platform';
}

export function filterAssets(assets: GitHubAsset[], filter?: AssetFilterConfig | null): GitHubAsset[] {
  if (!filter) return assets;
  const exts = Array.isArray(filter.extensions)
    ? filter.extensions.map((e) => e.trim().toLowerCase().replace(/^\./, '')).filter(Boolean)
    : [];
  const pattern = (filter.pattern || '').trim().toLowerCase();

  return assets.filter((asset) => {
    const lowerName = asset.name.toLowerCase();
    if (exts.length > 0 && !exts.some((ext) => lowerName.endsWith(`.${ext}`))) {
      return false;
    }
    if (pattern && !lowerName.includes(pattern)) {
      return false;
    }
    return true;
  });
}

function readSnapshotFallback(productId: string): GitHubCacheSummary | null {
  try {
    const snapshotPath = path.resolve(process.cwd(), 'data', 'releases-snapshot.json');
    if (!fs.existsSync(snapshotPath)) return null;
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8')) as {
      releases?: Array<{
        productId: string;
        repoFullName: string;
        latestTag: string | null;
        publishedAt: string | null;
        htmlUrl: string | null;
        assets: Array<{ name: string; sizeBytes: number; downloadUrl: string; downloadCount: number }>;
        status: string;
        note?: string;
      }>;
    };
    const entry = raw.releases?.find((r) => r.productId === productId);
    if (!entry || entry.status !== 'ok') return null;

    const mappedAssets: GitHubAsset[] = (entry.assets || []).map((a, idx) => ({
      id: idx + 1,
      name: a.name,
      size: a.sizeBytes,
      downloadUrl: a.downloadUrl,
      contentType: 'application/octet-stream',
      downloadCount: a.downloadCount,
      format: inferAssetFormat(a.name),
      platformHint: inferPlatformHint(a.name),
    }));

    return {
      repoFullName: entry.repoFullName,
      latestTag: entry.latestTag,
      releaseName: entry.latestTag,
      releaseNotes: null,
      publishedAt: entry.publishedAt,
      htmlUrl: entry.htmlUrl,
      assets: mappedAssets,
      allReleases: entry.latestTag
        ? [
            {
              id: 1,
              tagName: entry.latestTag,
              name: entry.latestTag,
              body: '',
              publishedAt: entry.publishedAt || '',
              htmlUrl: entry.htmlUrl || '',
              prerelease: false,
              assets: mappedAssets,
            },
          ]
        : [],
      fetchedAt: entry.publishedAt,
      fetchStatus: 'ok',
      errorMessage: null,
    };
  } catch {
    return null;
  }
}

export function getCachedGitHubSummary(productId: string): GitHubCacheSummary | null {
  const row = db
    .prepare('SELECT * FROM github_releases_cache WHERE product_id = ?')
    .get(productId) as Record<string, unknown> | undefined;

  if (!row) return readSnapshotFallback(productId);

  return {
    repoFullName: String(row.repo_full_name || ''),
    latestTag: row.latest_tag ? String(row.latest_tag) : null,
    releaseName: row.release_name ? String(row.release_name) : null,
    releaseNotes: row.release_notes ? String(row.release_notes) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    htmlUrl: row.html_url ? String(row.html_url) : null,
    assets: parseJson(row.assets_json, []),
    allReleases: parseJson(row.all_releases_json, []),
    fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
    fetchStatus: (row.fetch_status as GitHubCacheSummary['fetchStatus']) || 'error',
    errorMessage: row.error_message ? String(row.error_message) : null,
  };
}

export async function syncProductGitHubReleases(
  productId: string,
  owner: string,
  repo: string,
  force = false,
  assetFilter?: AssetFilterConfig | null
): Promise<GitHubCacheSummary> {
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
  const existing = getCachedGitHubSummary(productId);

  if (!force && existing && existing.fetchedAt && existing.repoFullName === repoFullName) {
    const age = Date.now() - new Date(existing.fetchedAt).getTime();
    if (age < CACHE_TTL_MS && existing.fetchStatus === 'ok') {
      return existing;
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Kestrel-Forge-Marketplace/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const token = process.env.GITHUB_TOKEN?.trim();
  if (token && token.length > 5 && token !== '.' && !token.startsWith('replace-')) {
    headers.Authorization = `Bearer ${token}`;
  }

  const now = new Date().toISOString();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=8`,
      { headers, signal: controller.signal }
    );
    clearTimeout(timeout);

    if (response.status === 404) {
      const summary: GitHubCacheSummary = {
        repoFullName,
        latestTag: existing?.latestTag || null,
        releaseName: existing?.releaseName || null,
        releaseNotes: existing?.releaseNotes || null,
        publishedAt: existing?.publishedAt || null,
        htmlUrl: existing?.htmlUrl || null,
        assets: existing?.assets || [],
        allReleases: existing?.allReleases || [],
        fetchedAt: now,
        fetchStatus: 'not_found',
        errorMessage: `GitHub repository "${repoFullName}" was not found or has no public releases.`,
      };
      upsertCache(productId, summary);
      return summary;
    }

    if (response.status === 403 || response.status === 429) {
      const summary: GitHubCacheSummary = {
        repoFullName,
        latestTag: existing?.latestTag || null,
        releaseName: existing?.releaseName || null,
        releaseNotes: existing?.releaseNotes || null,
        publishedAt: existing?.publishedAt || null,
        htmlUrl: existing?.htmlUrl || null,
        assets: existing?.assets || [],
        allReleases: existing?.allReleases || [],
        fetchedAt: now,
        fetchStatus: 'rate_limited',
        errorMessage: 'GitHub API rate limit reached. Configure GITHUB_TOKEN on the server for higher limits.',
      };
      upsertCache(productId, summary);
      return summary;
    }

    if (!response.ok) {
      throw new Error(`GitHub API responded with HTTP ${response.status}`);
    }

    const rawReleases = (await response.json()) as Array<Record<string, unknown>>;
    const releases: GitHubRelease[] = rawReleases
      .filter((r) => !r.draft)
      .map((r) => {
        const rawAssets = Array.isArray(r.assets) ? (r.assets as Array<Record<string, unknown>>) : [];
        const mappedAssets: GitHubAsset[] = rawAssets.map((a) => ({
          id: Number(a.id),
          name: String(a.name),
          size: Number(a.size || 0),
          downloadUrl: String(a.browser_download_url),
          contentType: String(a.content_type || 'application/octet-stream'),
          downloadCount: Number(a.download_count || 0),
          format: inferAssetFormat(String(a.name)),
          platformHint: inferPlatformHint(String(a.name)),
        }));

        const filteredAssets = filterAssets(mappedAssets, assetFilter);

        return {
          id: Number(r.id),
          tagName: String(r.tag_name || ''),
          name: String(r.name || r.tag_name || 'Release'),
          body: String(r.body || ''),
          publishedAt: String(r.published_at || r.created_at || now),
          htmlUrl: String(r.html_url || ''),
          prerelease: Boolean(r.prerelease),
          assets: filteredAssets.length > 0 ? filteredAssets : mappedAssets,
        };
      });

    const latest = releases.find((r) => !r.prerelease) || releases[0] || null;

    const summary: GitHubCacheSummary = {
      repoFullName,
      latestTag: latest?.tagName || null,
      releaseName: latest?.name || null,
      releaseNotes: latest?.body || null,
      publishedAt: latest?.publishedAt || null,
      htmlUrl: latest?.htmlUrl || null,
      assets: latest?.assets || [],
      allReleases: releases,
      fetchedAt: now,
      fetchStatus: 'ok',
      errorMessage: releases.length === 0 ? 'Repository exists but has no published releases yet.' : null,
    };

    upsertCache(productId, summary);

    if (latest?.tagName) {
      const normalizedVersion = latest.tagName.replace(/^v/i, '');
      db.prepare('UPDATE products SET version = ?, updated_at = ? WHERE id = ?').run(
        normalizedVersion,
        latest.publishedAt || now,
        productId
      );
    }

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach GitHub API';
    const summary: GitHubCacheSummary = {
      repoFullName,
      latestTag: existing?.latestTag || null,
      releaseName: existing?.releaseName || null,
      releaseNotes: existing?.releaseNotes || null,
      publishedAt: existing?.publishedAt || null,
      htmlUrl: existing?.htmlUrl || null,
      assets: existing?.assets || [],
      allReleases: existing?.allReleases || [],
      fetchedAt: now,
      fetchStatus: 'error',
      errorMessage: message,
    };
    upsertCache(productId, summary);
    return summary;
  }
}

function upsertCache(productId: string, summary: GitHubCacheSummary): void {
  db.prepare(`
    INSERT INTO github_releases_cache (
      product_id, repo_full_name, latest_tag, release_name, release_notes,
      published_at, html_url, assets_json, all_releases_json,
      fetched_at, fetch_status, error_message
    ) VALUES (
      @productId, @repoFullName, @latestTag, @releaseName, @releaseNotes,
      @publishedAt, @htmlUrl, @assetsJson, @allReleasesJson,
      @fetchedAt, @fetchStatus, @errorMessage
    )
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
      error_message = excluded.error_message
  `).run({
    productId,
    repoFullName: summary.repoFullName,
    latestTag: summary.latestTag,
    releaseName: summary.releaseName,
    releaseNotes: summary.releaseNotes,
    publishedAt: summary.publishedAt,
    htmlUrl: summary.htmlUrl,
    assetsJson: JSON.stringify(summary.assets),
    allReleasesJson: JSON.stringify(summary.allReleases),
    fetchedAt: summary.fetchedAt || new Date().toISOString(),
    fetchStatus: summary.fetchStatus,
    errorMessage: summary.errorMessage || null,
  });
}

function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string' || !val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}
