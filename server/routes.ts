import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db, mapProductRow, parseGitHubOwnerAndRepo, reconcileProductsConfigFile } from './db.ts';
import { getCachedGitHubSummary, syncProductGitHubReleases } from './github.ts';
import {
  ADMIN_COOKIE_NAME,
  requireAdmin,
  signAdminToken,
  verifyAdminCredentials,
  verifyAdminToken,
  type AuthenticatedRequest,
} from './auth.ts';
import type { AnalyticsSummary, CategoryInfo, PlatformStats, Product } from '../src/types/product.ts';

export const apiRouter = express.Router();

let uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.accessSync(uploadDir, fs.constants.W_OK);
} catch {
  uploadDir = path.join(os.tmpdir(), 'kestrel-forge-uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .slice(0, 40);
    cb(null, `${safeBase || 'asset'}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPEG, WEBP, and GIF images are allowed'));
    }
  },
});

const safeUrlOrPath = z
  .string()
  .max(500)
  .refine(
    (v) => !v || v.startsWith('/') || v.startsWith('https://') || v.startsWith('http://'),
    'URL must start with https://, http://, or /'
  );

const loginAttempts = new Map<string, number[]>();
const messageAttempts = new Map<string, number[]>();

function isRateLimited(bucket: Map<string, number[]>, key: string, maxRequests: number, windowMs: number): boolean {
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

const productSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'ID must contain lowercase letters, numbers, and hyphens only'),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  name: z.string().min(2).max(120),
  nameAr: z.string().max(120).optional().default(''),
  tagline: z.string().max(240).optional().default(''),
  taglineAr: z.string().max(240).optional().default(''),
  category: z.enum(['games', 'android', 'windows', 'web', 'other']),
  description: z.string().min(10).max(5000),
  descriptionAr: z.string().max(5000).optional().default(''),
  features: z.array(z.string().min(1).max(300)).default([]),
  featuresAr: z.array(z.string().min(1).max(300)).optional().default([]),
  icon: safeUrlOrPath.optional().default(''),
  coverImage: safeUrlOrPath.optional().default(''),
  screenshots: z.array(safeUrlOrPath).default([]),
  githubRepo: safeUrlOrPath.optional().default(''),
  githubReleases: safeUrlOrPath.optional().default(''),
  liveUrl: safeUrlOrPath.nullable().optional().default(null),
  featured: z.boolean().default(false),
  published: z.boolean().optional().default(true),
  releaseSync: z.boolean().optional().default(true),
  assetFilter: z
    .object({
      extensions: z.array(z.string().max(20)).optional().default([]),
      pattern: z.string().max(80).optional().default(''),
    })
    .optional()
    .default({ extensions: [], pattern: '' }),
  platforms: z.array(z.string().min(1).max(40)).min(1),
  technologies: z.array(z.string().min(1).max(40)).default([]),
  systemRequirements: z
    .object({
      os: z.string().max(120).optional(),
      processor: z.string().max(120).optional(),
      memory: z.string().max(120).optional(),
      storage: z.string().max(120).optional(),
      graphics: z.string().max(120).optional(),
      network: z.string().max(120).optional(),
    })
    .optional()
    .default({}),
  version: z.string().min(1).max(40),
  releaseDate: z.string().optional(),
  developer: z.string().max(80).optional().default('Kestrel Forge'),
  license: z.string().max(80).optional().default('MIT'),
  manualDownloads: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        format: z.string().min(1),
        sizeBytes: z.number().nonnegative(),
        url: safeUrlOrPath.refine((v) => v.length > 0, 'Download URL is required'),
        version: z.string().min(1),
        releaseDate: z.string().min(1),
        source: z.enum(['direct', 'github']).default('direct'),
        sha256: z.string().optional(),
      })
    )
    .default([]),
  versionHistory: z
    .array(
      z.object({
        version: z.string().min(1),
        date: z.string().min(1),
        notes: z.string().min(1),
        notesAr: z.string().optional(),
      })
    )
    .default([]),
});

function computePlatformStats(): PlatformStats {
  const rows = db.prepare('SELECT category FROM products WHERE published = 1').all() as Array<{ category: string }>;
  const downloads = db
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN source_type = 'direct_file' THEN 1 ELSE 0 END) as direct,
        SUM(CASE WHEN source_type = 'github_release_click' THEN 1 ELSE 0 END) as github,
        SUM(CASE WHEN source_type = 'web_app_launch' THEN 1 ELSE 0 END) as web
       FROM download_events`
    )
    .get() as { total: number; direct: number | null; github: number | null; web: number | null };

  const totalGames = rows.filter((r) => r.category === 'games').length;
  const totalAndroid = rows.filter((r) => r.category === 'android').length;
  const totalWindows = rows.filter((r) => r.category === 'windows').length;
  const totalWeb = rows.filter((r) => r.category === 'web').length;

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
    webAppLaunches: downloads?.web || 0,
  };
}

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

