import fs from 'fs';
import path from 'path';

interface ConfigProduct {
  id: string;
  slug: string;
  githubRepo?: string;
  releaseSync?: boolean;
  isSampleDemo?: boolean;
  assetFilter?: {
    extensions?: string[];
    pattern?: string;
  };
}

interface SnapshotRelease {
  productId: string;
  repoFullName: string;
  latestTag: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  assets: Array<{
    name: string;
    sizeBytes: number;
    downloadUrl: string;
    downloadCount: number;
  }>;
  status: 'ok' | 'not_found' | 'rate_limited' | 'error' | 'skipped';
  note?: string;
}

function parseRepo(url?: string): { owner: string; repo: string } | null {
  if (!url) return null;
  const cleaned = url.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

async function main() {
  const rootDir = process.cwd();
  const configPath = path.resolve(rootDir, 'products.config.json');
  const snapshotPath = path.resolve(rootDir, 'data', 'releases-snapshot.json');
  const strict = process.argv.includes('--strict');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { products: ConfigProduct[] };
  const token = process.env.GITHUB_TOKEN?.trim();

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Kestrel-Forge-Release-Sync',
  };
  if (token && token.length > 5 && token !== '.' && !token.startsWith('replace-')) {
    headers.Authorization = `Bearer ${token}`;
  }

  const snapshots: SnapshotRelease[] = [];
  let fatalErrors = 0;

  for (const product of config.products) {
    if (product.releaseSync === false) {
      snapshots.push({
        productId: product.id,
        repoFullName: '',
        latestTag: null,
        publishedAt: null,
        htmlUrl: null,
        assets: [],
        status: 'skipped',
        note: 'releaseSync disabled',
      });
      continue;
    }

    const parsed = parseRepo(product.githubRepo);
    if (!parsed) {
      snapshots.push({
        productId: product.id,
        repoFullName: '',
        latestTag: null,
        publishedAt: null,
        htmlUrl: null,
        assets: [],
        status: 'skipped',
        note: 'No valid GitHub repository URL',
      });
      continue;
    }

    const repoFullName = `${parsed.owner}/${parsed.repo}`;
    try {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}/releases?per_page=3`, { headers });
      if (!res.ok) {
        const status = res.status === 404 ? 'not_found' : res.status === 403 ? 'rate_limited' : 'error';
        if (strict && !product.isSampleDemo) fatalErrors += 1;
        snapshots.push({
          productId: product.id,
          repoFullName,
          latestTag: null,
          publishedAt: null,
          htmlUrl: `https://github.com/${repoFullName}/releases`,
          assets: [],
          status,
          note: `GitHub API HTTP ${res.status}`,
        });
        continue;
      }

      const releases = (await res.json()) as Array<{
        draft: boolean;
        tag_name: string;
        published_at: string;
        html_url: string;
        assets: Array<{
          name: string;
          size: number;
          browser_download_url: string;
          download_count: number;
        }>;
      }>;

      const latest = releases.find((r) => !r.draft);
      const allowedExt = (product.assetFilter?.extensions || []).map((e) => e.toLowerCase().replace(/^\./, ''));
      const pattern = (product.assetFilter?.pattern || '').toLowerCase();

      const filteredAssets = (latest?.assets || [])
        .filter((a) => {
          const lower = a.name.toLowerCase();
          if (pattern && !lower.includes(pattern)) return false;
          if (allowedExt.length > 0 && !allowedExt.some((ext) => lower.endsWith(`.${ext}`))) return false;
          return true;
        })
        .map((a) => ({
          name: a.name,
          sizeBytes: a.size,
          downloadUrl: a.browser_download_url,
          downloadCount: a.download_count || 0,
        }));

      snapshots.push({
        productId: product.id,
        repoFullName,
        latestTag: latest?.tag_name || null,
        publishedAt: latest?.published_at || null,
        htmlUrl: latest?.html_url || `https://github.com/${repoFullName}/releases`,
        assets: filteredAssets,
        status: 'ok',
      });
    } catch (err) {
      if (strict && !product.isSampleDemo) fatalErrors += 1;
      snapshots.push({
        productId: product.id,
        repoFullName,
        latestTag: null,
        publishedAt: null,
        htmlUrl: `https://github.com/${repoFullName}/releases`,
        assets: [],
        status: 'error',
        note: err instanceof Error ? err.message : 'Fetch error',
      });
    }
  }

  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
  const nextSerialized = JSON.stringify({ releases: snapshots }, null, 2) + '\n';
  const prevSerialized = fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf-8') : '';

  if (nextSerialized !== prevSerialized) {
    fs.writeFileSync(snapshotPath, nextSerialized, 'utf-8');
    console.log(`Updated ${snapshotPath} (${snapshots.length} entries).`);
  } else {
    console.log('No release changes detected; snapshot unchanged.');
  }

  if (fatalErrors > 0) {
    console.error(`Strict sync failed with ${fatalErrors} errors.`);
    process.exit(1);
  }
}

main();
