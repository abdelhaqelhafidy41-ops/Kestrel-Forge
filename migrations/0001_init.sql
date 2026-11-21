-- Kestrel Forge Marketplace — Cloudflare D1 Initial Schema Migration
-- Apply locally: npx wrangler d1 migrations apply kestrel-forge-db --local
-- Apply remote:  npx wrangler d1 migrations apply kestrel-forge-db --remote

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description TEXT NOT NULL,
  description_ar TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  tagline_ar TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  description_ar TEXT NOT NULL DEFAULT '',
  features_json TEXT NOT NULL DEFAULT '[]',
  features_ar_json TEXT NOT NULL DEFAULT '[]',
  icon TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL DEFAULT '',
  screenshots_json TEXT NOT NULL DEFAULT '[]',
  github_repo TEXT NOT NULL DEFAULT '',
  github_owner TEXT NOT NULL DEFAULT '',
  github_repo_name TEXT NOT NULL DEFAULT '',
  github_releases TEXT NOT NULL DEFAULT '',
  live_url TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  release_sync INTEGER NOT NULL DEFAULT 1,
  managed_by TEXT NOT NULL DEFAULT 'config',
  is_sample_demo INTEGER NOT NULL DEFAULT 0,
  asset_filter_json TEXT NOT NULL DEFAULT '{}',
  platforms_json TEXT NOT NULL DEFAULT '[]',
  technologies_json TEXT NOT NULL DEFAULT '[]',
  system_requirements_json TEXT NOT NULL DEFAULT '{}',
  version TEXT NOT NULL DEFAULT '1.0.0',
  release_date TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  developer TEXT NOT NULL DEFAULT 'Kestrel Forge',
  license TEXT NOT NULL DEFAULT 'MIT',
  manual_downloads_json TEXT NOT NULL DEFAULT '[]',
  version_history_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS github_releases_cache (
  product_id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  latest_tag TEXT,
  release_name TEXT,
  release_notes TEXT,
  published_at TEXT,
  html_url TEXT,
  assets_json TEXT NOT NULL DEFAULT '[]',
  all_releases_json TEXT NOT NULL DEFAULT '[]',
  fetched_at TEXT NOT NULL,
  fetch_status TEXT NOT NULL,
  error_message TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS download_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_format TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('direct_file', 'github_release_click', 'web_app_launch')),
  version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('contact', 'bug_report')),
  product_id TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_download_events_product ON download_events(product_id);
CREATE INDEX IF NOT EXISTS idx_download_events_created ON download_events(created_at);

INSERT OR IGNORE INTO categories (id, slug, name, name_ar, description, description_ar, sort_order) VALUES
  ('games', 'games', 'Video Games', 'ألعاب الفيديو', 'Standalone PC and tactical indie titles built with custom engines and deterministic physics.', 'ألعاب مستقلة للحاسوب مبنية بمحركات مخصصة وفيزياء دقيقة.', 1),
  ('android', 'android', 'Android Applications', 'تطبيقات أندرويد', 'Signed APK utilities and offline-first mobile companions engineered for speed and privacy.', 'تطبيقات أندرويد بصيغة APK موقعة ومصممة للأداء العالي والخصوصية.', 2),
  ('windows', 'windows', 'Windows Software', 'برامج ويندوز', 'Native desktop productivity tools packaged as EXE installers, MSI packages, and portable ZIPs.', 'برامج سطح مكتب أصلية لنظام ويندوز بصيغ EXE و MSI وملفات محمولة ZIP.', 3),
  ('web', 'web', 'Web Applications', 'تطبيقات الويب', 'Interactive browser tools, WebGL sandboxes, and installable progressive web applications.', 'أدوات ويب تفاعلية وبيئات تجريبية وتطبيقات ويب تقدمية تعمل مباشرة في المتصفح.', 4),
  ('other', 'other', 'Developer Tools & SDKs', 'أدوات المطورين والحزم', 'Command-line utilities, shader packs, and cross-platform build scripts.', 'أدوات سطر الأوامر وحزم التطوير والبرمجيات المساعدة متعددة المنصات.', 5);