apiRouter.get('/stats', (_req, res) => {
  res.json(computePlatformStats());
});

apiRouter.get('/categories', (_req, res) => {
  const categories = db
    .prepare(
      `SELECT c.*, COUNT(p.id) as productCount
       FROM categories c
       LEFT JOIN products p ON p.category = c.id AND p.published = 1
       GROUP BY c.id
       ORDER BY c.sort_order ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const mapped: CategoryInfo[] = categories.map((c) => ({
    id: String(c.id) as CategoryInfo['id'],
    slug: String(c.slug),
    name: String(c.name),
    nameAr: String(c.name_ar),
    description: String(c.description),
    descriptionAr: String(c.description_ar),
    productCount: Number(c.productCount || 0),
  }));

  res.json(mapped);
});

apiRouter.get('/products', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim().toLowerCase();
  const platform = String(req.query.platform || '').trim().toLowerCase();
  const os = String(req.query.os || '').trim().toLowerCase();
  const productType = String(req.query.type || 'all').trim().toLowerCase();
  const featuredOnly = req.query.featured === 'true';
  const sort = String(req.query.sort || 'newest');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));

  const includeUnpublishedRequested = req.query.includeUnpublished === 'true';
  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const isAdmin = Boolean(adminToken && verifyAdminToken(adminToken));
  const includeUnpublished = includeUnpublishedRequested && isAdmin;

  const sql = includeUnpublished
    ? 'SELECT * FROM products ORDER BY sort_order ASC, updated_at DESC'
    : 'SELECT * FROM products WHERE published = 1 ORDER BY sort_order ASC, updated_at DESC';

  const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;

  let products: Product[] = rows.map((row) => {
    const product = mapProductRow(row);
    product.githubCache = getCachedGitHubSummary(product.id);
    return product;
  });

  if (category && category !== 'all') {
    products = products.filter((p) => p.category === category);
  }

  if (featuredOnly) {
    products = products.filter((p) => p.featured);
  }

  if (productType === 'downloadable') {
    products = products.filter((p) => p.manualDownloads.length > 0 || (p.githubCache?.assets.length ?? 0) > 0 || !p.liveUrl);
  } else if (productType === 'web') {
    products = products.filter((p) => Boolean(p.liveUrl));
  } else if (productType === 'hybrid') {
    products = products.filter((p) => Boolean(p.liveUrl) && p.manualDownloads.length > 0);
  }

  if (platform && platform !== 'all') {
    products = products.filter((p) => p.platforms.some((pl) => pl.toLowerCase() === platform));
  }

  if (os && os !== 'all') {
    products = products.filter(
      (p) =>
        p.platforms.some((pl) => pl.toLowerCase().includes(os)) ||
        (p.systemRequirements.os || '').toLowerCase().includes(os)
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
        ...p.technologies,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  if (sort === 'alpha') {
    products.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'popular') {
    products.sort((a, b) => {
      if (b.totalDownloads !== a.totalDownloads) return b.totalDownloads - a.totalDownloads;
      if (b.featured !== a.featured) return Number(b.featured) - Number(a.featured);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  } else if (sort === 'updated') {
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
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

apiRouter.get('/products/:id', async (req, res) => {
  const row = db
    .prepare('SELECT * FROM products WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const adminToken = req.cookies?.[ADMIN_COOKIE_NAME];
  const isAdmin = Boolean(adminToken && verifyAdminToken(adminToken));
  if (!row.published && !isAdmin) {
    res.status(404).json({ error: 'Product not found' });
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

  const relatedRows = db
    .prepare('SELECT * FROM products WHERE id != ? AND published = 1 AND category = ? ORDER BY featured DESC, updated_at DESC LIMIT 3')
    .all(product.id, product.category) as Array<Record<string, unknown>>;

  const fallbackRows =
    relatedRows.length < 3
      ? (db
          .prepare('SELECT * FROM products WHERE id != ? AND published = 1 ORDER BY featured DESC, updated_at DESC LIMIT ?')
          .all(product.id, 3) as Array<Record<string, unknown>>)
      : relatedRows;

  const related = (relatedRows.length > 0 ? relatedRows : fallbackRows).map(mapProductRow);

  res.json({ product, related });
});

apiRouter.get('/products/:id/github-releases', async (req, res) => {
  const row = db
    .prepare('SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE id = ? OR slug = ?')
    .get(req.params.id, req.params.id) as
    | { id: string; github_owner: string; github_repo_name: string; asset_filter_json: string }
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const filter = JSON.parse(row.asset_filter_json || '{}');
  const summary = await syncProductGitHubReleases(row.id, row.github_owner, row.github_repo_name, false, filter);
  res.json(summary);
});

const trackSchema = z.object({
  productId: z.string().min(1).max(80),
  fileName: z.string().min(1).max(200),
  fileFormat: z.string().min(1).max(30),
  sourceType: z.enum(['direct_file', 'github_release_click', 'web_app_launch']),
  version: z.string().max(40).optional().default(''),
});

apiRouter.post('/downloads/track', (req, res) => {
  const parsed = trackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid download tracking payload' });
    return;
  }

  const { productId, fileName, fileFormat, sourceType, version } = parsed.data;
  const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!exists) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  db.prepare(
    `INSERT INTO download_events (product_id, file_name, file_format, source_type, version, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(productId, fileName, fileFormat, sourceType, version, new Date().toISOString());

  res.json({ ok: true });
});

apiRouter.get('/downloads/package/:productId/:fileName', (req, res) => {
  const { productId, fileName } = req.params;
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const product = mapProductRow(row);
  const asset = product.manualDownloads.find((d) => d.name === fileName);
  if (!asset) {
    res.status(404).json({ error: 'Requested build artifact not found' });
    return;
  }

  db.prepare(
    `INSERT INTO download_events (product_id, file_name, file_format, source_type, version, created_at)
     VALUES (?, ?, ?, 'direct_file', ?, ?)`
  ).run(product.id, asset.name, asset.format, asset.version || product.version, new Date().toISOString());

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
    note: 'Development mode sample release manifest. In production, link a GitHub Repository with published Releases or host compiled binaries in Cloudflare R2.',
    generatedAt: new Date().toISOString(),
  };

  const payload = JSON.stringify(releaseManifest, null, 2);
  res.setHeader('Content-Disposition', `attachment; filename="${asset.name}.manifest.json"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.send(payload);
});

// GitHub Release Webhook Endpoint (triggered by GitHub when a new Release is published)
apiRouter.post('/webhooks/github', async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (secret) {
    const sig = String(req.headers['x-hub-signature-256'] || '');
    const rawBody = (req as express.Request & { rawBody?: Buffer }).rawBody;
    const payloadBuffer = rawBody || Buffer.from(JSON.stringify(req.body));
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payloadBuffer).digest('hex');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
  }

  const event = String(req.headers['x-github-event'] || '');
  const repoFullName = String(req.body?.repository?.full_name || '');

  if (event === 'ping') {
    res.json({ ok: true, pong: true });
    return;
  }

  if (event === 'release' && repoFullName) {
    const [owner, repo] = repoFullName.split('/');
    const matching = db
      .prepare('SELECT id, asset_filter_json FROM products WHERE LOWER(github_owner) = LOWER(?) AND LOWER(github_repo_name) = LOWER(?) AND release_sync = 1')
      .all(owner, repo) as Array<{ id: string; asset_filter_json: string }>;

    for (const prod of matching) {
      await syncProductGitHubReleases(prod.id, owner, repo, true, JSON.parse(prod.asset_filter_json || '{}'));
    }

    res.json({ ok: true, syncedProducts: matching.length });
    return;
  }

  res.json({ ok: true, ignored: true });
});

const messageSchema = z.object({
  type: z.enum(['contact', 'bug_report']),
  productId: z.string().max(80).nullable().optional().default(null),
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  subject: z.string().min(3).max(160),
  message: z.string().min(10).max(3000),
});

apiRouter.post('/messages', (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited(messageAttempts, ip, 10, 15 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many submissions. Please try again later.' });
    return;
  }

  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid submission' });
    return;
  }

  const { type, productId, name, email, subject, message } = parsed.data;
  const cleanText = (s: string) => s.replace(/[<>]/g, '').trim();

  const result = db
    .prepare(
      `INSERT INTO messages (type, product_id, name, email, subject, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
    )
    .run(
      type,
      productId || null,
      cleanText(name),
      email.trim().toLowerCase(),
      cleanText(subject),
      cleanText(message),
      new Date().toISOString()
    );

  res.status(201).json({ ok: true, id: result.lastInsertRowid });
});

// Authentication Routes
apiRouter.post('/auth/login', (req, res) => {
  const ip = req.ip || 'unknown';
  if (isRateLimited(loginAttempts, ip, 10, 15 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes.' });
    return;
  }

  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and password are required' });
    return;
  }

  const admin = verifyAdminCredentials(parsed.data.email, parsed.data.password);
  if (!admin) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = signAdminToken(admin);
  res.cookie(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  });

  res.json({ user: admin });
});

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

apiRouter.get('/auth/me', (req, res) => {
  const token = req.cookies?.[ADMIN_COOKIE_NAME];
  if (!token) {
    res.json({ user: null });
    return;
  }
  const user = verifyAdminToken(token);
  res.json({ user });
});

// Admin Protected Routes
apiRouter.post('/admin/change-password', requireAdmin, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  const user = req.admin!;
  const verified = verifyAdminCredentials(user.email, parsed.data.currentPassword);
  if (!verified) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = bcrypt.hashSync(parsed.data.newPassword, 10);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(newHash, user.userId);
  res.json({ ok: true });
});

