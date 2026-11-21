import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Product, CategoryInfo } from '../src/types/product.ts';

function resolvePrimaryDbPath(): string {
  const defaultPath = path.resolve(process.cwd(), 'data', 'marketplace.db');
  const raw = process.env.DATABASE_PATH?.trim();
  if (!raw || raw === '.' || raw === '..') {
    return defaultPath;
  }
  const resolved = path.resolve(raw);
  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return path.join(resolved, 'marketplace.db');
    }
  } catch {
    return defaultPath;
  }
  return resolved;
}

function openDatabase(): Database.Database {
  const primaryPath = resolvePrimaryDbPath();
  const fallbackPath = path.join(os.tmpdir(), 'kestrel-forge-marketplace.db');

  for (const candidate of [primaryPath, fallbackPath]) {
    try {
      const dir = path.dirname(candidate);
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      if (fs.existsSync(candidate)) {
        fs.accessSync(candidate, fs.constants.R_OK | fs.constants.W_OK);
      }
      const conn = new Database(candidate);
      conn.pragma('journal_mode = WAL');
      conn.pragma('foreign_keys = ON');
      return conn;
    } catch (err) {
      if (candidate === fallbackPath) {
        throw err;
      }
      console.warn(`Warning: unable to open SQLite DB at ${candidate}, falling back to ${fallbackPath}:`, err);
    }
  }

  throw new Error('Failed to open SQLite database');
}

export const db = openDatabase();

