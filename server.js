// server.ts
import express2 from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path4 from "path";
import fs4 from "fs";
import os3 from "os";

// server/db.ts
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import fs from "fs";
import os from "os";
import path from "path";
function openDatabase() {
  const primaryPath = process.env.DATABASE_PATH || path.resolve(process.cwd(), "data", "marketplace.db");
  const fallbackPath = path.join(os.tmpdir(), "kestrel-forge-marketplace.db");
  for (const candidate of [primaryPath, fallbackPath]) {
    try {
      const dir = path.dirname(candidate);
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      if (fs.existsSync(candidate)) {
        fs.accessSync(candidate, fs.constants.R_OK | fs.constants.W_OK);
      }
      const conn = new Database(candidate);
      conn.pragma("journal_mode = WAL");
      conn.pragma("foreign_keys = ON");
      return conn;
    } catch (err) {
      if (candidate === fallbackPath) {
        throw err;
      }
      console.warn(`Warning: unable to open SQLite DB at ${candidate}, falling back to ${fallbackPath}:`, err);
    }
  }
  throw new Error("Failed to open SQLite database");
}
var db = openDatabase();
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
function initDatabase() {
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
  ensureColumn("products", "slug", "TEXT");
  ensureColumn("products", "published", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("products", "release_sync", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("products", "managed_by", "TEXT NOT NULL DEFAULT 'config'");
  ensureColumn("products", "is_sample_demo", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("products", "asset_filter_json", "TEXT NOT NULL DEFAULT '{}'");
  db.exec(`UPDATE products SET slug = id WHERE slug IS NULL OR slug = ''`);
  seedCategories();
  seedAdminUser();
  seedProducts();
}
function seedCategories() {
  const count = db.prepare("SELECT COUNT(*) as c FROM categories").get().c;
  if (count > 0) return;
  const categories = [
    {
      id: "games",
      slug: "games",
      name: "Video Games",
      nameAr: "\u0623\u0644\u0639\u0627\u0628 \u0627\u0644\u0641\u064A\u062F\u064A\u0648",
      description: "Standalone PC and tactical indie titles built with custom engines and deterministic physics.",
      descriptionAr: "\u0623\u0644\u0639\u0627\u0628 \u0645\u0633\u062A\u0642\u0644\u0629 \u0644\u0644\u062D\u0627\u0633\u0648\u0628 \u0645\u0628\u0646\u064A\u0629 \u0628\u0645\u062D\u0631\u0643\u0627\u062A \u0645\u062E\u0635\u0635\u0629 \u0648\u0641\u064A\u0632\u064A\u0627\u0621 \u062F\u0642\u064A\u0642\u0629.",
      sortOrder: 1
    },
    {
      id: "android",
      slug: "android",
      name: "Android Applications",
      nameAr: "\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0623\u0646\u062F\u0631\u0648\u064A\u062F",
      description: "Signed APK utilities and offline-first mobile companions engineered for speed and privacy.",
      descriptionAr: "\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0623\u0646\u062F\u0631\u0648\u064A\u062F \u0628\u0635\u064A\u063A\u0629 APK \u0645\u0648\u0642\u0639\u0629 \u0648\u0645\u0635\u0645\u0645\u0629 \u0644\u0644\u0623\u062F\u0627\u0621 \u0627\u0644\u0639\u0627\u0644\u064A \u0648\u0627\u0644\u062E\u0635\u0648\u0635\u064A\u0629.",
      sortOrder: 2
    },
    {
      id: "windows",
      slug: "windows",
      name: "Windows Software",
      nameAr: "\u0628\u0631\u0627\u0645\u062C \u0648\u064A\u0646\u062F\u0648\u0632",
      description: "Native desktop productivity tools packaged as EXE installers, MSI packages, and portable ZIPs.",
      descriptionAr: "\u0628\u0631\u0627\u0645\u062C \u0633\u0637\u062D \u0645\u0643\u062A\u0628 \u0623\u0635\u0644\u064A\u0629 \u0644\u0646\u0638\u0627\u0645 \u0648\u064A\u0646\u062F\u0648\u0632 \u0628\u0635\u064A\u063A EXE \u0648 MSI \u0648\u0645\u0644\u0641\u0627\u062A \u0645\u062D\u0645\u0648\u0644\u0629 ZIP.",
      sortOrder: 3
    },
    {
      id: "web",
      slug: "web",
      name: "Web Applications",
      nameAr: "\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0627\u0644\u0648\u064A\u0628",
      description: "Interactive browser tools, WebGL sandboxes, and installable progressive web applications.",
      descriptionAr: "\u0623\u062F\u0648\u0627\u062A \u0648\u064A\u0628 \u062A\u0641\u0627\u0639\u0644\u064A\u0629 \u0648\u0628\u064A\u0626\u0627\u062A \u062A\u062C\u0631\u064A\u0628\u064A\u0629 \u0648\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0648\u064A\u0628 \u062A\u0642\u062F\u0645\u064A\u0629 \u062A\u0639\u0645\u0644 \u0645\u0628\u0627\u0634\u0631\u0629 \u0641\u064A \u0627\u0644\u0645\u062A\u0635\u0641\u062D.",
      sortOrder: 4
    },
    {
      id: "other",
      slug: "other",
      name: "Developer Tools & SDKs",
      nameAr: "\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0645\u0637\u0648\u0631\u064A\u0646 \u0648\u0627\u0644\u062D\u0632\u0645",
      description: "Command-line utilities, shader packs, and cross-platform build scripts.",
      descriptionAr: "\u0623\u062F\u0648\u0627\u062A \u0633\u0637\u0631 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0648\u062D\u0632\u0645 \u0627\u0644\u062A\u0637\u0648\u064A\u0631 \u0648\u0627\u0644\u0628\u0631\u0645\u062C\u064A\u0627\u062A \u0627\u0644\u0645\u0633\u0627\u0639\u062F\u0629 \u0645\u062A\u0639\u062F\u062F\u0629 \u0627\u0644\u0645\u0646\u0635\u0627\u062A.",
      sortOrder: 5
    }
  ];
  const stmt = db.prepare(`
    INSERT INTO categories (id, slug, name, name_ar, description, description_ar, sort_order)
    VALUES (@id, @slug, @name, @nameAr, @description, @descriptionAr, @sortOrder)
  `);
  for (const cat of categories) {
    stmt.run(cat);
  }
}
function seedAdminUser() {
  const count = db.prepare("SELECT COUNT(*) as c FROM admin_users").get().c;
  if (count > 0) return;
  const email = (process.env.ADMIN_EMAIL || "admin@kestrelforge.dev").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "KestrelAdmin2026!";
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO admin_users (email, password_hash, role, created_at)
    VALUES (?, ?, 'admin', ?)
  `).run(email, hash, (/* @__PURE__ */ new Date()).toISOString());
}
function seedProducts() {
  const count = db.prepare("SELECT COUNT(*) as c FROM products").get().c;
  if (count > 0) return;
  const now = "2026-11-12T10:00:00.000Z";
  const seeded = [
    {
      id: "stargazer-echoes-of-orion",
      slug: "stargazer-echoes-of-orion",
      name: "Stargazer: Echoes of Orion",
      nameAr: "\u0633\u062A\u0627\u0631\u063A\u064A\u0632\u0631: \u0623\u0635\u062F\u0627\u0621 \u0623\u0648\u0631\u064A\u0648\u0646",
      tagline: "Orbital flight & deep-space salvage simulation with Newtonian thrust physics.",
      taglineAr: "\u0645\u062D\u0627\u0643\u0627\u0629 \u0637\u064A\u0631\u0627\u0646 \u0645\u062F\u0627\u0631\u064A \u0648\u0627\u0633\u062A\u0643\u0634\u0627\u0641 \u0641\u0636\u0627\u0626\u064A \u0628\u0641\u064A\u0632\u064A\u0627\u0621 \u0646\u064A\u0648\u062A\u0648\u0646\u064A\u0629 \u062F\u0642\u064A\u0642\u0629.",
      category: "games",
      description: "Stargazer: Echoes of Orion places you at the helm of an independent salvage interceptor charting derelict orbital stations around a ringed gas giant. Manage fuel vectors, dock with rotating debris fields, decode black-box telemetry, and upgrade modular reactor subsystems without arcade flight assists.",
      descriptionAr: "\u062A\u0636\u0639\u0643 \u0644\u0639\u0628\u0629 \u0633\u062A\u0627\u0631\u063A\u064A\u0632\u0631: \u0623\u0635\u062F\u0627\u0621 \u0623\u0648\u0631\u064A\u0648\u0646 \u0641\u064A \u0642\u0645\u0631\u0629 \u0642\u064A\u0627\u062F\u0629 \u0645\u0631\u0643\u0628\u0629 \u0627\u0633\u062A\u0643\u0634\u0627\u0641 \u0648\u0625\u0646\u0642\u0627\u0630 \u0645\u062F\u0627\u0631\u064A\u0629 \u062D\u0648\u0644 \u0639\u0645\u0644\u0627\u0642 \u063A\u0627\u0632\u064A \u062D\u0644\u0642\u064A. \u062A\u062D\u0643\u0645 \u0641\u064A \u0645\u062A\u062C\u0647\u0627\u062A \u0627\u0644\u062F\u0641\u0639\u060C \u0627\u0644\u062A\u062D\u0645 \u0645\u0639 \u0627\u0644\u0645\u062D\u0637\u0627\u062A \u0627\u0644\u0645\u0647\u062C\u0648\u0631\u0629\u060C \u0648\u0641\u0643 \u062A\u0634\u0641\u064A\u0631 \u0633\u062C\u0644\u0627\u062A \u0627\u0644\u0631\u062D\u0644\u0627\u062A \u0641\u064A \u062A\u062C\u0631\u0628\u0629 \u0641\u064A\u0632\u064A\u0627\u0626\u064A\u0629 \u0645\u062A\u0643\u0627\u0645\u0644\u0629.",
      features: [
        "Full 6-DOF Newtonian flight model with optional orbital autopilot stabilization",
        "14 hand-crafted derelict orbital sectors with dynamic lighting and volumetric ring dust",
        "Deterministic replay recorder and time-trial telemetry export",
        "Full controller, HOTAS, and keyboard/mouse rebinding support",
        "Zero DRM standalone installer and portable archive builds"
      ],
      featuresAr: [
        "\u0646\u0645\u0648\u0630\u062C \u0637\u064A\u0631\u0627\u0646 \u0641\u064A\u0632\u064A\u0627\u0626\u064A \u0643\u0627\u0645\u0644 \u0628\u0633\u062A \u062F\u0631\u062C\u0627\u062A \u062D\u0631\u064A\u0629 \u0645\u0639 \u0645\u062B\u0628\u062A \u0645\u062F\u0627\u0631\u064A \u0627\u062E\u062A\u064A\u0627\u0631\u064A",
        "14 \u0642\u0637\u0627\u0639\u0627\u064B \u0645\u062F\u0627\u0631\u064A\u0627\u064B \u0645\u0635\u0645\u0645\u0627\u064B \u0628\u0639\u0646\u0627\u064A\u0629 \u0645\u0639 \u0625\u0636\u0627\u0621\u0629 \u062F\u064A\u0646\u0627\u0645\u064A\u0643\u064A\u0629",
        "\u0646\u0638\u0627\u0645 \u0625\u0639\u0627\u062F\u0629 \u062A\u0634\u063A\u064A\u0644 \u062D\u062A\u0645\u064A \u0648\u062A\u0635\u062F\u064A\u0631 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u062F\u0627\u0621 \u0627\u0644\u0632\u0645\u0646\u064A\u0629",
        "\u062F\u0639\u0645 \u0643\u0627\u0645\u0644 \u0644\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u062A\u062D\u0643\u0645 \u0648\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0648\u0627\u0644\u0641\u0623\u0631\u0629 \u0645\u0639 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u062E\u0635\u064A\u0635",
        "\u0646\u0633\u062E\u0629 \u0645\u0633\u062A\u0642\u0644\u0629 \u062E\u0627\u0644\u064A\u0629 \u0645\u0646 \u0642\u064A\u0648\u062F \u0627\u0644\u062D\u0645\u0627\u064A\u0629 \u0645\u0639 \u062D\u0632\u0645\u0629 \u0645\u062D\u0645\u0648\u0644\u0629"
      ],
      icon: "/src/assets/images/game_astral_drift_1795186839540.jpg",
      coverImage: "/src/assets/images/game_astral_drift_1795186839540.jpg",
      screenshots: [
        "/src/assets/images/game_astral_drift_1795186839540.jpg",
        "/src/assets/images/hero_showcase_studio_1795186839580.jpg",
        "/src/assets/images/web_shaderlab_live_1795186839510.jpg"
      ],
      githubRepo: "https://github.com/godotengine/godot",
      githubOwner: "godotengine",
      githubRepoName: "godot",
      githubReleases: "https://github.com/godotengine/godot/releases",
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: "config",
      isSampleDemo: 1,
      assetFilter: { extensions: ["zip", "exe", "dmg", "tar.xz", "apk"], pattern: "" },
      platforms: ["Windows", "Linux"],
      technologies: ["Godot 4", "GDScript", "C++ GDExtension", "Vulkan"],
      systemRequirements: {
        os: "Windows 10/11 (64-bit) or Ubuntu 22.04+",
        processor: "Quad-core 2.8 GHz (Intel i5 / Ryzen 5)",
        memory: "8 GB RAM",
        storage: "1.2 GB available space",
        graphics: "Vulkan 1.2 compatible GPU (4 GB VRAM)"
      },
      version: "2.4.0",
      releaseDate: "2026-08-14T00:00:00.000Z",
      updatedAt: "2026-11-10T14:30:00.000Z",
      developer: "Kestrel Forge",
      license: "Freeware / Open Assets",
      manualDownloads: [
        {
          id: "stargazer-win-exe",
          name: "Stargazer-Orion-v2.4.0-win64-setup.exe",
          format: "EXE",
          sizeBytes: 50541363,
          url: "/api/downloads/package/stargazer-echoes-of-orion/Stargazer-Orion-v2.4.0-win64-setup.exe",
          version: "2.4.0",
          releaseDate: "2026-11-10T14:30:00.000Z",
          source: "direct"
        },
        {
          id: "stargazer-win-zip",
          name: "Stargazer-Orion-v2.4.0-portable.zip",
          format: "ZIP",
          sizeBytes: 46976204,
          url: "/api/downloads/package/stargazer-echoes-of-orion/Stargazer-Orion-v2.4.0-portable.zip",
          version: "2.4.0",
          releaseDate: "2026-11-10T14:30:00.000Z",
          source: "direct"
        }
      ],
      versionHistory: [
        {
          version: "2.4.0",
          date: "2026-11-10T14:30:00.000Z",
          notes: "Added Sector 14 ring-edge salvage contract, Vulkan pipeline cache warm-up, and HOTAS deadzone curves.",
          notesAr: "\u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0642\u0637\u0627\u0639 14 \u0648\u062A\u062D\u0633\u064A\u0646 \u0630\u0627\u0643\u0631\u0629 Vulkan \u0648\u062F\u0639\u0645 \u0645\u0646\u062D\u0646\u064A\u0627\u062A \u0639\u0635\u0627 \u0627\u0644\u062A\u062D\u0643\u0645."
        },
        {
          version: "2.3.1",
          date: "2026-09-22T00:00:00.000Z",
          notes: "Fixed docking clamp collision jitter at high orbital angular velocity.",
          notesAr: "\u0625\u0635\u0644\u0627\u062D \u0627\u0647\u062A\u0632\u0627\u0632 \u0627\u0644\u062A\u062D\u0627\u0645 \u0627\u0644\u0645\u0631\u0643\u0628\u0629 \u0639\u0646\u062F \u0627\u0644\u0633\u0631\u0639\u0627\u062A \u0627\u0644\u0632\u0627\u0648\u064A\u0629 \u0627\u0644\u0639\u0627\u0644\u064A\u0629."
        }
      ],
      sortOrder: 1
    },
    {
      id: "hex-fortress-tactics",
      slug: "hex-fortress-tactics",
      name: "Hex Fortress Tactics",
      nameAr: "\u062A\u0643\u062A\u064A\u0643\u0627\u062A \u0627\u0644\u0642\u0644\u0639\u0629 \u0627\u0644\u0633\u062F\u0627\u0633\u064A\u0629",
      tagline: "Turn-based isometric mech skirmish campaign set atop basalt citadels.",
      taglineAr: "\u0644\u0639\u0628\u0629 \u0627\u0633\u062A\u0631\u0627\u062A\u064A\u062C\u064A\u0629 \u0645\u062A\u0646\u0627\u0648\u0628\u0629 \u0627\u0644\u0623\u062F\u0648\u0627\u0631 \u0644\u0644\u0622\u0644\u064A\u0627\u062A \u0627\u0644\u0645\u062F\u0631\u0639\u0629 \u0641\u0648\u0642 \u0627\u0644\u0642\u0644\u0627\u0639 \u0627\u0644\u0628\u0627\u0632\u0644\u062A\u064A\u0629.",
      category: "games",
      description: "Command a four-unit tactical strike squad across destructible isometric basalt grids. Position armor facing, manage reactor heat budgets, trigger environmental chain collapses, and author custom skirmish maps using the built-in scenario compiler.",
      descriptionAr: "\u0642\u062F \u0641\u0631\u0642\u0629 \u0642\u062A\u0627\u0644\u064A\u0629 \u0645\u0646 \u0623\u0631\u0628\u0639 \u0622\u0644\u064A\u0627\u062A \u0645\u062F\u0631\u0639\u0629 \u0639\u0628\u0631 \u0634\u0628\u0643\u0627\u062A \u0628\u0627\u0632\u0644\u062A\u064A\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062A\u062F\u0645\u064A\u0631. \u0648\u062C\u0651\u0647 \u0627\u0644\u062F\u0631\u0648\u0639 \u0628\u062F\u0642\u0629\u060C \u0623\u062F\u0631 \u062D\u0631\u0627\u0631\u0629 \u0627\u0644\u0645\u0641\u0627\u0639\u0644\u0627\u062A\u060C \u0648\u0635\u0645\u0645 \u0645\u0639\u0627\u0631\u0643\u0643 \u0627\u0644\u062E\u0627\u0635\u0629 \u0639\u0628\u0631 \u0645\u062D\u0631\u0631 \u0627\u0644\u062E\u0631\u0627\u0626\u0637 \u0627\u0644\u0645\u062F\u0645\u062C.",
      features: [
        "24-mission single-player campaign with branching tactical objectives",
        "Deterministic turn-preview showing exact damage, knockback, and terrain collapse",
        "Built-in JSON scenario editor shareable via GitHub repositories",
        "Low-overhead rendering running smoothly on integrated graphics"
      ],
      featuresAr: [
        "\u062D\u0645\u0644\u0629 \u0641\u0631\u062F\u064A\u0629 \u0645\u0646 24 \u0645\u0647\u0645\u0629 \u0628\u0623\u0647\u062F\u0627\u0641 \u062A\u0643\u062A\u064A\u0643\u064A\u0629 \u0645\u062A\u0641\u0631\u0639\u0629",
        "\u0645\u0639\u0627\u064A\u0646\u0629 \u062D\u062A\u0645\u064A\u0629 \u0644\u0644\u0623\u0636\u0631\u0627\u0631 \u0648\u0627\u0644\u0627\u0631\u062A\u062F\u0627\u062F \u0648\u0627\u0646\u0647\u064A\u0627\u0631 \u0627\u0644\u062A\u0636\u0627\u0631\u064A\u0633 \u0642\u0628\u0644 \u0627\u0644\u062A\u0646\u0641\u064A\u0630",
        "\u0645\u062D\u0631\u0631 \u0633\u064A\u0646\u0627\u0631\u064A\u0648\u0647\u0627\u062A \u0645\u062F\u0645\u062C \u0628\u0635\u064A\u063A\u0629 JSON \u0642\u0627\u0628\u0644 \u0644\u0644\u0645\u0634\u0627\u0631\u0643\u0629 \u0639\u0628\u0631 GitHub",
        "\u0623\u062F\u0627\u0621 \u062E\u0641\u064A\u0641 \u064A\u0639\u0645\u0644 \u0628\u0633\u0644\u0627\u0633\u0629 \u0639\u0644\u0649 \u0628\u0637\u0627\u0642\u0627\u062A \u0627\u0644\u0631\u0633\u0648\u0645\u064A\u0627\u062A \u0627\u0644\u0645\u062F\u0645\u062C\u0629"
      ],
      icon: "/src/assets/images/game_iron_bastion_1795186839893.jpg",
      coverImage: "/src/assets/images/game_iron_bastion_1795186839893.jpg",
      screenshots: [
        "/src/assets/images/game_iron_bastion_1795186839893.jpg",
        "/src/assets/images/game_astral_drift_1795186839540.jpg"
      ],
      githubRepo: "https://github.com/kestrel-forge/hex-fortress-tactics",
      githubOwner: "kestrel-forge",
      githubRepoName: "hex-fortress-tactics",
      githubReleases: "https://github.com/kestrel-forge/hex-fortress-tactics/releases",
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: "config",
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ["Windows", "macOS"],
      technologies: ["Rust", "Bevy Engine", "WGSL Shaders"],
      systemRequirements: {
        os: "Windows 10/11 or macOS 13+",
        processor: "Dual-core 2.4 GHz",
        memory: "4 GB RAM",
        storage: "480 MB available space",
        graphics: "DirectX 12 / Metal capable GPU"
      },
      version: "1.8.2",
      releaseDate: "2026-06-05T00:00:00.000Z",
      updatedAt: "2026-10-28T09:15:00.000Z",
      developer: "Kestrel Forge",
      license: "MIT",
      manualDownloads: [
        {
          id: "hex-win-exe",
          name: "HexFortress-v1.8.2-Windows-x64.exe",
          format: "EXE",
          sizeBytes: 38294016,
          url: "/api/downloads/package/hex-fortress-tactics/HexFortress-v1.8.2-Windows-x64.exe",
          version: "1.8.2",
          releaseDate: "2026-10-28T09:15:00.000Z",
          source: "direct"
        },
        {
          id: "hex-mac-zip",
          name: "HexFortress-v1.8.2-macOS-Universal.zip",
          format: "ZIP",
          sizeBytes: 41104179,
          url: "/api/downloads/package/hex-fortress-tactics/HexFortress-v1.8.2-macOS-Universal.zip",
          version: "1.8.2",
          releaseDate: "2026-10-28T09:15:00.000Z",
          source: "direct"
        }
      ],
      versionHistory: [
        {
          version: "1.8.2",
          date: "2026-10-28T09:15:00.000Z",
          notes: "Balanced artillery heat cost and added keyboard shortcuts for undo/preview.",
          notesAr: "\u0645\u0648\u0627\u0632\u0646\u0629 \u0627\u0633\u062A\u0647\u0644\u0627\u0643 \u0627\u0644\u062D\u0631\u0627\u0631\u0629 \u0644\u0644\u0645\u062F\u0641\u0639\u064A\u0629 \u0648\u0625\u0636\u0627\u0641\u0629 \u0627\u062E\u062A\u0635\u0627\u0631\u0627\u062A \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D."
        }
      ],
      sortOrder: 2
    },
    {
      id: "pulsenote-audio",
      slug: "pulsenote-audio",
      name: "PulseNote Audio",
      nameAr: "\u0628\u0627\u0644\u0633 \u0646\u0648\u062A \u0627\u0644\u0635\u0648\u062A\u064A",
      tagline: "Offline-first markdown notebook & lossless voice memo recorder for Android.",
      taglineAr: "\u0645\u0641\u0643\u0631\u0629 \u0645\u0627\u0631\u0643\u062F\u0627\u0648\u0646 \u0645\u062D\u0644\u064A\u0629 \u0648\u0645\u0633\u062C\u0644 \u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0635\u0648\u062A\u064A\u0629 \u0639\u0627\u0644\u064A \u0627\u0644\u062C\u0648\u062F\u0629 \u0644\u0623\u0646\u062F\u0631\u0648\u064A\u062F.",
      category: "android",
      description: "PulseNote Audio combines distraction-free Markdown notes with synchronized timestamped audio waveforms. Every recording and document stays locally on your device in plain files you own, with optional encrypted Git backup.",
      descriptionAr: "\u064A\u062C\u0645\u0639 \u0628\u0627\u0644\u0633 \u0646\u0648\u062A \u0628\u064A\u0646 \u062A\u062F\u0648\u064A\u0646 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0628\u0635\u064A\u063A\u0629 \u0645\u0627\u0631\u0643\u062F\u0627\u0648\u0646 \u0648\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0645\u0642\u0627\u0637\u0639 \u0627\u0644\u0635\u0648\u062A\u064A\u0629 \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0629 \u0632\u0645\u0646\u064A\u0627\u064B. \u062A\u0628\u0642\u0649 \u062C\u0645\u064A\u0639 \u0645\u0644\u0641\u0627\u062A\u0643 \u0645\u062D\u0644\u064A\u0627\u064B \u0639\u0644\u0649 \u062C\u0647\u0627\u0632\u0643 \u0628\u0635\u064A\u063A \u0645\u0641\u062A\u0648\u062D\u0629 \u0645\u0639 \u062E\u064A\u0627\u0631 \u0627\u0644\u0646\u0633\u062E \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A \u0627\u0644\u0645\u0634\u0641\u0631.",
      features: [
        "Instant Markdown editing with live waveform timestamp markers",
        "Zero trackers, zero cloud lock-in, 100% offline-capable storage",
        "High-bitrate Opus and FLAC recording profiles",
        "Dark AMOLED battery-optimized interface with RTL Arabic support"
      ],
      featuresAr: [
        "\u062A\u062D\u0631\u064A\u0631 \u0641\u0648\u0631\u064A \u0628\u0635\u064A\u063A\u0629 Markdown \u0645\u0639 \u0639\u0644\u0627\u0645\u0627\u062A \u0632\u0645\u0646\u064A\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u062C\u0629 \u0627\u0644\u0635\u0648\u062A\u064A\u0629",
        "\u0628\u062F\u0648\u0646 \u062A\u062A\u0628\u0639 \u0623\u0648 \u0627\u0634\u062A\u0631\u0627\u0643\u0627\u062A \u0633\u062D\u0627\u0628\u064A\u0629 \u2014 \u062A\u062E\u0632\u064A\u0646 \u0645\u062D\u0644\u064A \u0643\u0627\u0645\u0644 \u0639\u0644\u0649 \u0627\u0644\u062C\u0647\u0627\u0632",
        "\u062A\u0633\u062C\u064A\u0644 \u0635\u0648\u062A\u064A \u0639\u0627\u0644\u064A \u0627\u0644\u062C\u0648\u062F\u0629 \u0628\u0635\u064A\u063A Opus \u0648 FLAC",
        "\u0648\u0627\u062C\u0647\u0629 \u062F\u0627\u0643\u0646\u0629 \u0645\u0648\u0641\u0631\u0629 \u0644\u0637\u0627\u0642\u0629 \u0634\u0627\u0634\u0627\u062A AMOLED \u0645\u0639 \u062F\u0639\u0645 \u0643\u0627\u0645\u0644 \u0644\u0644\u0639\u0631\u0628\u064A\u0629"
      ],
      icon: "/src/assets/images/app_pulsenote_android_1795186839616.jpg",
      coverImage: "/src/assets/images/app_pulsenote_android_1795186839616.jpg",
      screenshots: [
        "/src/assets/images/app_pulsenote_android_1795186839616.jpg",
        "/src/assets/images/app_droidguard_android_1795186839608.jpg"
      ],
      githubRepo: "https://github.com/kestrel-forge/pulsenote-android",
      githubOwner: "kestrel-forge",
      githubRepoName: "pulsenote-android",
      githubReleases: "https://github.com/kestrel-forge/pulsenote-android/releases",
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: "config",
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ["Android"],
      technologies: ["Kotlin", "Jetpack Compose", "Room SQLite", "Oboe Audio"],
      systemRequirements: {
        os: "Android 10 (API 29) or higher",
        memory: "2 GB RAM minimum",
        storage: "45 MB installation space"
      },
      version: "3.1.0",
      releaseDate: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-11-08T18:45:00.000Z",
      developer: "Kestrel Forge",
      license: "Apache-2.0",
      manualDownloads: [
        {
          id: "pulsenote-arm64",
          name: "PulseNote-v3.1.0-arm64-v8a.apk",
          format: "APK",
          sizeBytes: 14889779,
          url: "/api/downloads/package/pulsenote-audio/PulseNote-v3.1.0-arm64-v8a.apk",
          version: "3.1.0",
          releaseDate: "2026-11-08T18:45:00.000Z",
          source: "direct"
        },
        {
          id: "pulsenote-universal",
          name: "PulseNote-v3.1.0-universal.apk",
          format: "APK",
          sizeBytes: 22439526,
          url: "/api/downloads/package/pulsenote-audio/PulseNote-v3.1.0-universal.apk",
          version: "3.1.0",
          releaseDate: "2026-11-08T18:45:00.000Z",
          source: "direct"
        }
      ],
      versionHistory: [
        {
          version: "3.1.0",
          date: "2026-11-08T18:45:00.000Z",
          notes: "Added hardware noise-suppression toggle and Markdown table preview.",
          notesAr: "\u0625\u0636\u0627\u0641\u0629 \u062E\u064A\u0627\u0631 \u0639\u0632\u0644 \u0627\u0644\u0636\u0648\u0636\u0627\u0621 \u0648\u0645\u0639\u0627\u064A\u0646\u0629 \u0627\u0644\u062C\u062F\u0627\u0648\u0644 \u0641\u064A Markdown."
        }
      ],
      sortOrder: 3
    },
    {
      id: "sysaware-mobile",
      slug: "sysaware-mobile",
      name: "SysAware Mobile",
      nameAr: "\u0633\u064A\u0633 \u0623\u0648\u064A\u0631 \u0644\u0644\u0647\u0648\u0627\u062A\u0641",
      tagline: "Real-time Android permission auditor and local network latency inspector.",
      taglineAr: "\u0623\u062F\u0627\u0629 \u0641\u062D\u0635 \u0623\u0630\u0648\u0646\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0648\u0645\u0631\u0627\u0642\u0628\u0629 \u0623\u062F\u0627\u0621 \u0627\u0644\u0634\u0628\u0643\u0629 \u0644\u0623\u062C\u0647\u0632\u0629 \u0623\u0646\u062F\u0631\u0648\u064A\u062F.",
      category: "android",
      description: "SysAware Mobile gives developers and privacy-conscious Android users clear visibility into background sensor access, permission scopes, and active Wi-Fi/5G latency spikes without requiring root privileges.",
      descriptionAr: "\u064A\u0645\u0646\u062D \u062A\u0637\u0628\u064A\u0642 \u0633\u064A\u0633 \u0623\u0648\u064A\u0631 \u0627\u0644\u0645\u0637\u0648\u0631\u064A\u0646 \u0648\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646 \u0631\u0624\u064A\u0629 \u0648\u0627\u0636\u062D\u0629 \u0644\u0623\u0630\u0648\u0646\u0627\u062A \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0648\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u062D\u0633\u0627\u0633\u0627\u062A \u0648\u0632\u0645\u0646 \u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0634\u0628\u0643\u0629 \u062F\u0648\u0646 \u0627\u0644\u062D\u0627\u062C\u0629 \u0644\u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0631\u0648\u062A.",
      features: [
        "Inspect camera, microphone, and location permission states across installed apps",
        "Live Wi-Fi & cellular RTT latency chart with packet-loss diagnostics",
        "Export structured JSON audit reports for QA testing",
        "Lightweight 9 MB signed APK compiled via GitHub Actions"
      ],
      featuresAr: [
        "\u0641\u062D\u0635 \u062D\u0627\u0644\u0629 \u0623\u0630\u0648\u0646\u0627\u062A \u0627\u0644\u0643\u0627\u0645\u064A\u0631\u0627 \u0648\u0627\u0644\u0645\u064A\u0643\u0631\u0648\u0641\u0648\u0646 \u0648\u0627\u0644\u0645\u0648\u0642\u0639 \u0644\u062C\u0645\u064A\u0639 \u0627\u0644\u062A\u0637\u0628\u064A\u0642\u0627\u062A \u0627\u0644\u0645\u062B\u0628\u062A\u0629",
        "\u0645\u062E\u0637\u0637 \u0632\u0645\u0646\u064A \u0645\u0628\u0627\u0634\u0631 \u0644\u0632\u0645\u0646 \u0627\u0633\u062A\u062C\u0627\u0628\u0629 \u0627\u0644\u0634\u0628\u0643\u0629 \u0648\u0641\u0642\u062F\u0627\u0646 \u0627\u0644\u062D\u0632\u0645",
        "\u062A\u0635\u062F\u064A\u0631 \u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0641\u062D\u0635 \u0628\u0635\u064A\u063A\u0629 JSON \u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u062C\u0648\u062F\u0629",
        "\u0645\u0644\u0641 APK \u0645\u0648\u0642\u0639 \u0628\u062D\u062C\u0645 \u062E\u0641\u064A\u0641 \u0645\u0628\u0646\u064A \u0639\u0628\u0631 GitHub Actions"
      ],
      icon: "/src/assets/images/app_droidguard_android_1795186839608.jpg",
      coverImage: "/src/assets/images/app_droidguard_android_1795186839608.jpg",
      screenshots: [
        "/src/assets/images/app_droidguard_android_1795186839608.jpg",
        "/src/assets/images/app_pulsenote_android_1795186839616.jpg"
      ],
      githubRepo: "https://github.com/kestrel-forge/sysaware-mobile",
      githubOwner: "kestrel-forge",
      githubRepoName: "sysaware-mobile",
      githubReleases: "https://github.com/kestrel-forge/sysaware-mobile/releases",
      liveUrl: null,
      featured: 0,
      published: 1,
      releaseSync: 1,
      managedBy: "config",
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ["Android"],
      technologies: ["Kotlin", "Material 3", "Android ConnectivityManager"],
      systemRequirements: {
        os: "Android 11 (API 30) or higher",
        memory: "2 GB RAM",
        storage: "25 MB available space"
      },
      version: "4.1.0",
      releaseDate: "2026-03-11T00:00:00.000Z",
      updatedAt: "2026-11-02T11:20:00.000Z",
      developer: "Kestrel Forge",
      license: "GPL-3.0",
      manualDownloads: [
        {
          id: "sysaware-apk",
          name: "SysAware-v4.1.0-release.apk",
          format: "APK",
          sizeBytes: 9437184,
          url: "/api/downloads/package/sysaware-mobile/SysAware-v4.1.0-release.apk",
          version: "4.1.0",
          releaseDate: "2026-11-02T11:20:00.000Z",
          source: "direct"
        }
      ],
      versionHistory: [
        {
          version: "4.1.0",
          date: "2026-11-02T11:20:00.000Z",
          notes: "Added Android 15 foreground service audit flags and dark contrast polish.",
          notesAr: "\u0625\u0636\u0627\u0641\u0629 \u0641\u062D\u0635 \u062E\u062F\u0645\u0627\u062A \u0627\u0644\u062E\u0644\u0641\u064A\u0629 \u0644\u0646\u0638\u0627\u0645 \u0623\u0646\u062F\u0631\u0648\u064A\u062F 15 \u0648\u062A\u062D\u0633\u064A\u0646 \u0627\u0644\u062A\u0628\u0627\u064A\u0646."
        }
      ],
      sortOrder: 4
    },
    {
      id: "windock-studio",
      slug: "windock-studio",
      name: "WinDock Studio",
      nameAr: "\u0648\u064A\u0646 \u062F\u0648\u0643 \u0633\u062A\u0648\u062F\u064A\u0648",
      tagline: "Precision window tiling, command palette, and workspace launcher for Windows 11.",
      taglineAr: "\u0623\u062F\u0627\u0629 \u062A\u0642\u0633\u064A\u0645 \u0627\u0644\u0646\u0648\u0627\u0641\u0630 \u0648\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0633\u0631\u064A\u0639\u0629 \u0648\u0625\u062F\u0627\u0631\u0629 \u0645\u0633\u0627\u062D\u0627\u062A \u0627\u0644\u0639\u0645\u0644 \u0644\u0648\u064A\u0646\u062F\u0648\u0632 11.",
      category: "windows",
      description: "Built in native Rust and Win32 APIs, WinDock Studio brings instant keyboard-driven window tiling, multi-monitor layout presets, and an extensible command palette to Windows 10 and 11 with under 18 MB RAM footprint.",
      descriptionAr: "\u0645\u0637\u0648\u0631 \u0628\u0644\u063A\u0629 Rust \u0648\u0648\u0627\u062C\u0647\u0627\u062A Win32 \u0627\u0644\u0623\u0635\u0644\u064A\u0629\u060C \u064A\u0648\u0641\u0631 \u0648\u064A\u0646 \u062F\u0648\u0643 \u0633\u062A\u0648\u062F\u064A\u0648 \u062A\u0642\u0633\u064A\u0645\u0627\u064B \u0641\u0648\u0631\u064A\u0627\u064B \u0644\u0644\u0646\u0648\u0627\u0641\u0630 \u0639\u0628\u0631 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0641\u0627\u062A\u064A\u062D \u0648\u0642\u0648\u0627\u0644\u0628 \u0644\u0644\u0634\u0627\u0634\u0627\u062A \u0627\u0644\u0645\u062A\u0639\u062F\u062F\u0629 \u0648\u0644\u0648\u062D\u0629 \u0623\u0648\u0627\u0645\u0631 \u0633\u0631\u064A\u0639\u0629 \u0628\u0627\u0633\u062A\u0647\u0644\u0627\u0643 \u0630\u0627\u0643\u0631\u0629 \u0623\u0642\u0644 \u0645\u0646 18 \u0645\u064A\u062C\u0627\u0628\u0627\u064A\u062A.",
      features: [
        "Sub-millisecond Win32 window snapping across multi-DPI monitors",
        "Global Ctrl+Space command palette for launching repos, scripts, and layouts",
        "Save and restore entire app workspace arrangements with one shortcut",
        "Available as signed MSI enterprise installer, EXE setup, or portable ZIP"
      ],
      featuresAr: [
        "\u062A\u0631\u062A\u064A\u0628 \u0641\u0648\u0631\u064A \u0644\u0644\u0646\u0648\u0627\u0641\u0630 \u0639\u0628\u0631 \u0627\u0644\u0634\u0627\u0634\u0627\u062A \u0627\u0644\u0645\u062A\u0639\u062F\u062F\u0629 \u0628\u062F\u0642\u0629 \u0639\u0627\u0644\u064A\u0629",
        "\u0644\u0648\u062D\u0629 \u0623\u0648\u0627\u0645\u0631 \u0634\u0627\u0645\u0644\u0629 \u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0634\u0627\u0631\u064A\u0639 \u0648\u0627\u0644\u0633\u0643\u0631\u0628\u062A\u0627\u062A \u0648\u0627\u0644\u062A\u062E\u0637\u064A\u0637\u0627\u062A",
        "\u062D\u0641\u0638 \u0648\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0645\u0633\u0627\u062D\u0627\u062A \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0643\u0627\u0645\u0644\u0629 \u0628\u0627\u062E\u062A\u0635\u0627\u0631 \u0648\u0627\u062D\u062F",
        "\u0645\u062A\u0648\u0641\u0631 \u0628\u0635\u064A\u063A\u0629 MSI \u0648 EXE \u0648\u0646\u0633\u062E\u0629 ZIP \u0645\u062D\u0645\u0648\u0644\u0629 \u0628\u062F\u0648\u0646 \u062A\u062B\u0628\u064A\u062A"
      ],
      icon: "/src/assets/images/win_windock_studio_1795186839361.jpg",
      coverImage: "/src/assets/images/win_windock_studio_1795186839361.jpg",
      screenshots: [
        "/src/assets/images/win_windock_studio_1795186839361.jpg",
        "/src/assets/images/hero_showcase_studio_1795186839580.jpg"
      ],
      githubRepo: "https://github.com/kestrel-forge/windock-studio",
      githubOwner: "kestrel-forge",
      githubRepoName: "windock-studio",
      githubReleases: "https://github.com/kestrel-forge/windock-studio/releases",
      liveUrl: null,
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: "config",
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ["Windows"],
      technologies: ["Rust", "Win32 API", "Direct2D", "WiX MSI"],
      systemRequirements: {
        os: "Windows 10 (19045+) or Windows 11 (x64 / ARM64)",
        processor: "x64 or ARM64 1.6 GHz+",
        memory: "128 MB RAM",
        storage: "35 MB available space"
      },
      version: "2.1.0",
      releaseDate: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-11-14T16:00:00.000Z",
      developer: "Kestrel Forge",
      license: "MIT",
      manualDownloads: [
        {
          id: "windock-msi",
          name: "WinDockStudio-v2.1.0-x64.msi",
          format: "MSI",
          sizeBytes: 12582912,
          url: "/api/downloads/package/windock-studio/WinDockStudio-v2.1.0-x64.msi",
          version: "2.1.0",
          releaseDate: "2026-11-14T16:00:00.000Z",
          source: "direct"
        },
        {
          id: "windock-exe",
          name: "WinDockStudio-v2.1.0-Setup.exe",
          format: "EXE",
          sizeBytes: 13107200,
          url: "/api/downloads/package/windock-studio/WinDockStudio-v2.1.0-Setup.exe",
          version: "2.1.0",
          releaseDate: "2026-11-14T16:00:00.000Z",
          source: "direct"
        },
        {
          id: "windock-zip",
          name: "WinDockStudio-v2.1.0-Portable.zip",
          format: "ZIP",
          sizeBytes: 10905190,
          url: "/api/downloads/package/windock-studio/WinDockStudio-v2.1.0-Portable.zip",
          version: "2.1.0",
          releaseDate: "2026-11-14T16:00:00.000Z",
          source: "direct"
        }
      ],
      versionHistory: [
        {
          version: "2.1.0",
          date: "2026-11-14T16:00:00.000Z",
          notes: "Added per-monitor DPI scaling memory and TOML hot-reload for custom tiling zones.",
          notesAr: "\u062A\u062D\u0633\u064A\u0646 \u062A\u0630\u0643\u0631 \u062F\u0642\u0629 \u0627\u0644\u0634\u0627\u0634\u0627\u062A \u0627\u0644\u0645\u062A\u0639\u062F\u062F\u0629 \u0648\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0641\u0648\u0631\u064A \u0644\u0645\u0644\u0641 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A."
        }
      ],
      sortOrder: 5
    },
    {
      id: "g-wave-shaderlab",
      slug: "g-wave-shaderlab",
      name: "G-Wave ShaderLab",
      nameAr: "\u0645\u062E\u062A\u0628\u0631 \u0627\u0644\u0645\u0638\u0644\u0644\u0627\u062A G-Wave",
      tagline: "Browser-based procedural wave mesh generator and real-time node graph studio.",
      taglineAr: "\u0627\u0633\u062A\u0648\u062F\u064A\u0648 \u0648\u064A\u0628 \u062A\u0641\u0627\u0639\u0644\u064A \u0644\u062A\u0648\u0644\u064A\u062F \u0627\u0644\u0634\u0628\u0643\u0627\u062A \u062B\u0644\u0627\u062B\u064A\u0629 \u0627\u0644\u0623\u0628\u0639\u0627\u062F \u0648\u062A\u062D\u0631\u064A\u0631 \u0639\u0642\u062F \u0627\u0644\u0645\u0638\u0644\u0644\u0627\u062A \u0645\u0628\u0627\u0634\u0631\u0629.",
      category: "web",
      description: "G-Wave ShaderLab runs directly in modern desktop and mobile browsers without installation. Compose procedural noise displacement pipelines, inspect real-time wireframe and glass shaders at 60 FPS, and export clean parameters for your own graphics projects.",
      descriptionAr: "\u064A\u0639\u0645\u0644 \u0645\u062E\u062A\u0628\u0631 G-Wave \u0645\u0628\u0627\u0634\u0631\u0629 \u062F\u0627\u062E\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u062F\u0648\u0646 \u062A\u062B\u0628\u064A\u062A. \u0623\u0646\u0634\u0626 \u0645\u0648\u062C\u0627\u062A \u0625\u062C\u0631\u0627\u0626\u064A\u0629 \u062B\u0644\u0627\u062B\u064A\u0629 \u0627\u0644\u0623\u0628\u0639\u0627\u062F\u060C \u0631\u0627\u0642\u0628 \u0627\u0644\u0623\u062F\u0627\u0621 \u0644\u062D\u0638\u064A\u0627\u064B \u0628\u0633\u0631\u0639\u0629 60 \u0625\u0637\u0627\u0631\u0627\u064B \u0641\u064A \u0627\u0644\u062B\u0627\u0646\u064A\u0629\u060C \u0648\u0635\u062F\u0651\u0631 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0644\u0645\u0634\u0627\u0631\u064A\u0639\u0643 \u0627\u0644\u0631\u0633\u0648\u0645\u064A\u0629.",
      features: [
        "Instant zero-install browser execution with offline PWA support",
        "Interactive procedural wave amplitude, frequency, and wireframe controls",
        "Real-time 60 FPS HTML5 Canvas / WebGL rendering pipeline",
        "Export JSON preset configurations or run standalone desktop wrapper"
      ],
      featuresAr: [
        "\u062A\u0634\u063A\u064A\u0644 \u0641\u0648\u0631\u064A \u062F\u0627\u062E\u0644 \u0627\u0644\u0645\u062A\u0635\u0641\u062D \u0645\u0639 \u062F\u0639\u0645 \u0627\u0644\u0639\u0645\u0644 \u062F\u0648\u0646 \u0627\u062A\u0635\u0627\u0644 PWA",
        "\u062A\u062D\u0643\u0645 \u062A\u0641\u0627\u0639\u0644\u064A \u0641\u064A \u062A\u0631\u062F\u062F \u0648\u0627\u0631\u062A\u0641\u0627\u0639 \u0627\u0644\u0645\u0648\u062C\u0627\u062A \u0648\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0634\u0628\u0643\u0629",
        "\u0645\u062D\u0631\u0643 \u0631\u0633\u0645 \u0645\u0628\u0627\u0634\u0631 \u0628\u0633\u0631\u0639\u0629 60 \u0625\u0637\u0627\u0631\u0627\u064B \u0641\u064A \u0627\u0644\u062B\u0627\u0646\u064A\u0629",
        "\u062A\u0635\u062F\u064A\u0631 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u0635\u0645\u064A\u0645 \u0628\u0635\u064A\u063A\u0629 JSON"
      ],
      icon: "/src/assets/images/web_shaderlab_live_1795186839510.jpg",
      coverImage: "/src/assets/images/web_shaderlab_live_1795186839510.jpg",
      screenshots: [
        "/src/assets/images/web_shaderlab_live_1795186839510.jpg",
        "/src/assets/images/hero_showcase_studio_1795186839580.jpg"
      ],
      githubRepo: "https://github.com/kestrel-forge/g-wave-shaderlab",
      githubOwner: "kestrel-forge",
      githubRepoName: "g-wave-shaderlab",
      githubReleases: "https://github.com/kestrel-forge/g-wave-shaderlab/releases",
      liveUrl: "/apps/g-wave-shaderlab",
      featured: 1,
      published: 1,
      releaseSync: 1,
      managedBy: "config",
      isSampleDemo: 1,
      assetFilter: {},
      platforms: ["Web", "PWA", "Windows", "macOS", "Linux"],
      technologies: ["TypeScript", "React", "HTML5 Canvas", "WebGL"],
      systemRequirements: {
        os: "Any modern browser (Chrome, Edge, Firefox, Safari)",
        graphics: "WebGL / Hardware-accelerated Canvas recommended"
      },
      version: "1.4.0",
      releaseDate: "2026-07-08T00:00:00.000Z",
      updatedAt: now,
      developer: "Kestrel Forge",
      license: "MIT",
      manualDownloads: [
        {
          id: "shaderlab-web-bundle",
          name: "GWave-ShaderLab-v1.4.0-StaticBundle.zip",
          format: "ZIP",
          sizeBytes: 3460300,
          url: "/api/downloads/package/g-wave-shaderlab/GWave-ShaderLab-v1.4.0-StaticBundle.zip",
          version: "1.4.0",
          releaseDate: now,
          source: "direct"
        }
      ],
      versionHistory: [
        {
          version: "1.4.0",
          date: now,
          notes: "Added interactive parameter presets and JSON export.",
          notesAr: "\u0625\u0636\u0627\u0641\u0629 \u0642\u0648\u0627\u0644\u0628 \u062C\u0627\u0647\u0632\u0629 \u0648\u062A\u0635\u062F\u064A\u0631 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0628\u0635\u064A\u063A\u0629 JSON."
        }
      ],
      sortOrder: 6
    }
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
      sortOrder: p.sortOrder
    });
  }
}
function reconcileProductsConfigFile() {
  const configPath = path.resolve(process.cwd(), "products.config.json");
  if (!fs.existsSync(configPath)) {
    return { inserted: 0, updatedConfigOwned: 0, skippedDashboardOwned: 0 };
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const entries = Array.isArray(parsed.products) ? parsed.products : [];
  let inserted = 0;
  let updatedConfigOwned = 0;
  let skippedDashboardOwned = 0;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const entry of entries) {
    const id = String(entry.id || "").trim();
    if (!id) continue;
    const existing = db.prepare("SELECT id, managed_by FROM products WHERE id = ?").get(id);
    if (existing && existing.managed_by === "dashboard") {
      skippedDashboardOwned += 1;
      continue;
    }
    const githubRepo = String(entry.githubRepo || "");
    const { owner, repo } = parseGitHubOwnerAndRepo(githubRepo);
    const slug = String(entry.slug || id);
    const payload = {
      id,
      slug,
      name: String(entry.name || id),
      nameAr: String(entry.nameAr || entry.name || id),
      tagline: String(entry.shortDescription || ""),
      taglineAr: String(entry.shortDescriptionAr || entry.shortDescription || ""),
      category: String(entry.category || "other"),
      description: String(entry.description || ""),
      descriptionAr: String(entry.descriptionAr || entry.description || ""),
      icon: String(entry.icon || entry.coverImage || ""),
      coverImage: String(entry.coverImage || ""),
      screenshotsJson: JSON.stringify(Array.isArray(entry.screenshots) ? entry.screenshots : []),
      githubRepo,
      githubOwner: owner,
      githubRepoName: repo,
      githubReleases: String(entry.githubReleases || (githubRepo ? `${githubRepo}/releases` : "")),
      liveUrl: entry.liveUrl ? String(entry.liveUrl) : null,
      featured: entry.featured ? 1 : 0,
      published: entry.published === false ? 0 : 1,
      releaseSync: entry.releaseSync === false ? 0 : 1,
      managedBy: "config",
      isSampleDemo: entry.isSampleDemo ? 1 : 0,
      assetFilterJson: JSON.stringify(entry.assetFilter || {}),
      platformsJson: JSON.stringify(Array.isArray(entry.platforms) ? entry.platforms : ["Web"]),
      technologiesJson: JSON.stringify(Array.isArray(entry.technologies) ? entry.technologies : []),
      version: String(entry.version || "1.0.0"),
      updatedAt: now
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
function mapProductRow(row) {
  const id = String(row.id);
  const githubOwner = String(row.github_owner || "");
  const githubRepoName = String(row.github_repo_name || "");
  const counts = db.prepare(
    `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
        SUM(CASE WHEN source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
        SUM(CASE WHEN source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web
       FROM download_events WHERE product_id = ?`
  ).get(id);
  return {
    id,
    slug: String(row.slug || id),
    name: String(row.name),
    nameAr: String(row.name_ar || row.name),
    tagline: String(row.tagline || ""),
    taglineAr: String(row.tagline_ar || row.tagline || ""),
    category: row.category,
    description: String(row.description),
    descriptionAr: String(row.description_ar || row.description),
    features: safeParseJson(row.features_json, []),
    featuresAr: safeParseJson(row.features_ar_json, []),
    icon: String(row.icon || ""),
    coverImage: String(row.cover_image || ""),
    screenshots: safeParseJson(row.screenshots_json, []),
    githubRepo: String(row.github_repo || ""),
    githubOwner,
    githubRepoName,
    githubReleases: String(row.github_releases || ""),
    githubApiUrl: githubOwner && githubRepoName ? `https://api.github.com/repos/${githubOwner}/${githubRepoName}/releases` : "",
    liveUrl: row.live_url ? String(row.live_url) : null,
    featured: Boolean(row.featured),
    published: row.published === void 0 ? true : Boolean(row.published),
    releaseSync: row.release_sync === void 0 ? true : Boolean(row.release_sync),
    managedBy: row.managed_by === "dashboard" ? "dashboard" : "config",
    isSampleDemo: Boolean(row.is_sample_demo),
    assetFilter: safeParseJson(row.asset_filter_json, {}),
    platforms: safeParseJson(row.platforms_json, []),
    technologies: safeParseJson(row.technologies_json, []),
    systemRequirements: safeParseJson(row.system_requirements_json, {}),
    version: String(row.version || "1.0.0"),
    releaseDate: String(row.release_date),
    updatedAt: String(row.updated_at),
    developer: String(row.developer || "Kestrel Forge"),
    license: String(row.license || "MIT"),
    manualDownloads: safeParseJson(row.manual_downloads_json, []),
    versionHistory: safeParseJson(row.version_history_json, []),
    totalDownloads: counts?.total || 0,
    directDownloads: counts?.direct || 0,
    githubClicks: counts?.github || 0,
    webLaunches: counts?.web || 0
  };
}
function safeParseJson(value, fallback) {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
function parseGitHubOwnerAndRepo(repoUrl) {
  const cleaned = repoUrl.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match = cleaned.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) return { owner: "", repo: "" };
  return { owner: match[1], repo: match[2] };
}

// server/routes.ts
import express from "express";
import multer from "multer";
import path3 from "path";
import fs3 from "fs";
import os2 from "os";
import crypto from "crypto";
import bcrypt3 from "bcryptjs";
import { z } from "zod";

// server/github.ts
import fs2 from "fs";
import path2 from "path";
var CACHE_TTL_MS = (Number(process.env.GITHUB_CACHE_TTL_MINUTES) || 15) * 60 * 1e3;
function inferAssetFormat(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".apk")) return "APK";
  if (lower.endsWith(".aab")) return "AAB";
  if (lower.endsWith(".exe")) return "EXE";
  if (lower.endsWith(".msi")) return "MSI";
  if (lower.endsWith(".zip")) return "ZIP";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "TAR.GZ";
  if (lower.endsWith(".tar.xz")) return "TAR.XZ";
  if (lower.endsWith(".dmg")) return "DMG";
  if (lower.endsWith(".pkg")) return "PKG";
  if (lower.endsWith(".appimage")) return "AppImage";
  if (lower.endsWith(".deb")) return "DEB";
  if (lower.endsWith(".rpm")) return "RPM";
  const ext = fileName.split(".").pop();
  return ext ? ext.toUpperCase() : "FILE";
}
function inferPlatformHint(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".apk") || lower.endsWith(".aab") || lower.includes("android")) return "Android";
  if (lower.endsWith(".exe") || lower.endsWith(".msi") || lower.includes("win64") || lower.includes("win32") || lower.includes("windows")) return "Windows";
  if (lower.endsWith(".dmg") || lower.endsWith(".pkg") || lower.includes("macos") || lower.includes("darwin")) return "macOS";
  if (lower.endsWith(".appimage") || lower.endsWith(".deb") || lower.endsWith(".rpm") || lower.includes("linux")) return "Linux";
  return "Cross-platform";
}
function filterAssets(assets, filter) {
  if (!filter) return assets;
  const exts = Array.isArray(filter.extensions) ? filter.extensions.map((e) => e.trim().toLowerCase().replace(/^\./, "")).filter(Boolean) : [];
  const pattern = (filter.pattern || "").trim().toLowerCase();
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
function readSnapshotFallback(productId) {
  try {
    const snapshotPath = path2.resolve(process.cwd(), "data", "releases-snapshot.json");
    if (!fs2.existsSync(snapshotPath)) return null;
    const raw = JSON.parse(fs2.readFileSync(snapshotPath, "utf-8"));
    const entry = raw.releases?.find((r) => r.productId === productId);
    if (!entry || entry.status !== "ok") return null;
    const mappedAssets = (entry.assets || []).map((a, idx) => ({
      id: idx + 1,
      name: a.name,
      size: a.sizeBytes,
      downloadUrl: a.downloadUrl,
      contentType: "application/octet-stream",
      downloadCount: a.downloadCount,
      format: inferAssetFormat(a.name),
      platformHint: inferPlatformHint(a.name)
    }));
    return {
      repoFullName: entry.repoFullName,
      latestTag: entry.latestTag,
      releaseName: entry.latestTag,
      releaseNotes: null,
      publishedAt: entry.publishedAt,
      htmlUrl: entry.htmlUrl,
      assets: mappedAssets,
      allReleases: entry.latestTag ? [
        {
          id: 1,
          tagName: entry.latestTag,
          name: entry.latestTag,
          body: "",
          publishedAt: entry.publishedAt || "",
          htmlUrl: entry.htmlUrl || "",
          prerelease: false,
          assets: mappedAssets
        }
      ] : [],
      fetchedAt: entry.publishedAt,
      fetchStatus: "ok",
      errorMessage: null
    };
  } catch {
    return null;
  }
}
function getCachedGitHubSummary(productId) {
  const row = db.prepare("SELECT * FROM github_releases_cache WHERE product_id = ?").get(productId);
  if (!row) return readSnapshotFallback(productId);
  return {
    repoFullName: String(row.repo_full_name || ""),
    latestTag: row.latest_tag ? String(row.latest_tag) : null,
    releaseName: row.release_name ? String(row.release_name) : null,
    releaseNotes: row.release_notes ? String(row.release_notes) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    htmlUrl: row.html_url ? String(row.html_url) : null,
    assets: parseJson(row.assets_json, []),
    allReleases: parseJson(row.all_releases_json, []),
    fetchedAt: row.fetched_at ? String(row.fetched_at) : null,
    fetchStatus: row.fetch_status || "error",
    errorMessage: row.error_message ? String(row.error_message) : null
  };
}
async function syncProductGitHubReleases(productId, owner, repo, force = false, assetFilter) {
  if (!owner || !repo) {
    return {
      repoFullName: "",
      latestTag: null,
      releaseName: null,
      releaseNotes: null,
      publishedAt: null,
      htmlUrl: null,
      assets: [],
      allReleases: [],
      fetchedAt: null,
      fetchStatus: "unconfigured",
      errorMessage: "No GitHub repository configured for this product."
    };
  }
  const repoFullName = `${owner}/${repo}`;
  const existing = getCachedGitHubSummary(productId);
  if (!force && existing && existing.fetchedAt && existing.repoFullName === repoFullName) {
    const age = Date.now() - new Date(existing.fetchedAt).getTime();
    if (age < CACHE_TTL_MS && existing.fetchStatus === "ok") {
      return existing;
    }
  }
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Kestrel-Forge-Marketplace/1.0",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN.trim()}`;
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8e3);
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=8`,
      { headers, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (response.status === 404) {
      const summary2 = {
        repoFullName,
        latestTag: existing?.latestTag || null,
        releaseName: existing?.releaseName || null,
        releaseNotes: existing?.releaseNotes || null,
        publishedAt: existing?.publishedAt || null,
        htmlUrl: existing?.htmlUrl || null,
        assets: existing?.assets || [],
        allReleases: existing?.allReleases || [],
        fetchedAt: now,
        fetchStatus: "not_found",
        errorMessage: `GitHub repository "${repoFullName}" was not found or has no public releases.`
      };
      upsertCache(productId, summary2);
      return summary2;
    }
    if (response.status === 403 || response.status === 429) {
      const summary2 = {
        repoFullName,
        latestTag: existing?.latestTag || null,
        releaseName: existing?.releaseName || null,
        releaseNotes: existing?.releaseNotes || null,
        publishedAt: existing?.publishedAt || null,
        htmlUrl: existing?.htmlUrl || null,
        assets: existing?.assets || [],
        allReleases: existing?.allReleases || [],
        fetchedAt: now,
        fetchStatus: "rate_limited",
        errorMessage: "GitHub API rate limit reached. Configure GITHUB_TOKEN on the server for higher limits."
      };
      upsertCache(productId, summary2);
      return summary2;
    }
    if (!response.ok) {
      throw new Error(`GitHub API responded with HTTP ${response.status}`);
    }
    const rawReleases = await response.json();
    const releases = rawReleases.filter((r) => !r.draft).map((r) => {
      const rawAssets = Array.isArray(r.assets) ? r.assets : [];
      const mappedAssets = rawAssets.map((a) => ({
        id: Number(a.id),
        name: String(a.name),
        size: Number(a.size || 0),
        downloadUrl: String(a.browser_download_url),
        contentType: String(a.content_type || "application/octet-stream"),
        downloadCount: Number(a.download_count || 0),
        format: inferAssetFormat(String(a.name)),
        platformHint: inferPlatformHint(String(a.name))
      }));
      const filteredAssets = filterAssets(mappedAssets, assetFilter);
      return {
        id: Number(r.id),
        tagName: String(r.tag_name || ""),
        name: String(r.name || r.tag_name || "Release"),
        body: String(r.body || ""),
        publishedAt: String(r.published_at || r.created_at || now),
        htmlUrl: String(r.html_url || ""),
        prerelease: Boolean(r.prerelease),
        assets: filteredAssets.length > 0 ? filteredAssets : mappedAssets
      };
    });
    const latest = releases.find((r) => !r.prerelease) || releases[0] || null;
    const summary = {
      repoFullName,
      latestTag: latest?.tagName || null,
      releaseName: latest?.name || null,
      releaseNotes: latest?.body || null,
      publishedAt: latest?.publishedAt || null,
      htmlUrl: latest?.htmlUrl || null,
      assets: latest?.assets || [],
      allReleases: releases,
      fetchedAt: now,
      fetchStatus: "ok",
      errorMessage: releases.length === 0 ? "Repository exists but has no published releases yet." : null
    };
    upsertCache(productId, summary);
    if (latest?.tagName) {
      const normalizedVersion = latest.tagName.replace(/^v/i, "");
      db.prepare("UPDATE products SET version = ?, updated_at = ? WHERE id = ?").run(
        normalizedVersion,
        latest.publishedAt || now,
        productId
      );
    }
    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to reach GitHub API";
    const summary = {
      repoFullName,
      latestTag: existing?.latestTag || null,
      releaseName: existing?.releaseName || null,
      releaseNotes: existing?.releaseNotes || null,
      publishedAt: existing?.publishedAt || null,
      htmlUrl: existing?.htmlUrl || null,
      assets: existing?.assets || [],
      allReleases: existing?.allReleases || [],
      fetchedAt: now,
      fetchStatus: "error",
      errorMessage: message
    };
    upsertCache(productId, summary);
    return summary;
  }
}
function upsertCache(productId, summary) {
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
    fetchedAt: summary.fetchedAt || (/* @__PURE__ */ new Date()).toISOString(),
    fetchStatus: summary.fetchStatus,
    errorMessage: summary.errorMessage || null
  });
}
function parseJson(val, fallback) {
  if (typeof val !== "string" || !val) return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// server/auth.ts
import jwt from "jsonwebtoken";
import bcrypt2 from "bcryptjs";
var ADMIN_COOKIE_NAME = "kf_admin_session";
var DEV_FALLBACK_SECRET = "dev-only-kestrel-forge-secret-change-in-production";
function getJwtSecret() {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured && configured !== "replace-with-strong-random-32-byte-secret") {
    return configured;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FATAL: JWT_SECRET environment variable must be configured to a strong random value in production.");
  }
  return DEV_FALLBACK_SECRET;
}
function verifyAdminCredentials(email, password) {
  const row = db.prepare("SELECT id, email, password_hash, role FROM admin_users WHERE email = ?").get(email.trim().toLowerCase());
  if (!row) return null;
  const valid = bcrypt2.compareSync(password, row.password_hash);
  if (!valid) return null;
  return {
    userId: row.id,
    email: row.email,
    role: row.role
  };
}
function signAdminToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "24h" });
}
function verifyAdminToken(token) {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    const exists = db.prepare("SELECT id, email, role FROM admin_users WHERE id = ? AND email = ?").get(decoded.userId, decoded.email);
    if (!exists) return null;
    return {
      userId: exists.id,
      email: exists.email,
      role: exists.role
    };
  } catch {
    return null;
  }
}
function requireAdmin(req, res, next) {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const payload = verifyAdminToken(token);
  if (!payload || payload.role !== "admin") {
    res.status(403).json({ error: "Admin authorization required" });
    return;
  }
  req.admin = payload;
  next();
}

// server/routes.ts
var apiRouter = express.Router();
var uploadDir = path3.resolve(process.cwd(), "public", "uploads");
try {
  fs3.mkdirSync(uploadDir, { recursive: true });
  fs3.accessSync(uploadDir, fs3.constants.W_OK);
} catch {
  uploadDir = path3.join(os2.tmpdir(), "kestrel-forge-uploads");
  fs3.mkdirSync(uploadDir, { recursive: true });
}
var storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path3.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const safeBase = path3.basename(file.originalname, path3.extname(file.originalname)).toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 40);
    cb(null, `${safeBase || "asset"}-${Date.now()}${ext}`);
  }
});
var upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPEG, WEBP, and GIF images are allowed"));
    }
  }
});
var safeUrlOrPath = z.string().max(500).refine(
  (v) => !v || v.startsWith("/") || v.startsWith("https://") || v.startsWith("http://"),
  "URL must start with https://, http://, or /"
);
var loginAttempts = /* @__PURE__ */ new Map();
var messageAttempts = /* @__PURE__ */ new Map();
function isRateLimited(bucket, key, maxRequests, windowMs) {
  const now = Date.now();
  const timestamps = (bucket.get(key) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    bucket.set(key, timestamps);
    return true;
  }
  timestamps.push(now);
  bucket.set(key, timestamps);
  return false;
}
var productSchema = z.object({
  id: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/, "ID must contain lowercase letters, numbers, and hyphens only"),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(2).max(120),
  nameAr: z.string().max(120).optional().default(""),
  tagline: z.string().max(240).optional().default(""),
  taglineAr: z.string().max(240).optional().default(""),
  category: z.enum(["games", "android", "windows", "web", "other"]),
  description: z.string().min(10).max(5e3),
  descriptionAr: z.string().max(5e3).optional().default(""),
  features: z.array(z.string().min(1).max(300)).default([]),
  featuresAr: z.array(z.string().min(1).max(300)).optional().default([]),
  icon: safeUrlOrPath.optional().default(""),
  coverImage: safeUrlOrPath.optional().default(""),
  screenshots: z.array(safeUrlOrPath).default([]),
  githubRepo: safeUrlOrPath.optional().default(""),
  githubReleases: safeUrlOrPath.optional().default(""),
  liveUrl: safeUrlOrPath.nullable().optional().default(null),
  featured: z.boolean().default(false),
  published: z.boolean().optional().default(true),
  releaseSync: z.boolean().optional().default(true),
  assetFilter: z.object({
    extensions: z.array(z.string().max(20)).optional().default([]),
    pattern: z.string().max(80).optional().default("")
  }).optional().default({ extensions: [], pattern: "" }),
  platforms: z.array(z.string().min(1).max(40)).min(1),
  technologies: z.array(z.string().min(1).max(40)).default([]),
  systemRequirements: z.object({
    os: z.string().max(120).optional(),
    processor: z.string().max(120).optional(),
    memory: z.string().max(120).optional(),
    storage: z.string().max(120).optional(),
    graphics: z.string().max(120).optional(),
    network: z.string().max(120).optional()
  }).optional().default({}),
  version: z.string().min(1).max(40),
  releaseDate: z.string().optional(),
  developer: z.string().max(80).optional().default("Kestrel Forge"),
  license: z.string().max(80).optional().default("MIT"),
  manualDownloads: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      format: z.string().min(1),
      sizeBytes: z.number().nonnegative(),
      url: safeUrlOrPath.refine((v) => v.length > 0, "Download URL is required"),
      version: z.string().min(1),
      releaseDate: z.string().min(1),
      source: z.enum(["direct", "github"]).default("direct"),
      sha256: z.string().optional()
    })
  ).default([]),
  versionHistory: z.array(
    z.object({
      version: z.string().min(1),
      date: z.string().min(1),
      notes: z.string().min(1),
      notesAr: z.string().optional()
    })
  ).default([])
});
function computePlatformStats() {
  const rows = db.prepare("SELECT category FROM products WHERE published = 1").all();
  const downloads = db.prepare(
    `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
        SUM(CASE WHEN source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
        SUM(CASE WHEN source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web
       FROM download_events`
  ).get();
  const totalGames = rows.filter((r) => r.category === "games").length;
  const totalAndroid = rows.filter((r) => r.category === "android").length;
  const totalWindows = rows.filter((r) => r.category === "windows").length;
  const totalWeb = rows.filter((r) => r.category === "web").length;
  return {
    totalProducts: rows.length,
    totalGames,
    totalApplications: rows.length - totalGames,
    totalAndroid,
    totalWindows,
    totalWeb,
    totalDownloads: downloads?.total || 0,
    directDownloads: downloads?.direct || 0,
    githubReleaseClicks: downloads?.github || 0,
    webAppLaunches: downloads?.web || 0
  };
}
apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
apiRouter.get("/stats", (_req, res) => {
  res.json(computePlatformStats());
});
apiRouter.get("/categories", (_req, res) => {
  const categories = db.prepare(
    `SELECT c.*, COUNT(p.id) as productCount
       FROM categories c
       LEFT JOIN products p ON p.category = c.id AND p.published = 1
       GROUP BY c.id
       ORDER BY c.sort_order ASC`
  ).all();
  const mapped = categories.map((c) => ({
    id: String(c.id),
    slug: String(c.slug),
    name: String(c.name),
    nameAr: String(c.name_ar),
    description: String(c.description),
    descriptionAr: String(c.description_ar),
    productCount: Number(c.productCount || 0)
  }));
  res.json(mapped);
});
apiRouter.get("/products", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const category = String(req.query.category || "").trim().toLowerCase();
  const platform = String(req.query.platform || "").trim().toLowerCase();
  const os4 = String(req.query.os || "").trim().toLowerCase();
  const productType = String(req.query.type || "all").trim().toLowerCase();
  const featuredOnly = req.query.featured === "true";
  const sort = String(req.query.sort || "newest");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
  const includeUnpublishedRequested = req.query.includeUnpublished === "true";
  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const isAdmin = Boolean(adminToken && verifyAdminToken(adminToken));
  const includeUnpublished = includeUnpublishedRequested && isAdmin;
  const sql = includeUnpublished ? "SELECT * FROM products ORDER BY sort_order ASC, updated_at DESC" : "SELECT * FROM products WHERE published = 1 ORDER BY sort_order ASC, updated_at DESC";
  const rows = db.prepare(sql).all();
  let products = rows.map((row) => {
    const product = mapProductRow(row);
    product.githubCache = getCachedGitHubSummary(product.id);
    return product;
  });
  if (category && category !== "all") {
    products = products.filter((p) => p.category === category);
  }
  if (featuredOnly) {
    products = products.filter((p) => p.featured);
  }
  if (productType === "downloadable") {
    products = products.filter((p) => p.manualDownloads.length > 0 || (p.githubCache?.assets.length ?? 0) > 0 || !p.liveUrl);
  } else if (productType === "web") {
    products = products.filter((p) => Boolean(p.liveUrl));
  } else if (productType === "hybrid") {
    products = products.filter((p) => Boolean(p.liveUrl) && p.manualDownloads.length > 0);
  }
  if (platform && platform !== "all") {
    products = products.filter((p) => p.platforms.some((pl) => pl.toLowerCase() === platform));
  }
  if (os4 && os4 !== "all") {
    products = products.filter(
      (p) => p.platforms.some((pl) => pl.toLowerCase().includes(os4)) || (p.systemRequirements.os || "").toLowerCase().includes(os4)
    );
  }
  if (q) {
    products = products.filter((p) => {
      const haystack = [
        p.name,
        p.nameAr,
        p.tagline,
        p.taglineAr,
        p.description,
        p.descriptionAr,
        p.category,
        ...p.features,
        ...p.featuresAr,
        ...p.platforms,
        ...p.technologies
      ].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }
  if (sort === "alpha") {
    products.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === "popular") {
    products.sort((a, b) => {
      if (b.totalDownloads !== a.totalDownloads) return b.totalDownloads - a.totalDownloads;
      if (b.featured !== a.featured) return Number(b.featured) - Number(a.featured);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  } else if (sort === "updated") {
    products.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  } else {
    products.sort((a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime());
  }
  const total = products.length;
  const start = (page - 1) * limit;
  const items = products.slice(start, start + limit);
  res.json({
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit))
  });
});
apiRouter.get("/products/:id", async (req, res) => {
  const row = db.prepare("SELECT * FROM products WHERE id = ? OR slug = ?").get(req.params.id, req.params.id);
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const isAdmin = Boolean(adminToken && verifyAdminToken(adminToken));
  if (!row.published && !isAdmin) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const product = mapProductRow(row);
  let githubCache = getCachedGitHubSummary(product.id);
  if (product.releaseSync && product.githubOwner && product.githubRepoName) {
    githubCache = await syncProductGitHubReleases(
      product.id,
      product.githubOwner,
      product.githubRepoName,
      false,
      product.assetFilter
    );
  }
  product.githubCache = githubCache;
  const relatedRows = db.prepare("SELECT * FROM products WHERE id != ? AND published = 1 AND category = ? ORDER BY featured DESC, updated_at DESC LIMIT 3").all(product.id, product.category);
  const fallbackRows = relatedRows.length < 3 ? db.prepare("SELECT * FROM products WHERE id != ? AND published = 1 ORDER BY featured DESC, updated_at DESC LIMIT ?").all(product.id, 3) : relatedRows;
  const related = (relatedRows.length > 0 ? relatedRows : fallbackRows).map(mapProductRow);
  res.json({ product, related });
});
apiRouter.get("/products/:id/github-releases", async (req, res) => {
  const row = db.prepare("SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE id = ? OR slug = ?").get(req.params.id, req.params.id);
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const filter = JSON.parse(row.asset_filter_json || "{}");
  const summary = await syncProductGitHubReleases(row.id, row.github_owner, row.github_repo_name, false, filter);
  res.json(summary);
});
var trackSchema = z.object({
  productId: z.string().min(1).max(80),
  fileName: z.string().min(1).max(200),
  fileFormat: z.string().min(1).max(30),
  sourceType: z.enum(["direct_file", "github_release_click", "web_app_launch"]),
  version: z.string().max(40).optional().default("")
});
apiRouter.post("/downloads/track", (req, res) => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid download tracking payload" });
    return;
  }
  const { productId, fileName, fileFormat, sourceType, version } = parsed.data;
  const exists = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);
  if (!exists) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  db.prepare(
    `INSERT INTO download_events (product_id, file_name, file_format, source_type, version, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(productId, fileName, fileFormat, sourceType, version, (/* @__PURE__ */ new Date()).toISOString());
  res.json({ ok: true });
});
apiRouter.get("/downloads/package/:productId/:fileName", (req, res) => {
  const { productId, fileName } = req.params;
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const product = mapProductRow(row);
  const asset = product.manualDownloads.find((d) => d.name === fileName);
  if (!asset) {
    res.status(404).json({ error: "Requested build artifact not found" });
    return;
  }
  db.prepare(
    `INSERT INTO download_events (product_id, file_name, file_format, source_type, version, created_at)
     VALUES (?, ?, ?, 'direct_file', ?, ?)`
  ).run(product.id, asset.name, asset.format, asset.version || product.version, (/* @__PURE__ */ new Date()).toISOString());
  const releaseManifest = {
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
    note: "Development mode sample release manifest. In production, link a GitHub Repository with published Releases or host compiled binaries in Cloudflare R2.",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const payload = JSON.stringify(releaseManifest, null, 2);
  res.setHeader("Content-Disposition", `attachment; filename="${asset.name}.manifest.json"`);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(payload);
});
apiRouter.post("/webhooks/github", async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig = String(req.headers["x-hub-signature-256"] || "");
    const rawBody = req.rawBody;
    const payloadBuffer = rawBody || Buffer.from(JSON.stringify(req.body));
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payloadBuffer).digest("hex");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
  }
  const event = String(req.headers["x-github-event"] || "");
  const repoFullName = String(req.body?.repository?.full_name || "");
  if (event === "ping") {
    res.json({ ok: true, pong: true });
    return;
  }
  if (event === "release" && repoFullName) {
    const [owner, repo] = repoFullName.split("/");
    const matching = db.prepare("SELECT id, asset_filter_json FROM products WHERE LOWER(github_owner) = LOWER(?) AND LOWER(github_repo_name) = LOWER(?) AND release_sync = 1").all(owner, repo);
    for (const prod of matching) {
      await syncProductGitHubReleases(prod.id, owner, repo, true, JSON.parse(prod.asset_filter_json || "{}"));
    }
    res.json({ ok: true, syncedProducts: matching.length });
    return;
  }
  res.json({ ok: true, ignored: true });
});
var messageSchema = z.object({
  type: z.enum(["contact", "bug_report"]),
  productId: z.string().max(80).nullable().optional().default(null),
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  subject: z.string().min(3).max(160),
  message: z.string().min(10).max(3e3)
});
apiRouter.post("/messages", (req, res) => {
  const ip = req.ip || "unknown";
  if (isRateLimited(messageAttempts, ip, 10, 15 * 60 * 1e3)) {
    res.status(429).json({ error: "Too many submissions. Please try again later." });
    return;
  }
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid submission" });
    return;
  }
  const { type, productId, name, email, subject, message } = parsed.data;
  const cleanText = (s) => s.replace(/[<>]/g, "").trim();
  const result = db.prepare(
    `INSERT INTO messages (type, product_id, name, email, subject, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
  ).run(
    type,
    productId || null,
    cleanText(name),
    email.trim().toLowerCase(),
    cleanText(subject),
    cleanText(message),
    (/* @__PURE__ */ new Date()).toISOString()
  );
  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});
apiRouter.post("/auth/login", (req, res) => {
  const ip = req.ip || "unknown";
  if (isRateLimited(loginAttempts, ip, 10, 15 * 60 * 1e3)) {
    res.status(429).json({ error: "Too many login attempts. Please wait 15 minutes." });
    return;
  }
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email and password are required" });
    return;
  }
  const admin = verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!admin) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  const token = signAdminToken(admin);
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 24 * 60 * 60 * 1e3,
    path: "/"
  });
  res.json({ user: admin });
});
apiRouter.post("/auth/logout", (_req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});
apiRouter.get("/auth/me", (req, res) => {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    res.json({ user: null });
    return;
  }
  const user = verifyAdminToken(token);
  res.json({ user });
});
apiRouter.post("/admin/change-password", requireAdmin, (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }
  const user = req.admin;
  const verified = verifyAdminCredentials(user.email, parsed.data.currentPassword);
  if (!verified) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }
  const newHash = bcrypt3.hashSync(parsed.data.newPassword, 10);
  db.prepare("UPDATE admin_users SET password_hash = ? WHERE id = ?").run(newHash, user.userId);
  res.json({ ok: true });
});
apiRouter.post("/admin/reconcile-config", requireAdmin, (_req, res) => {
  const summary = reconcileProductsConfigFile();
  res.json(summary);
});
apiRouter.post("/admin/products", requireAdmin, (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Validation failed" });
    return;
  }
  const data = parsed.data;
  const effectiveSlug = data.slug || data.id;
  const existing = db.prepare("SELECT id, slug FROM products WHERE id = ? OR slug = ?").get(data.id, effectiveSlug);
  if (existing) {
    res.status(409).json({
      error: existing.id === data.id ? "A product with this ID already exists" : "A product with this URL slug already exists"
    });
    return;
  }
  const { owner, repo } = parseGitHubOwnerAndRepo(data.githubRepo || "");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `INSERT INTO products (
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
      @featured, @published, @releaseSync, 'dashboard', 0, @assetFilterJson,
      @platformsJson, @technologiesJson, @systemRequirementsJson,
      @version, @releaseDate, @updatedAt, @developer, @license,
      @manualDownloadsJson, @versionHistoryJson, @sortOrder
    )`
  ).run({
    id: data.id,
    slug: data.slug || data.id,
    name: data.name,
    nameAr: data.nameAr || data.name,
    tagline: data.tagline,
    taglineAr: data.taglineAr || data.tagline,
    category: data.category,
    description: data.description,
    descriptionAr: data.descriptionAr || data.description,
    featuresJson: JSON.stringify(data.features),
    featuresArJson: JSON.stringify(data.featuresAr || data.features),
    icon: data.icon || data.coverImage,
    coverImage: data.coverImage,
    screenshotsJson: JSON.stringify(data.screenshots),
    githubRepo: data.githubRepo,
    githubOwner: owner,
    githubRepoName: repo,
    githubReleases: data.githubReleases || (data.githubRepo ? `${data.githubRepo.replace(/\/+$/, "")}/releases` : ""),
    liveUrl: data.liveUrl || null,
    featured: data.featured ? 1 : 0,
    published: data.published ? 1 : 0,
    releaseSync: data.releaseSync ? 1 : 0,
    assetFilterJson: JSON.stringify(data.assetFilter || {}),
    platformsJson: JSON.stringify(data.platforms),
    technologiesJson: JSON.stringify(data.technologies),
    systemRequirementsJson: JSON.stringify(data.systemRequirements),
    version: data.version,
    releaseDate: data.releaseDate || now,
    updatedAt: now,
    developer: data.developer,
    license: data.license,
    manualDownloadsJson: JSON.stringify(data.manualDownloads),
    versionHistoryJson: JSON.stringify(data.versionHistory),
    sortOrder: 0
  });
  const row = db.prepare("SELECT * FROM products WHERE id = ?").get(data.id);
  res.status(201).json(mapProductRow(row));
});
apiRouter.put("/admin/products/:id", requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const parsed = productSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Validation failed" });
    return;
  }
  const data = parsed.data;
  const effectiveSlug = data.slug || data.id;
  const slugConflict = db.prepare("SELECT id FROM products WHERE slug = ? AND id != ?").get(effectiveSlug, data.id);
  if (slugConflict) {
    res.status(409).json({ error: "Another product already uses this URL slug" });
    return;
  }
  const { owner, repo } = parseGitHubOwnerAndRepo(data.githubRepo || "");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db.prepare(
    `UPDATE products SET
      slug = @slug,
      name = @name,
      name_ar = @nameAr,
      tagline = @tagline,
      tagline_ar = @taglineAr,
      category = @category,
      description = @description,
      description_ar = @descriptionAr,
      features_json = @featuresJson,
      features_ar_json = @featuresArJson,
      icon = @icon,
      cover_image = @coverImage,
      screenshots_json = @screenshotsJson,
      github_repo = @githubRepo,
      github_owner = @githubOwner,
      github_repo_name = @githubRepoName,
      github_releases = @githubReleases,
      live_url = @liveUrl,
      featured = @featured,
      published = @published,
      release_sync = @releaseSync,
      managed_by = 'dashboard',
      asset_filter_json = @assetFilterJson,
      platforms_json = @platformsJson,
      technologies_json = @technologiesJson,
      system_requirements_json = @systemRequirementsJson,
      version = @version,
      release_date = @releaseDate,
      updated_at = @updatedAt,
      developer = @developer,
      license = @license,
      manual_downloads_json = @manualDownloadsJson,
      version_history_json = @versionHistoryJson
     WHERE id = @id`
  ).run({
    id: data.id,
    slug: data.slug || data.id,
    name: data.name,
    nameAr: data.nameAr || data.name,
    tagline: data.tagline,
    taglineAr: data.taglineAr || data.tagline,
    category: data.category,
    description: data.description,
    descriptionAr: data.descriptionAr || data.description,
    featuresJson: JSON.stringify(data.features),
    featuresArJson: JSON.stringify(data.featuresAr || data.features),
    icon: data.icon || data.coverImage,
    coverImage: data.coverImage,
    screenshotsJson: JSON.stringify(data.screenshots),
    githubRepo: data.githubRepo,
    githubOwner: owner,
    githubRepoName: repo,
    githubReleases: data.githubReleases || (data.githubRepo ? `${data.githubRepo.replace(/\/+$/, "")}/releases` : ""),
    liveUrl: data.liveUrl || null,
    featured: data.featured ? 1 : 0,
    published: data.published ? 1 : 0,
    releaseSync: data.releaseSync ? 1 : 0,
    assetFilterJson: JSON.stringify(data.assetFilter || {}),
    platformsJson: JSON.stringify(data.platforms),
    technologiesJson: JSON.stringify(data.technologies),
    systemRequirementsJson: JSON.stringify(data.systemRequirements),
    version: data.version,
    releaseDate: data.releaseDate || String(existing.release_date),
    updatedAt: now,
    developer: data.developer,
    license: data.license,
    manualDownloadsJson: JSON.stringify(data.manualDownloads),
    versionHistoryJson: JSON.stringify(data.versionHistory)
  });
  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(data.id);
  res.json(mapProductRow(updated));
});
apiRouter.delete("/admin/products/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json({ ok: true });
});
apiRouter.post("/admin/products/:id/sync-github", requireAdmin, async (req, res) => {
  const row = db.prepare("SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE id = ?").get(req.params.id);
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const filter = JSON.parse(row.asset_filter_json || "{}");
  const summary = await syncProductGitHubReleases(row.id, row.github_owner, row.github_repo_name, true, filter);
  res.json(summary);
});
apiRouter.post("/admin/sync-all-github", requireAdmin, async (_req, res) => {
  const rows = db.prepare('SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE release_sync = 1 AND github_owner != "" AND github_repo_name != ""').all();
  const results = [];
  for (const row of rows) {
    const filter = JSON.parse(row.asset_filter_json || "{}");
    const summary = await syncProductGitHubReleases(row.id, row.github_owner, row.github_repo_name, true, filter);
    results.push({ productId: row.id, status: summary.fetchStatus, latestTag: summary.latestTag });
  }
  res.json({ synced: results.length, results });
});
apiRouter.post("/admin/upload", requireAdmin, upload.single("image"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image file provided" });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});
apiRouter.get("/admin/analytics", requireAdmin, (_req, res) => {
  const stats = computePlatformStats();
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = /* @__PURE__ */ new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const isoDate = d.toISOString().slice(0, 10);
    days.push({ date: isoDate, direct: 0, github: 0, web: 0, total: 0 });
  }
  const rawDaily = db.prepare(
    `SELECT substr(created_at, 1, 10) as day, source_type, COUNT(*) as count
       FROM download_events
       WHERE created_at >= date('now', '-14 days')
       GROUP BY day, source_type`
  ).all();
  for (const row of rawDaily) {
    const bucket = days.find((d) => d.date === row.day);
    if (!bucket) continue;
    if (row.source_type === "direct_file") bucket.direct += row.count;
    if (row.source_type === "github_release_click") bucket.github += row.count;
    if (row.source_type === "web_app_launch") bucket.web += row.count;
    bucket.total += row.count;
  }
  const byProduct = db.prepare(
    `SELECT
         p.id as productId,
         p.name as productName,
         p.category as category,
         SUM(CASE WHEN e.source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
         SUM(CASE WHEN e.source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
         SUM(CASE WHEN e.source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web,
         COUNT(e.id) as total
       FROM products p
       LEFT JOIN download_events e ON e.product_id = p.id
       GROUP BY p.id
       ORDER BY total DESC, p.name ASC`
  ).all();
  const byPlatform = db.prepare(
    `SELECT
         CASE
           WHEN UPPER(file_format) = 'APK' OR UPPER(file_format) = 'AAB' THEN 'Android'
           WHEN UPPER(file_format) IN ('EXE', 'MSI') THEN 'Windows'
           WHEN UPPER(file_format) = 'WEB' THEN 'Web'
           ELSE 'Cross-platform'
         END as platform,
         COUNT(*) as count
       FROM download_events
       GROUP BY platform
       ORDER BY count DESC`
  ).all();
  const byVersion = db.prepare(
    `SELECT CASE WHEN version = '' THEN 'Unspecified' ELSE version END as version, COUNT(*) as count
       FROM download_events
       GROUP BY version
       ORDER BY count DESC
       LIMIT 10`
  ).all();
  const byFormat = db.prepare(
    `SELECT file_format as format, COUNT(*) as count
       FROM download_events
       GROUP BY file_format
       ORDER BY count DESC`
  ).all();
  const recentEvents = db.prepare(
    `SELECT e.id, e.product_id as productId, p.name as productName,
              e.file_name as fileName, e.file_format as fileFormat,
              e.source_type as sourceType, e.version, e.created_at as createdAt
       FROM download_events e
       JOIN products p ON p.id = e.product_id
       ORDER BY e.id DESC
       LIMIT 30`
  ).all();
  res.json({
    stats,
    dailySeries: days,
    byProduct,
    byPlatform,
    byVersion,
    byFormat,
    recentEvents
  });
});
apiRouter.get("/admin/messages", requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT * FROM messages ORDER BY id DESC").all();
  res.json(
    rows.map((r) => ({
      id: Number(r.id),
      type: r.type,
      productId: r.product_id ? String(r.product_id) : null,
      name: String(r.name),
      email: String(r.email),
      subject: String(r.subject),
      message: String(r.message),
      status: String(r.status),
      createdAt: String(r.created_at)
    }))
  );
});
apiRouter.patch("/admin/messages/:id", requireAdmin, (req, res) => {
  const status = req.body?.status === "open" ? "open" : "resolved";
  const result = db.prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  res.json({ ok: true });
});

// server.ts
dotenv.config();
async function startServer() {
  initDatabase();
  const app = express2();
  const isProd = process.env.NODE_ENV === "production";
  const PORT = isProd ? Number(process.env.PORT) || 3e3 : 3e3;
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/admin")) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });
  app.use(
    express2.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(cookieParser());
  let uploadsDir = path4.resolve(process.cwd(), "public", "uploads");
  try {
    fs4.mkdirSync(uploadsDir, { recursive: true });
    fs4.accessSync(uploadsDir, fs4.constants.W_OK);
  } catch {
    uploadsDir = path4.join(os3.tmpdir(), "kestrel-forge-uploads");
    fs4.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express2.static(uploadsDir));
  app.get("/robots.txt", (req, res) => {
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    res.type("text/plain").send(`User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${baseUrl}/sitemap.xml
`);
  });
  app.get("/sitemap.xml", (req, res) => {
    const baseUrl = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const staticPaths = ["/", "/products", "/games", "/android", "/windows", "/web-apps", "/about", "/contact", "/privacy", "/terms"];
    const products = db.prepare("SELECT slug, updated_at FROM products WHERE published = 1").all();
    const urls = [
      ...staticPaths.map((p) => `<url><loc>${baseUrl}${p}</loc><changefreq>weekly</changefreq></url>`),
      ...products.map(
        (p) => `<url><loc>${baseUrl}/product/${encodeURIComponent(p.slug)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod><changefreq>weekly</changefreq></url>`
      )
    ].join("\n  ");
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls}
</urlset>`);
  });
  app.use("/api", apiRouter);
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path4.resolve(process.cwd(), "dist");
    app.use(express2.static(distDir, { index: false }));
    app.get("*", (_req, res) => {
      res.sendFile(path4.join(distDir, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Kestrel Forge server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
