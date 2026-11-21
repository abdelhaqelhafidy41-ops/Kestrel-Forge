import fs from 'fs';
import path from 'path';

interface ConfigProduct {
  id: string;
  slug?: string;
  name: string;
  nameAr?: string;
  shortDescription?: string;
  shortDescriptionAr?: string;
  category: string;
  description: string;
  descriptionAr?: string;
  icon?: string;
  coverImage?: string;
  screenshots?: string[];
  platforms?: string[];
  technologies?: string[];
  githubRepo?: string;
  githubReleases?: string;
  liveUrl?: string | null;
  featured?: boolean;
  published?: boolean;
  releaseSync?: boolean;
  assetFilter?: { extensions?: string[]; pattern?: string };
  version?: string;
  isSampleDemo?: boolean;
}

function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseRepo(repoUrl: string): { owner: string; repo: string } {
  const cleaned = repoUrl.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!m) return { owner: '', repo: '' };
  return { owner: m[1], repo: m[2] };
}

function main() {
  const rootDir = process.cwd();
  const configPath = path.resolve(rootDir, 'products.config.json');
  const outPath = path.resolve(rootDir, 'data', 'd1-sync.sql');

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { products: ConfigProduct[] };
  const now = new Date().toISOString();
  const statements: string[] = [
    '-- Generated from products.config.json',
    '-- Preserves dashboard-managed rows (WHERE products.managed_by = \'config\')',
  ];

  for (const p of parsed.products) {
    const { owner, repo } = parseRepo(p.githubRepo || '');
    const slug = p.slug || p.id;
    const releases = p.githubReleases || (p.githubRepo ? `${p.githubRepo.replace(/\/+$/, '')}/releases` : '');

    statements.push(`
INSERT INTO products (
  id, slug, name, name_ar, tagline, tagline_ar, category, description, description_ar,
  icon, cover_image, screenshots_json, github_repo, github_owner, github_repo_name,
  github_releases, live_url, featured, published, release_sync, managed_by,
  is_sample_demo, asset_filter_json, platforms_json, technologies_json,
  version, release_date, updated_at
) VALUES (
  ${sqlString(p.id)},
  ${sqlString(slug)},
  ${sqlString(p.name)},
  ${sqlString(p.nameAr || p.name)},
  ${sqlString(p.shortDescription || '')},
  ${sqlString(p.shortDescriptionAr || p.shortDescription || '')},
  ${sqlString(p.category)},
  ${sqlString(p.description)},
  ${sqlString(p.descriptionAr || p.description)},
  ${sqlString(p.icon || p.coverImage || '')},
  ${sqlString(p.coverImage || '')},
  ${sqlString(JSON.stringify(p.screenshots || []))},
  ${sqlString(p.githubRepo || '')},
  ${sqlString(owner)},
  ${sqlString(repo)},
  ${sqlString(releases)},
  ${p.liveUrl ? sqlString(p.liveUrl) : 'NULL'},
  ${p.featured ? 1 : 0},
  ${p.published === false ? 0 : 1},
  ${p.releaseSync === false ? 0 : 1},
  'config',
  ${p.isSampleDemo ? 1 : 0},
  ${sqlString(JSON.stringify(p.assetFilter || {}))},
  ${sqlString(JSON.stringify(p.platforms || ['Web']))},
  ${sqlString(JSON.stringify(p.technologies || []))},
  ${sqlString(p.version || '1.0.0')},
  ${sqlString(now)},
  ${sqlString(now)}
)
ON CONFLICT(id) DO UPDATE SET
  slug = excluded.slug,
  name = excluded.name,
  name_ar = excluded.name_ar,
  tagline = excluded.tagline,
  tagline_ar = excluded.tagline_ar,
  category = excluded.category,
  description = excluded.description,
  description_ar = excluded.description_ar,
  icon = excluded.icon,
  cover_image = excluded.cover_image,
  screenshots_json = excluded.screenshots_json,
  github_repo = excluded.github_repo,
  github_owner = excluded.github_owner,
  github_repo_name = excluded.github_repo_name,
  github_releases = excluded.github_releases,
  live_url = excluded.live_url,
  featured = excluded.featured,
  published = excluded.published,
  release_sync = excluded.release_sync,
  is_sample_demo = excluded.is_sample_demo,
  asset_filter_json = excluded.asset_filter_json,
  platforms_json = excluded.platforms_json,
  technologies_json = excluded.technologies_json,
  version = excluded.version,
  updated_at = excluded.updated_at
WHERE products.managed_by = 'config';`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, statements.join('\n') + '\n', 'utf-8');
  console.log(`Generated D1 config sync SQL at ${outPath} (${parsed.products.length} products).`);
}

main();