function ensureColumn(table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function initDatabase(): void {
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_download_events_product ON download_events(product_id);
    CREATE INDEX IF NOT EXISTS idx_download_events_created ON download_events(created_at);
  `);

  // Safe migrations for databases created in earlier turns
  ensureColumn('products', 'slug', 'TEXT');
  ensureColumn('products', 'published', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('products', 'release_sync', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('products', 'managed_by', "TEXT NOT NULL DEFAULT 'config'");
  ensureColumn('products', 'is_sample_demo', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('products', 'asset_filter_json', "TEXT NOT NULL DEFAULT '{}'");
  db.exec(`UPDATE products SET slug = id WHERE slug IS NULL OR slug = ''`);

  seedCategories();
  seedAdminUser();
  seedProducts();
}

function seedCategories(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c;
  if (count > 0) return;

  const categories: Array<CategoryInfo & { sortOrder: number }> = [
    {
      id: 'games',
      slug: 'games',
      name: 'Video Games',
      nameAr: 'ألعاب الفيديو',
      description: 'Standalone PC and tactical indie titles built with custom engines and deterministic physics.',
      descriptionAr: 'ألعاب مستقلة للحاسوب مبنية بمحركات مخصصة وفيزياء دقيقة.',
      sortOrder: 1,
    },
    {
      id: 'android',
      slug: 'android',
      name: 'Android Applications',
      nameAr: 'تطبيقات أندرويد',
      description: 'Signed APK utilities and offline-first mobile companions engineered for speed and privacy.',
      descriptionAr: 'تطبيقات أندرويد بصيغة APK موقعة ومصممة للأداء العالي والخصوصية.',
      sortOrder: 2,
    },
    {
      id: 'windows',
      slug: 'windows',
      name: 'Windows Software',
      nameAr: 'برامج ويندوز',
      description: 'Native desktop productivity tools packaged as EXE installers, MSI packages, and portable ZIPs.',
      descriptionAr: 'برامج سطح مكتب أصلية لنظام ويندوز بصيغ EXE و MSI وملفات محمولة ZIP.',
      sortOrder: 3,
    },
    {
      id: 'web',
      slug: 'web',
      name: 'Web Applications',
      nameAr: 'تطبيقات الويب',
      description: 'Interactive browser tools, WebGL sandboxes, and installable progressive web applications.',
      descriptionAr: 'أدوات ويب تفاعلية وبيئات تجريبية وتطبيقات ويب تقدمية تعمل مباشرة في المتصفح.',
      sortOrder: 4,
    },
    {
      id: 'other',
      slug: 'other',
      name: 'Developer Tools & SDKs',
      nameAr: 'أدوات المطورين والحزم',
      description: 'Command-line utilities, shader packs, and cross-platform build scripts.',
      descriptionAr: 'أدوات سطر الأوامر وحزم التطوير والبرمجيات المساعدة متعددة المنصات.',
      sortOrder: 5,
    },
  ];

  const stmt = db.prepare(`
    INSERT INTO categories (id, slug, name, name_ar, description, description_ar, sort_order)
    VALUES (@id, @slug, @name, @nameAr, @description, @descriptionAr, @sortOrder)
  `);
  for (const cat of categories) {
    stmt.run(cat);
  }
}

function seedAdminUser(): void {
  const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD;
  const count = (db.prepare('SELECT COUNT(*) as c FROM admin_users').get() as { c: number }).c;

  if (count === 0) {
    const email = envEmail || 'admin@kestrelforge.dev';
    const password = envPassword || 'KestrelAdmin2026!';
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(`
      INSERT INTO admin_users (email, password_hash, role, created_at)
      VALUES (?, ?, 'admin', ?)
    `).run(email, hash, new Date().toISOString());
    return;
  }

  // If ADMIN_EMAIL + ADMIN_PASSWORD are configured in environment and that admin account
  // does not exist yet (e.g., DB was previously seeded with the default address), create it.
  if (envEmail && envPassword) {
    const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(envEmail);
    if (!existing) {
      const hash = bcrypt.hashSync(envPassword, 10);
      db.prepare(`
        INSERT INTO admin_users (email, password_hash, role, created_at)
        VALUES (?, ?, 'admin', ?)
      `).run(envEmail, hash, new Date().toISOString());
    }
  }
}

function seedProducts(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c;
  if (count > 0) return;

  const now = '2026-11-12T10:00:00.000Z';
  const seeded = [
    {
      id: 'stargazer-echoes-of-orion',
      slug: 'stargazer-echoes-of-orion',
      name: 'Stargazer: Echoes of Orion',
      nameAr: 'ستارغيزر: أصداء أوريون',
      tagline: 'Orbital flight & deep-space salvage simulation with Newtonian thrust physics.',
      taglineAr: 'محاكاة طيران مداري واستكشاف فضائي بفيزياء نيوتونية دقيقة.',
      category: 'games',
      description:
        'Stargazer: Echoes of Orion places you at the helm of an independent salvage interceptor charting derelict orbital stations around a ringed gas giant. Manage fuel vectors, dock with rotating debris fields, decode black-box telemetry, and upgrade modular reactor subsystems without arcade flight assists.',
      descriptionAr:
        'تضعك لعبة ستارغيزر: أصداء أوريون في قمرة قيادة مركبة استكشاف وإنقاذ مدارية حول عملاق غازي حلقي. تحكم في متجهات الدفع، التحم مع المحطات المهجورة، وفك تشفير سجلات الرحلات في تجربة فيزيائية متكاملة.',
      features: [
        'Full 6-DOF Newtonian flight model with optional orbital autopilot stabilization',
        '14 hand-crafted derelict orbital sectors with dynamic lighting and volumetric ring dust',
        'Deterministic replay recorder and time-trial telemetry export',
        'Full controller, HOTAS, and keyboard/mouse rebinding support',
        'Zero DRM standalone installer and portable archive builds',
      ],
      featuresAr: [
        'نموذج طيران فيزيائي كامل بست درجات حرية مع مثبت مداري اختياري',
        '14 قطاعاً مدارياً مصمماً بعناية مع إضاءة ديناميكية',
        'نظام إعادة تشغيل حتمي وتصدير بيانات الأداء الزمنية',
        'دعم كامل لوحدات التحكم ولوحة المفاتيح والفأرة مع إعادة التخصيص',
        'نسخة مستقلة خالية من قيود الحماية مع حزمة محمولة',
      ],
      icon: '/src/assets/images/game_astral_drift_1795186839540.jpg',
      coverImage: '/src/assets/images/game_astral_drift_1795186839540.jpg',
      screenshots: [
        '/src/assets/images/game_astral_drift_1795186839540.jpg',
        '/src/assets/images/hero_showcase_studio_1795186839580.jpg',
        '/src/assets/images/web_shaderlab_live_1795186839510.jpg',
      ],
      githubRepo: 'https://github.com/godotengine/godot',
      githubOwner: 'godotengine',
      githubRepoName: 'godot',
      githubReleases: 'https://github.com/godotengine/godot/releases',
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: 'config',
      isSampleDemo: 1,
      assetFilter: { extensions: ['zip', 'exe', 'dmg', 'tar.xz', 'apk'], pattern: '' },
      platforms: ['Windows', 'Linux'],
      technologies: ['Godot 4', 'GDScript', 'C++ GDExtension', 'Vulkan'],
      systemRequirements: {
        os: 'Windows 10/11 (64-bit) or Ubuntu 22.04+',
        processor: 'Quad-core 2.8 GHz (Intel i5 / Ryzen 5)',
        memory: '8 GB RAM',
        storage: '1.2 GB available space',
        graphics: 'Vulkan 1.2 compatible GPU (4 GB VRAM)',
      },
      version: '2.4.0',
      releaseDate: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-11-10T14:30:00.000Z',
      developer: 'Kestrel Forge',
      license: 'Freeware / Open Assets',
      manualDownloads: [
        {
          id: 'stargazer-win-exe',
          name: 'Stargazer-Orion-v2.4.0-win64-setup.exe',
          format: 'EXE',
          sizeBytes: 50541363,
          url: '/api/downloads/package/stargazer-echoes-of-orion/Stargazer-Orion-v2.4.0-win64-setup.exe',
          version: '2.4.0',
          releaseDate: '2026-11-10T14:30:00.000Z',
          source: 'direct',
        },
        {
          id: 'stargazer-win-zip',
          name: 'Stargazer-Orion-v2.4.0-portable.zip',
          format: 'ZIP',
          sizeBytes: 46976204,
          url: '/api/downloads/package/stargazer-echoes-of-orion/Stargazer-Orion-v2.4.0-portable.zip',
          version: '2.4.0',
          releaseDate: '2026-11-10T14:30:00.000Z',
          source: 'direct',
        },
      ],
      versionHistory: [
        {
          version: '2.4.0',
          date: '2026-11-10T14:30:00.000Z',
          notes: 'Added Sector 14 ring-edge salvage contract, Vulkan pipeline cache warm-up, and HOTAS deadzone curves.',
          notesAr: 'إضافة القطاع 14 وتحسين ذاكرة Vulkan ودعم منحنيات عصا التحكم.',
        },
        {
          version: '2.3.1',
          date: '2026-09-22T00:00:00.000Z',
          notes: 'Fixed docking clamp collision jitter at high orbital angular velocity.',
          notesAr: 'إصلاح اهتزاز التحام المركبة عند السرعات الزاوية العالية.',
        },
      ],
      sortOrder: 1,
    },
    {
      id: 'hex-fortress-tactics',
      slug: 'hex-fortress-tactics',
      name: 'Hex Fortress Tactics',
      nameAr: 'تكتيكات القلعة السداسية',
      tagline: 'Turn-based isometric mech skirmish campaign set atop basalt citadels.',
      taglineAr: 'لعبة استراتيجية متناوبة الأدوار للآليات المدرعة فوق القلاع البازلتية.',
      category: 'games',
      description:
        'Command a four-unit tactical strike squad across destructible isometric basalt grids. Position armor facing, manage reactor heat budgets, trigger environmental chain collapses, and author custom skirmish maps using the built-in scenario compiler.',
      descriptionAr:
        'قد فرقة قتالية من أربع آليات مدرعة عبر شبكات بازلتية قابلة للتدمير. وجّه الدروع بدقة، أدر حرارة المفاعلات، وصمم معاركك الخاصة عبر محرر الخرائط المدمج.',
      features: [
        '24-mission single-player campaign with branching tactical objectives',
        'Deterministic turn-preview showing exact damage, knockback, and terrain collapse',
        'Built-in JSON scenario editor shareable via GitHub repositories',
        'Low-overhead rendering running smoothly on integrated graphics',
      ],
      featuresAr: [
        'حملة فردية من 24 مهمة بأهداف تكتيكية متفرعة',
        'معاينة حتمية للأضرار والارتداد وانهيار التضاريس قبل التنفيذ',
        'محرر سيناريوهات مدمج بصيغة JSON قابل للمشاركة عبر GitHub',
        'أداء خفيف يعمل بسلاسة على بطاقات الرسوميات المدمجة',
      ],
      icon: '/src/assets/images/game_iron_bastion_1795186839893.jpg',
      coverImage: '/src/assets/images/game_iron_bastion_1795186839893.jpg',
      screenshots: [
        '/src/assets/images/game_iron_bastion_1795186839893.jpg',
        '/src/assets/images/game_astral_drift_1795186839540.jpg',
      ],
      githubRepo: 'https://github.com/kestrel-forge/hex-fortress-tactics',
      githubOwner: 'kestrel-forge',
      githubRepoName: 'hex-fortress-tactics',
      githubReleases: 'https://github.com/kestrel-forge/hex-fortress-tactics/releases',
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: 'config',
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ['Windows', 'macOS'],
      technologies: ['Rust', 'Bevy Engine', 'WGSL Shaders'],
      systemRequirements: {
        os: 'Windows 10/11 or macOS 13+',
        processor: 'Dual-core 2.4 GHz',
        memory: '4 GB RAM',
        storage: '480 MB available space',
        graphics: 'DirectX 12 / Metal capable GPU',
      },
      version: '1.8.2',
      releaseDate: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-10-28T09:15:00.000Z',
      developer: 'Kestrel Forge',
      license: 'MIT',
      manualDownloads: [
        {
          id: 'hex-win-exe',
          name: 'HexFortress-v1.8.2-Windows-x64.exe',
          format: 'EXE',
          sizeBytes: 38294016,
          url: '/api/downloads/package/hex-fortress-tactics/HexFortress-v1.8.2-Windows-x64.exe',
          version: '1.8.2',
          releaseDate: '2026-10-28T09:15:00.000Z',
          source: 'direct',
        },
        {
          id: 'hex-mac-zip',
          name: 'HexFortress-v1.8.2-macOS-Universal.zip',
          format: 'ZIP',
          sizeBytes: 41104179,
          url: '/api/downloads/package/hex-fortress-tactics/HexFortress-v1.8.2-macOS-Universal.zip',
          version: '1.8.2',
          releaseDate: '2026-10-28T09:15:00.000Z',
          source: 'direct',
        },
      ],
      versionHistory: [
        {
          version: '1.8.2',
          date: '2026-10-28T09:15:00.000Z',
          notes: 'Balanced artillery heat cost and added keyboard shortcuts for undo/preview.',
          notesAr: 'موازنة استهلاك الحرارة للمدفعية وإضافة اختصارات لوحة المفاتيح.',
        },
      ],
      sortOrder: 2,
    },
    {
      id: 'pulsenote-audio',
      slug: 'pulsenote-audio',
      name: 'PulseNote Audio',
      nameAr: 'بالس نوت الصوتي',
      tagline: 'Offline-first markdown notebook & lossless voice memo recorder for Android.',
      taglineAr: 'مفكرة ماركداون محلية ومسجل ملاحظات صوتية عالي الجودة لأندرويد.',
      category: 'android',
      description:
        'PulseNote Audio combines distraction-free Markdown notes with synchronized timestamped audio waveforms. Every recording and document stays locally on your device in plain files you own, with optional encrypted Git backup.',
      descriptionAr:
        'يجمع بالس نوت بين تدوين الملاحظات بصيغة ماركداون وتسجيل المقاطع الصوتية المرتبطة زمنياً. تبقى جميع ملفاتك محلياً على جهازك بصيغ مفتوحة مع خيار النسخ الاحتياطي المشفر.',
      features: [
        'Instant Markdown editing with live waveform timestamp markers',
        'Zero trackers, zero cloud lock-in, 100% offline-capable storage',
        'High-bitrate Opus and FLAC recording profiles',
        'Dark AMOLED battery-optimized interface with RTL Arabic support',
      ],
      featuresAr: [
        'تحرير فوري بصيغة Markdown مع علامات زمنية على الموجة الصوتية',
        'بدون تتبع أو اشتراكات سحابية — تخزين محلي كامل على الجهاز',
        'تسجيل صوتي عالي الجودة بصيغ Opus و FLAC',
        'واجهة داكنة موفرة لطاقة شاشات AMOLED مع دعم كامل للعربية',
      ],
      icon: '/src/assets/images/app_pulsenote_android_1795186839616.jpg',
      coverImage: '/src/assets/images/app_pulsenote_android_1795186839616.jpg',
      screenshots: [
        '/src/assets/images/app_pulsenote_android_1795186839616.jpg',
        '/src/assets/images/app_droidguard_android_1795186839608.jpg',
      ],
      githubRepo: 'https://github.com/kestrel-forge/pulsenote-android',
      githubOwner: 'kestrel-forge',
      githubRepoName: 'pulsenote-android',
      githubReleases: 'https://github.com/kestrel-forge/pulsenote-android/releases',
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: 'config',
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ['Android'],
      technologies: ['Kotlin', 'Jetpack Compose', 'Room SQLite', 'Oboe Audio'],
      systemRequirements: {
        os: 'Android 10 (API 29) or higher',
        memory: '2 GB RAM minimum',
        storage: '45 MB installation space',
      },
      version: '3.1.0',
      releaseDate: '2026-05-19T00:00:00.000Z',
      updatedAt: '2026-11-08T18:45:00.000Z',
      developer: 'Kestrel Forge',
      license: 'Apache-2.0',
      manualDownloads: [
        {
          id: 'pulsenote-arm64',
          name: 'PulseNote-v3.1.0-arm64-v8a.apk',
          format: 'APK',
          sizeBytes: 14889779,
          url: '/api/downloads/package/pulsenote-audio/PulseNote-v3.1.0-arm64-v8a.apk',
          version: '3.1.0',
          releaseDate: '2026-11-08T18:45:00.000Z',
          source: 'direct',
        },
        {
          id: 'pulsenote-universal',
          name: 'PulseNote-v3.1.0-universal.apk',
          format: 'APK',
          sizeBytes: 22439526,
          url: '/api/downloads/package/pulsenote-audio/PulseNote-v3.1.0-universal.apk',
          version: '3.1.0',
          releaseDate: '2026-11-08T18:45:00.000Z',
          source: 'direct',
        },
      ],
      versionHistory: [
        {
          version: '3.1.0',
          date: '2026-11-08T18:45:00.000Z',
          notes: 'Added hardware noise-suppression toggle and Markdown table preview.',
          notesAr: 'إضافة خيار عزل الضوضاء ومعاينة الجداول في Markdown.',
        },
      ],
      sortOrder: 3,
    },
    {
      id: 'sysaware-mobile',
      slug: 'sysaware-mobile',
      name: 'SysAware Mobile',
      nameAr: 'سيس أوير للهواتف',
      tagline: 'Real-time Android permission auditor and local network latency inspector.',
      taglineAr: 'أداة فحص أذونات التطبيقات ومراقبة أداء الشبكة لأجهزة أندرويد.',
      category: 'android',
      description:
        'SysAware Mobile gives developers and privacy-conscious Android users clear visibility into background sensor access, permission scopes, and active Wi-Fi/5G latency spikes without requiring root privileges.',
      descriptionAr:
        'يمنح تطبيق سيس أوير المطورين والمستخدمين رؤية واضحة لأذونات التطبيقات واستخدام الحساسات وزمن استجابة الشبكة دون الحاجة لصلاحيات الروت.',
      features: [
        'Inspect camera, microphone, and location permission states across installed apps',
        'Live Wi-Fi & cellular RTT latency chart with packet-loss diagnostics',
        'Export structured JSON audit reports for QA testing',
        'Lightweight 9 MB signed APK compiled via GitHub Actions',
      ],
      featuresAr: [
        'فحص حالة أذونات الكاميرا والميكروفون والموقع لجميع التطبيقات المثبتة',
        'مخطط زمني مباشر لزمن استجابة الشبكة وفقدان الحزم',
        'تصدير تقارير الفحص بصيغة JSON لاختبارات الجودة',
        'ملف APK موقع بحجم خفيف مبني عبر GitHub Actions',
      ],
      icon: '/src/assets/images/app_droidguard_android_1795186839608.jpg',
      coverImage: '/src/assets/images/app_droidguard_android_1795186839608.jpg',
      screenshots: [
        '/src/assets/images/app_droidguard_android_1795186839608.jpg',
        '/src/assets/images/app_pulsenote_android_1795186839616.jpg',
      ],
      githubRepo: 'https://github.com/kestrel-forge/sysaware-mobile',
      githubOwner: 'kestrel-forge',
      githubRepoName: 'sysaware-mobile',
      githubReleases: 'https://github.com/kestrel-forge/sysaware-mobile/releases',
      liveUrl: null,
      featured: 0,
      published: 1,
      releaseSync: 1,
      managedBy: 'config',
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ['Android'],
      technologies: ['Kotlin', 'Material 3', 'Android ConnectivityManager'],
      systemRequirements: {
        os: 'Android 11 (API 30) or higher',
        memory: '2 GB RAM',
        storage: '25 MB available space',
      },
      version: '4.1.0',
      releaseDate: '2026-03-11T00:00:00.000Z',
      updatedAt: '2026-11-02T11:20:00.000Z',
      developer: 'Kestrel Forge',
      license: 'GPL-3.0',
      manualDownloads: [
        {
          id: 'sysaware-apk',
          name: 'SysAware-v4.1.0-release.apk',
          format: 'APK',
          sizeBytes: 9437184,
          url: '/api/downloads/package/sysaware-mobile/SysAware-v4.1.0-release.apk',
          version: '4.1.0',
          releaseDate: '2026-11-02T11:20:00.000Z',
          source: 'direct',
        },
      ],
      versionHistory: [
        {
          version: '4.1.0',
          date: '2026-11-02T11:20:00.000Z',
          notes: 'Added Android 15 foreground service audit flags and dark contrast polish.',
          notesAr: 'إضافة فحص خدمات الخلفية لنظام أندرويد 15 وتحسين التباين.',
        },
      ],
      sortOrder: 4,
    },
    {
      id: 'windock-studio',
      slug: 'windock-studio',
      name: 'WinDock Studio',
      nameAr: 'وين دوك ستوديو',
      tagline: 'Precision window tiling, command palette, and workspace launcher for Windows 11.',
      taglineAr: 'أداة تقسيم النوافذ ولوحة الأوامر السريعة وإدارة مساحات العمل لويندوز 11.',
      category: 'windows',
      description:
        'Built in native Rust and Win32 APIs, WinDock Studio brings instant keyboard-driven window tiling, multi-monitor layout presets, and an extensible command palette to Windows 10 and 11 with under 18 MB RAM footprint.',
      descriptionAr:
        'مطور بلغة Rust وواجهات Win32 الأصلية، يوفر وين دوك ستوديو تقسيماً فورياً للنوافذ عبر لوحة المفاتيح وقوالب للشاشات المتعددة ولوحة أوامر سريعة باستهلاك ذاكرة أقل من 18 ميجابايت.',
      features: [
        'Sub-millisecond Win32 window snapping across multi-DPI monitors',
        'Global Ctrl+Space command palette for launching repos, scripts, and layouts',
        'Save and restore entire app workspace arrangements with one shortcut',
        'Available as signed MSI enterprise installer, EXE setup, or portable ZIP',
      ],
      featuresAr: [
        'ترتيب فوري للنوافذ عبر الشاشات المتعددة بدقة عالية',
        'لوحة أوامر شاملة لتشغيل المشاريع والسكربتات والتخطيطات',
        'حفظ واستعادة مساحات العمل الكاملة باختصار واحد',
        'متوفر بصيغة MSI و EXE ونسخة ZIP محمولة بدون تثبيت',
      ],
      icon: '/src/assets/images/win_windock_studio_1795186839361.jpg',
      coverImage: '/src/assets/images/win_windock_studio_1795186839361.jpg',
      screenshots: [
        '/src/assets/images/win_windock_studio_1795186839361.jpg',
        '/src/assets/images/hero_showcase_studio_1795186839580.jpg',
      ],
      githubRepo: 'https://github.com/kestrel-forge/windock-studio',
      githubOwner: 'kestrel-forge',
      githubRepoName: 'windock-studio',
      githubReleases: 'https://github.com/kestrel-forge/windock-studio/releases',
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: 'config',
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ['Windows'],
      technologies: ['Rust', 'Win32 API', 'Direct2D', 'WiX MSI'],
      systemRequirements: {
        os: 'Windows 10 (19045+) or Windows 11 (x64 / ARM64)',
        processor: 'x64 or ARM64 1.6 GHz+',
        memory: '128 MB RAM',
        storage: '35 MB available space',
      },
      version: '2.1.0',
      releaseDate: '2026-04-02T00:00:00.000Z',
      updatedAt: '2026-11-14T16:00:00.000Z',
      developer: 'Kestrel Forge',
      license: 'MIT',
      manualDownloads: [
        {
          id: 'windock-msi',
          name: 'WinDockStudio-v2.1.0-x64.msi',
          format: 'MSI',
          sizeBytes: 12582912,
          url: '/api/downloads/package/windock-studio/WinDockStudio-v2.1.0-x64.msi',
          version: '2.1.0',
          releaseDate: '2026-11-14T16:00:00.000Z',
          source: 'direct',
        },
        {
          id: 'windock-exe',
          name: 'WinDockStudio-v2.1.0-Setup.exe',
          format: 'EXE',
          sizeBytes: 13107200,
          url: '/api/downloads/package/windock-studio/WinDockStudio-v2.1.0-Setup.exe',
          version: '2.1.0',
          releaseDate: '2026-11-14T16:00:00.000Z',
          source: 'direct',
        },
        {
          id: 'windock-zip',
          name: 'WinDockStudio-v2.1.0-Portable.zip',
          format: 'ZIP',
          sizeBytes: 10905190,
          url: '/api/downloads/package/windock-studio/WinDockStudio-v2.1.0-Portable.zip',
          version: '2.1.0',
          releaseDate: '2026-11-14T16:00:00.000Z',
          source: 'direct',
        },
      ],
      versionHistory: [
        {
          version: '2.1.0',
          date: '2026-11-14T16:00:00.000Z',
          notes: 'Added per-monitor DPI scaling memory and TOML hot-reload for custom tiling zones.',
          notesAr: 'تحسين تذكر دقة الشاشات المتعددة وإعادة التحميل الفوري لملف الإعدادات.',
        },
      ],
      sortOrder: 5,
    },
    {
      id: 'g-wave-shaderlab',
      slug: 'g-wave-shaderlab',
      name: 'G-Wave ShaderLab',
      nameAr: 'مختبر المظللات G-Wave',
      tagline: 'Browser-based procedural wave mesh generator and real-time node graph studio.',
      taglineAr: 'استوديو ويب تفاعلي لتوليد الشبكات ثلاثية الأبعاد وتحرير عقد المظللات مباشرة.',
      category: 'web',
      description:
        'G-Wave ShaderLab runs directly in modern desktop and mobile browsers without installation. Compose procedural noise displacement pipelines, inspect real-time wireframe and glass shaders at 60 FPS, and export clean parameters for your own graphics projects.',
      descriptionAr:
        'يعمل مختبر G-Wave مباشرة داخل المتصفح دون تثبيت. أنشئ موجات إجرائية ثلاثية الأبعاد، راقب الأداء لحظياً بسرعة 60 إطاراً في الثانية، وصدّر الإعدادات لمشاريعك الرسومية.',
      features: [
        'Instant zero-install browser execution with offline PWA support',
        'Interactive procedural wave amplitude, frequency, and wireframe controls',
        'Real-time 60 FPS HTML5 Canvas / WebGL rendering pipeline',
        'Export JSON preset configurations or run standalone desktop wrapper',
      ],
      featuresAr: [
        'تشغيل فوري داخل المتصفح مع دعم العمل دون اتصال PWA',
        'تحكم تفاعلي في تردد وارتفاع الموجات وتفاصيل الشبكة',
        'محرك رسم مباشر بسرعة 60 إطاراً في الثانية',
        'تصدير إعدادات التصميم بصيغة JSON',
      ],
      icon: '/src/assets/images/web_shaderlab_live_1795186839510.jpg',
      coverImage: '/src/assets/images/web_shaderlab_live_1795186839510.jpg',
      screenshots: [
        '/src/assets/images/web_shaderlab_live_1795186839510.jpg',
        '/src/assets/images/hero_showcase_studio_1795186839580.jpg',
      ],
      githubRepo: 'https://github.com/kestrel-forge/g-wave-shaderlab',
      githubOwner: 'kestrel-forge',
      githubRepoName: 'g-wave-shaderlab',
      githubReleases: 'https://github.com/kestrel-forge/g-wave-shaderlab/releases',
      liveUrl: '/apps/g-wave-shaderlab',
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: 'config',
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ['Web', 'PWA', 'Windows', 'macOS', 'Linux'],
      technologies: ['TypeScript', 'React', 'HTML5 Canvas', 'WebGL'],
      systemRequirements: {
        os: 'Any modern browser (Chrome, Edge, Firefox, Safari)',
        graphics: 'WebGL / Hardware-accelerated Canvas recommended',
      },
      version: '1.4.0',
      releaseDate: '2026-07-08T00:00:00.000Z',
      updatedAt: now,
      developer: 'Kestrel Forge',
      license: 'MIT',
      manualDownloads: [
        {
          id: 'shaderlab-web-bundle',
          name: 'GWave-ShaderLab-v1.4.0-StaticBundle.zip',
          format: 'ZIP',
          sizeBytes: 3460300,
          url: '/api/downloads/package/g-wave-shaderlab/GWave-ShaderLab-v1.4.0-StaticBundle.zip',
          version: '1.4.0',
          releaseDate: now,
          source: 'direct',
        },
      ],
      versionHistory: [
        {
          version: '1.4.0',
          date: now,
          notes: 'Added interactive parameter presets and JSON export.',
          notesAr: 'إضافة قوالب جاهزة وتصدير الإعدادات بصيغة JSON.',
        },
      ],
      sortOrder: 6,
    },
  ];

  const insertStmt = db.prepare(`
    INSERT INTO products (
      id, slug, name, name_ar, tagline, tagline_ar, category, description, description_ar,
      features_json, features_ar_json, icon, cover_image, screenshots_json,
      github_repo, github_owner, github_repo_name, github_releases, live_url,
      featured, published, release_sync, managed_by, is_sample_demo, asset_filter_json,
      platforms_json, technologies_json, system_requirements_json,
      version, release_date, updated_at, developer, license,
      manual_downloads_json, version_history_json, sort_order
    ) VALUES (
      @id, @slug, @name, @nameAr, @tagline, @taglineAr, @category, @description, @descriptionAr,
      @featuresJson, @featuresArJson, @icon, @coverImage, @screenshotsJson,
      @githubRepo, @githubOwner, @githubRepoName, @githubReleases, @liveUrl,
      @featured, @published, @releaseSync, @managedBy, @isSampleDemo, @assetFilterJson,
      @platformsJson, @technologiesJson, @systemRequirementsJson,
      @version, @releaseDate, @updatedAt, @developer, @license,
      @manualDownloadsJson, @versionHistoryJson, @sortOrder
    )
  `);

  for (const p of seeded) {
    insertStmt.run({
      id: p.id,
      slug: p.slug,
      name: p.name,
      nameAr: p.nameAr,
      tagline: p.tagline,
      taglineAr: p.taglineAr,
      category: p.category,
      description: p.description,
      descriptionAr: p.descriptionAr,
      featuresJson: JSON.stringify(p.features),
      featuresArJson: JSON.stringify(p.featuresAr),
      icon: p.icon,
      coverImage: p.coverImage,
      screenshotsJson: JSON.stringify(p.screenshots),
      githubRepo: p.githubRepo,
      githubOwner: p.githubOwner,
      githubRepoName: p.githubRepoName,
      githubReleases: p.githubReleases,
      liveUrl: p.liveUrl,
      featured: p.featured,
      published: p.published,
      releaseSync: p.releaseSync,
      managedBy: p.managedBy,
      isSampleDemo: p.isSampleDemo,
      assetFilterJson: JSON.stringify(p.assetFilter),
      platformsJson: JSON.stringify(p.platforms),
      technologiesJson: JSON.stringify(p.technologies),
      systemRequirementsJson: JSON.stringify(p.systemRequirements),
      version: p.version,
      releaseDate: p.releaseDate,
      updatedAt: p.updatedAt,
      developer: p.developer,
      license: p.license,
      manualDownloadsJson: JSON.stringify(p.manualDownloads),
      versionHistoryJson: JSON.stringify(p.versionHistory),
      sortOrder: p.sortOrder,
    });
  }
}

export function reconcileProductsConfigFile(): { inserted: number; updatedConfigOwned: number; skippedDashboardOwned: number } {
  const configPath = path.resolve(process.cwd(), 'products.config.json');
  if (!fs.existsSync(configPath)) {
    return { inserted: 0, updatedConfigOwned: 0, skippedDashboardOwned: 0 };
  }

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
    products?: Array<Record<string, unknown>>;
  };
  const entries = Array.isArray(parsed.products) ? parsed.products : [];

  let inserted = 0;
  let updatedConfigOwned = 0;
  let skippedDashboardOwned = 0;
  const now = new Date().toISOString();

  for (const entry of entries) {
    const id = String(entry.id || '').trim();
    if (!id) continue;
    const existing = db.prepare('SELECT id, managed_by FROM products WHERE id = ?').get(id) as
      | { id: string; managed_by: string }
      | undefined;

    if (existing && existing.managed_by === 'dashboard') {
      skippedDashboardOwned += 1;
      continue;
    }

    const githubRepo = String(entry.githubRepo || '');
    const { owner, repo } = parseGitHubOwnerAndRepo(githubRepo);
    const slug = String(entry.slug || id);
    const payload = {
      id,
      slug,
      name: String(entry.name || id),
      nameAr: String(entry.nameAr || entry.name || id),
      tagline: String(entry.shortDescription || ''),
      taglineAr: String(entry.shortDescriptionAr || entry.shortDescription || ''),
      category: String(entry.category || 'other'),
      description: String(entry.description || ''),
      descriptionAr: String(entry.descriptionAr || entry.description || ''),
      icon: String(entry.icon || entry.coverImage || ''),
      coverImage: String(entry.coverImage || ''),
      screenshotsJson: JSON.stringify(Array.isArray(entry.screenshots) ? entry.screenshots : []),
      githubRepo,
      githubOwner: owner,
      githubRepoName: repo,
      githubReleases: String(entry.githubReleases || (githubRepo ? `${githubRepo}/releases` : '')),
      liveUrl: entry.liveUrl ? String(entry.liveUrl) : null,
      featured: entry.featured ? 1 : 0,
      published: entry.published === false ? 0 : 1,
      releaseSync: entry.releaseSync === false ? 0 : 1,
      managedBy: 'config',
      isSampleDemo: entry.isSampleDemo ? 1 : 0,
      assetFilterJson: JSON.stringify(entry.assetFilter || {}),
      platformsJson: JSON.stringify(Array.isArray(entry.platforms) ? entry.platforms : ['Web']),
      technologiesJson: JSON.stringify(Array.isArray(entry.technologies) ? entry.technologies : []),
      version: String(entry.version || '1.0.0'),
      updatedAt: now,
    };

    if (!existing) {
      db.prepare(`
        INSERT INTO products (
          id, slug, name, name_ar, tagline, tagline_ar, category, description, description_ar,
          icon, cover_image, screenshots_json, github_repo, github_owner, github_repo_name,
          github_releases, live_url, featured, published, release_sync, managed_by,
          is_sample_demo, asset_filter_json, platforms_json, technologies_json,
          version, release_date, updated_at
        ) VALUES (
          @id, @slug, @name, @nameAr, @tagline, @taglineAr, @category, @description, @descriptionAr,
          @icon, @coverImage, @screenshotsJson, @githubRepo, @githubOwner, @githubRepoName,
          @githubReleases, @liveUrl, @featured, @published, @releaseSync, @managedBy,
          @isSampleDemo, @assetFilterJson, @platformsJson, @technologiesJson,
          @version, @updatedAt, @updatedAt
        )
      `).run(payload);
      inserted += 1;
    } else {
      db.prepare(`
        UPDATE products SET
          slug = @slug, name = @name, name_ar = @nameAr, tagline = @tagline, tagline_ar = @taglineAr,
          category = @category, description = @description, description_ar = @descriptionAr,
          icon = @icon, cover_image = @coverImage, screenshots_json = @screenshotsJson,
          github_repo = @githubRepo, github_owner = @githubOwner, github_repo_name = @githubRepoName,
          github_releases = @githubReleases, live_url = @liveUrl, featured = @featured,
          published = @published, release_sync = @releaseSync, is_sample_demo = @isSampleDemo,
          asset_filter_json = @assetFilterJson, platforms_json = @platformsJson,
          technologies_json = @technologiesJson, version = @version, updated_at = @updatedAt
        WHERE id = @id AND managed_by = 'config'
      `).run(payload);
      updatedConfigOwned += 1;
    }
  }

  return { inserted, updatedConfigOwned, skippedDashboardOwned };
}

export function mapProductRow(row: Record<string, unknown>): Product {
  const id = String(row.id);
  const githubOwner = String(row.github_owner || '');
  const githubRepoName = String(row.github_repo_name || '');

  const counts = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
        SUM(CASE WHEN source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
        SUM(CASE WHEN source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web
       FROM download_events WHERE product_id = ?`
    )
    .get(id) as { total: number; direct: number | null; github: number | null; web: number | null };

  return {
    id,
    slug: String(row.slug || id),
    name: String(row.name),
    nameAr: String(row.name_ar || row.name),
    tagline: String(row.tagline || ''),
    taglineAr: String(row.tagline_ar || row.tagline || ''),
    category: row.category as Product['category'],
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
  };
}

function safeParseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function parseGitHubOwnerAndRepo(repoUrl: string): { owner: string; repo: string } {
  const cleaned = repoUrl.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) return { owner: '', repo: '' };
  return { owner: match[1], repo: match[2] };
}
