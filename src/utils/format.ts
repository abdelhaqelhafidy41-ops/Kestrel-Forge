import type { Language } from '../i18n/translations';
import type { ProductCategory } from '../types/product';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

export function formatDate(isoDate: string | null | undefined, lang: Language): string {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

export function getCategoryLabel(category: ProductCategory, lang: Language): string {
  const map: Record<ProductCategory, { en: string; ar: string }> = {
    games: { en: 'Games', ar: 'الألعاب' },
    android: { en: 'Android Apps', ar: 'تطبيقات أندرويد' },
    windows: { en: 'Windows Software', ar: 'برامج ويندوز' },
    web: { en: 'Web Apps', ar: 'تطبيقات الويب' },
    other: { en: 'Developer Tools', ar: 'أدوات المطورين' },
  };
  return map[category]?.[lang] || category;
}

export function isSafeExternalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('/')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