apiRouter.post('/admin/reconcile-config', requireAdmin, (_req, res) => {
  const summary = reconcileProductsConfigFile();
  res.json(summary);
});

apiRouter.post('/admin/products', requireAdmin, (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
    return;
  }

  const data = parsed.data;
  const effectiveSlug = data.slug || data.id;
  const existing = db
    .prepare('SELECT id, slug FROM products WHERE id = ? OR slug = ?')
    .get(data.id, effectiveSlug) as { id: string; slug: string } | undefined;
  if (existing) {
    res.status(409).json({
      error: existing.id === data.id ? 'A product with this ID already exists' : 'A product with this URL slug already exists',
    });
    return;
  }

  const { owner, repo } = parseGitHubOwnerAndRepo(data.githubRepo || '');
  const now = new Date().toISOString();

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
    githubReleases: data.githubReleases || (data.githubRepo ? `${data.githubRepo.replace(/\/+$/, '')}/releases` : ''),
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
    sortOrder: 0,
  });

  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(data.id) as Record<string, unknown>;
  res.status(201).json(mapProductRow(row));
});

apiRouter.put('/admin/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const parsed = productSchema.safeParse({ ...req.body, id: req.params.id });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Validation failed' });
    return;
  }

  const data = parsed.data;
  const effectiveSlug = data.slug || data.id;
  const slugConflict = db
    .prepare('SELECT id FROM products WHERE slug = ? AND id != ?')
    .get(effectiveSlug, data.id);
  if (slugConflict) {
    res.status(409).json({ error: 'Another product already uses this URL slug' });
    return;
  }

  const { owner, repo } = parseGitHubOwnerAndRepo(data.githubRepo || '');
  const now = new Date().toISOString();

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
    githubReleases: data.githubReleases || (data.githubRepo ? `${data.githubRepo.replace(/\/+$/, '')}/releases` : ''),
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
    versionHistoryJson: JSON.stringify(data.versionHistory),
  });

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(data.id) as Record<string, unknown>;
  res.json(mapProductRow(updated));
});

