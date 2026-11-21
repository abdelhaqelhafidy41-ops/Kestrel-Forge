import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const urlOrRelativePath = z.string().refine(
  (val) => val.startsWith('/') || val.startsWith('http://') || val.startsWith('https://'),
  'Must be an http(s) URL or root-relative asset path starting with /'
);

const configProductSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Product id must be lowercase alphanumeric with hyphens'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Product slug must be lowercase alphanumeric with hyphens'),
  name: z.string().min(2).max(120),
  nameAr: z.string().max(120).optional(),
  shortDescription: z.string().min(10).max(260),
  shortDescriptionAr: z.string().max(260).optional(),
  category: z.enum(['games', 'android', 'windows', 'web', 'other']),
  description: z.string().min(20).max(5000),
  descriptionAr: z.string().max(5000).optional(),
  icon: urlOrRelativePath,
  coverImage: urlOrRelativePath,
  screenshots: z.array(urlOrRelativePath).min(1),
  platforms: z.array(z.string().min(1)).min(1),
  technologies: z.array(z.string().min(1)).default([]),
  githubRepo: z.string().url().optional().or(z.literal('')),
  githubReleases: z.string().url().optional().or(z.literal('')),
  liveUrl: urlOrRelativePath.nullable().optional(),
  featured: z.boolean().default(false),
  published: z.boolean().default(true),
  releaseSync: z.boolean().default(true),
  assetFilter: z
    .object({
      extensions: z.array(z.string()).optional(),
      pattern: z.string().optional(),
    })
    .optional(),
  version: z.string().min(1).max(40),
  isSampleDemo: z.boolean().optional(),
});

const configSchema = z.object({
  products: z.array(configProductSchema).min(1),
});

function main() {
  const rootDir = process.cwd();
  const configPath = path.resolve(rootDir, 'products.config.json');

  if (!fs.existsSync(configPath)) {
    console.error('Error: products.config.json not found at repository root.');
    process.exit(1);
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch (err) {
    console.error('Error: products.config.json contains invalid JSON:', err);
    process.exit(1);
  }

  const parsed = configSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error('Schema validation failed for products.config.json:');
    for (const issue of parsed.error.issues) {
      console.error(` - [${issue.path.join('.')}] ${issue.message}`);
    }
    process.exit(1);
  }

  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const errors: string[] = [];

  for (const product of parsed.data.products) {
    if (seenIds.has(product.id)) {
      errors.push(`Duplicate product id: ${product.id}`);
    }
    seenIds.add(product.id);

    if (seenSlugs.has(product.slug)) {
      errors.push(`Duplicate product slug: ${product.slug}`);
    }
    seenSlugs.add(product.slug);

    const localImages = [product.icon, product.coverImage, ...product.screenshots].filter((img) =>
      img.startsWith('/src/')
    );

    for (const imgPath of localImages) {
      const diskPath = path.resolve(rootDir, imgPath.slice(1));
      if (!fs.existsSync(diskPath)) {
        errors.push(`Product "${product.id}" references missing local asset: ${imgPath}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Product catalog integrity checks failed:');
    for (const e of errors) console.error(` - ${e}`);
    process.exit(1);
  }

  console.log(`Validated ${parsed.data.products.length} products in products.config.json successfully.`);
}

main();