apiRouter.delete('/admin/products/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }
  res.json({ ok: true });
});

apiRouter.post('/admin/products/:id/sync-github', requireAdmin, async (req, res) => {
  const row = db
    .prepare('SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE id = ?')
    .get(req.params.id) as { id: string; github_owner: string; github_repo_name: string; asset_filter_json: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const filter = JSON.parse(row.asset_filter_json || '{}');
  const summary = await syncProductGitHubReleases(row.id, row.github_owner, row.github_repo_name, true, filter);
  res.json(summary);
});

apiRouter.post('/admin/sync-all-github', requireAdmin, async (_req, res) => {
  const rows = db
    .prepare('SELECT id, github_owner, github_repo_name, asset_filter_json FROM products WHERE release_sync = 1 AND github_owner != "" AND github_repo_name != ""')
    .all() as Array<{ id: string; github_owner: string; github_repo_name: string; asset_filter_json: string }>;

  const results = [];
  for (const row of rows) {
    const filter = JSON.parse(row.asset_filter_json || '{}');
    const summary = await syncProductGitHubReleases(row.id, row.github_owner, row.github_repo_name, true, filter);
    results.push({ productId: row.id, status: summary.fetchStatus, latestTag: summary.latestTag });
  }

  res.json({ synced: results.length, results });
});

apiRouter.post('/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file provided' });
    return;
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

apiRouter.get('/admin/analytics', requireAdmin, (_req, res) => {
  const stats = computePlatformStats();

  const days: Array<{ date: string; direct: number; github: number; web: number; total: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const isoDate = d.toISOString().slice(0, 10);
    days.push({ date: isoDate, direct: 0, github: 0, web: 0, total: 0 });
  }

  const rawDaily = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as day, source_type, COUNT(*) as count
       FROM download_events
       WHERE created_at >= date('now', '-14 days')
       GROUP BY day, source_type`
    )
    .all() as Array<{ day: string; source_type: string; count: number }>;

  for (const row of rawDaily) {
    const bucket = days.find((d) => d.date === row.day);
    if (!bucket) continue;
    if (row.source_type === 'direct_file') bucket.direct += row.count;
    if (row.source_type === 'github_release_click') bucket.github += row.count;
    if (row.source_type === 'web_app_launch') bucket.web += row.count;
    bucket.total += row.count;
  }

  const byProduct = db
    .prepare(
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
    )
    .all() as AnalyticsSummary['byProduct'];

  const byPlatform = db
    .prepare(
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
    )
    .all() as AnalyticsSummary['byPlatform'];

  const byVersion = db
    .prepare(
      `SELECT CASE WHEN version = '' THEN 'Unspecified' ELSE version END as version, COUNT(*) as count
       FROM download_events
       GROUP BY version
       ORDER BY count DESC
       LIMIT 10`
    )
    .all() as AnalyticsSummary['byVersion'];

  const byFormat = db
    .prepare(
      `SELECT file_format as format, COUNT(*) as count
       FROM download_events
       GROUP BY file_format
       ORDER BY count DESC`
    )
    .all() as AnalyticsSummary['byFormat'];

  const recentEvents = db
    .prepare(
      `SELECT e.id, e.product_id as productId, p.name as productName,
              e.file_name as fileName, e.file_format as fileFormat,
              e.source_type as sourceType, e.version, e.created_at as createdAt
       FROM download_events e
       JOIN products p ON p.id = e.product_id
       ORDER BY e.id DESC
       LIMIT 30`
    )
    .all() as AnalyticsSummary['recentEvents'];

  res.json({
    stats,
    dailySeries: days,
    byProduct,
    byPlatform,
    byVersion,
    byFormat,
    recentEvents,
  } satisfies AnalyticsSummary);
});

apiRouter.get('/admin/messages', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM messages ORDER BY id DESC').all() as Array<Record<string, unknown>>;
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
      createdAt: String(r.created_at),
    }))
  );
});

apiRouter.patch('/admin/messages/:id', requireAdmin, (req, res) => {
  const status = req.body?.status === 'open' ? 'open' : 'resolved';
  const result = db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ error: 'Message not found' });
    return;
  }
  res.json({ ok: true });
});
