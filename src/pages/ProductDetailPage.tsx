import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Flag,
  Github,
  Maximize2,
  Share2,
  X,
} from 'lucide-react';
import type { DownloadAsset, GitHubRelease, Product } from '../types/product';
import { useLanguage } from '../context/LanguageContext';
import { usePageSeo } from '../hooks/usePageSeo';
import { formatBytes, formatDate, getCategoryLabel, isSafeExternalUrl } from '../utils/format';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { ProductCard } from '../components/ProductCard';

export const ProductDetailPage: React.FC = () => {
  const { slug, id } = useParams<{ slug?: string; id?: string }>();
  const lookupKey = slug || id || '';
  const { lang, isRtl, t } = useLanguage();

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [activeShot, setActiveShot] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedReleaseTag, setSelectedReleaseTag] = useState<string>('latest');

  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmAsset, setConfirmAsset] = useState<DownloadAsset | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setNotFound(false);
      setActiveShot(0);
      setSelectedReleaseTag('latest');
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(lookupKey)}`);
        if (!active) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          const data = (await res.json()) as { product: Product; related: Product[] };
          setProduct(data.product);
          setRelated(data.related);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [lookupKey]);

  const seoTitle = product ? (lang === 'ar' && product.nameAr ? product.nameAr : product.name) : t.catalog.title;
  const seoDesc = product ? (lang === 'ar' && product.taglineAr ? product.taglineAr : product.tagline) : t.catalog.subtitle;

  const structuredData = useMemo(() => {
    if (!product) return undefined;
    return {
      '@type': 'SoftwareApplication',
      name: product.name,
      applicationCategory: product.category,
      operatingSystem: product.platforms.join(', '),
      softwareVersion: product.version,
      description: product.tagline || product.description,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    };
  }, [product]);

  usePageSeo({
    title: seoTitle,
    description: seoDesc,
    canonicalPath: product ? `/product/${product.slug || product.id}` : undefined,
    image: product?.coverImage,
    structuredData,
  });

  const gallery = product
    ? Array.from(new Set([product.coverImage, ...product.screenshots].filter(Boolean)))
    : [];

  useEffect(() => {
    if (!lightboxOpen || gallery.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowRight') setActiveShot((i) => (i + 1) % gallery.length);
      if (e.key === 'ArrowLeft') setActiveShot((i) => (i - 1 + gallery.length) % gallery.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen, gallery.length]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-pulse">
        <div className="h-6 w-48 bg-zinc-200 dark:bg-zinc-800 rounded mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 aspect-[16/10] bg-zinc-200 dark:bg-zinc-900 rounded-xl" />
          <div className="lg:col-span-5 space-y-4">
            <div className="h-10 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-24 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
            <div className="h-40 w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <p className="text-4xl font-bold font-mono text-indigo-500">404</p>
        <h1 className="mt-3 text-2xl font-bold text-zinc-900 dark:text-white">{t.notFound.title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t.notFound.description}</p>
        <Link
          to="/products"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500"
        >
          {t.notFound.browseCatalog}
        </Link>
      </div>
    );
  }

  const title = lang === 'ar' && product.nameAr ? product.nameAr : product.name;
  const tagline = lang === 'ar' && product.taglineAr ? product.taglineAr : product.tagline;
  const description = lang === 'ar' && product.descriptionAr ? product.descriptionAr : product.description;
  const features = lang === 'ar' && product.featuresAr.length ? product.featuresAr : product.features;
  const categoryName = getCategoryLabel(product.category, lang);

  const githubReleases: GitHubRelease[] = product.githubCache?.allReleases || [];
  const hasGitHubSynced = product.githubCache?.fetchStatus === 'ok' && githubReleases.length > 0;

  const activeGitHubRelease = hasGitHubSynced
    ? selectedReleaseTag === 'latest'
      ? githubReleases[0]
      : githubReleases.find((r) => r.tagName === selectedReleaseTag) || githubReleases[0]
    : null;

  const githubAssets: DownloadAsset[] = activeGitHubRelease
    ? activeGitHubRelease.assets.map((a) => ({
        id: `gh-${a.id}`,
        name: a.name,
        format: a.format,
        sizeBytes: a.size,
        url: a.downloadUrl,
        version: activeGitHubRelease.tagName.replace(/^v/i, ''),
        releaseDate: activeGitHubRelease.publishedAt,
        source: 'github',
        platform: a.platformHint,
        downloadCount: a.downloadCount,
      }))
    : [];

  const availableAssets: DownloadAsset[] = [...githubAssets, ...product.manualDownloads];

  const handleDownloadClick = async (asset: DownloadAsset) => {
    if (!isSafeExternalUrl(asset.url)) {
      return;
    }
    if (asset.source === 'github') {
      setConfirmAsset(asset);
      return;
    }

    if (!asset.url.startsWith('/api/downloads/package/')) {
      void fetch('/api/downloads/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          fileName: asset.name,
          fileFormat: asset.format,
          sourceType: 'direct_file',
          version: asset.version || product.version,
        }),
      }).catch(() => undefined);
    }

    showToast(`${t.product.downloadStarted}: ${asset.name}`);
    const link = document.createElement('a');
    link.href = asset.url;
    link.download = asset.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const confirmExternalDownload = async () => {
    if (!confirmAsset || !isSafeExternalUrl(confirmAsset.url)) {
      setConfirmAsset(null);
      return;
    }

    await fetch('/api/downloads/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        fileName: confirmAsset.name,
        fileFormat: confirmAsset.format,
        sourceType: 'github_release_click',
        version: confirmAsset.version,
      }),
    }).catch(() => undefined);

    window.open(confirmAsset.url, '_blank', 'noopener,noreferrer');
    showToast(`${t.product.githubOpened}: ${confirmAsset.name}`);
    setConfirmAsset(null);
  };

  const handleOpenWebApp = async () => {
    if (!product.liveUrl || !isSafeExternalUrl(product.liveUrl)) return;
    await fetch('/api/downloads/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        fileName: `${product.name} Web App`,
        fileFormat: 'WEB',
        sourceType: 'web_app_launch',
        version: product.version,
      }),
    }).catch(() => undefined);
    showToast(t.product.webAppOpened);
    window.open(product.liveUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(window.location.href);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text: tagline, url: window.location.href });
        return;
      } catch {
        // Fallback to copy
      }
    }
    void handleCopyLink();
  };

  const submitProblemReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'bug_report',
          productId: product.id,
          ...reportForm,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setReportError(data.error || 'Failed to submit report');
        return;
      }
      setReportSent(true);
      setReportForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setReportError('Network error while submitting report');
    }
  };

  const BackArrow = isRtl ? ArrowRight : ArrowLeft;
  const PrevChevron = isRtl ? ChevronRight : ChevronLeft;
  const NextChevron = isRtl ? ChevronLeft : ChevronRight;
  const categoryRouteMap: Record<string, string> = {
    games: '/games',
    android: '/android',
    windows: '/windows',
    web: '/web-apps',
  };

  const sysReqEntries = [
    { label: t.product.reqOs, value: product.systemRequirements.os },
    { label: t.product.reqCpu, value: product.systemRequirements.processor },
    { label: t.product.reqRam, value: product.systemRequirements.memory },
    { label: t.product.reqStorage, value: product.systemRequirements.storage },
    { label: t.product.reqGpu, value: product.systemRequirements.graphics },
  ].filter((item) => Boolean(item.value));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 end-5 z-50 px-4 py-3 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold shadow-xl border border-zinc-700 dark:border-zinc-300"
        >
          {toast}
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-4 mb-8">
        <nav className="flex items-center gap-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          <Link to="/products" className="inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-white">
            <BackArrow className="w-3.5 h-3.5" />
            <span>{t.product.backToCatalog}</span>
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            to={categoryRouteMap[product.category] || '/products'}
            className="hover:text-zinc-900 dark:hover:text-white"
          >
            {categoryName}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-900 dark:text-zinc-200 font-medium truncate">{title}</span>
        </nav>
      </div>

      {/* Main 2-Column Product Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-7 space-y-8">
          <div className="space-y-3">
            <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 group">
              <ImageWithFallback
                src={gallery[activeShot] || product.coverImage}
                alt={`${title} screenshot ${activeShot + 1}`}
                className="w-full h-full object-cover"
              />
              {gallery.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveShot((i) => (i - 1 + gallery.length) % gallery.length)}
                    className="p-2 rounded-lg bg-black/55 hover:bg-black/80 text-white absolute top-1/2 -translate-y-1/2 start-3 opacity-80 group-hover:opacity-100 transition-opacity"
                    aria-label="Previous screenshot"
                  >
                    <PrevChevron className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveShot((i) => (i + 1) % gallery.length)}
                    className="p-2 rounded-lg bg-black/55 hover:bg-black/80 text-white absolute top-1/2 -translate-y-1/2 end-3 opacity-80 group-hover:opacity-100 transition-opacity"
                    aria-label="Next screenshot"
                  >
                    <NextChevron className="w-5 h-5" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 hover:bg-black/85 text-white text-xs font-medium absolute bottom-3 end-3 border border-white/15 transition-colors"
                aria-label={t.product.openFullscreen}
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  {activeShot + 1} / {Math.max(1, gallery.length)}
                </span>
              </button>
            </div>

            {gallery.length > 1 && (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                {gallery.map((img, idx) => (
                  <button
                    key={`${img}-${idx}`}
                    type="button"
                    onClick={() => setActiveShot(idx)}
                    className={`aspect-[16/10] rounded-lg overflow-hidden border transition-all ${
                      idx === activeShot
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                        : 'border-zinc-200 dark:border-zinc-800 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <ImageWithFallback src={img} alt={`${title} thumb ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white font-display">{title}</h2>
            <p className="text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
              {description}
            </p>
          </div>

          {features.length > 0 && (
            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 font-display">
                {t.product.features}
              </h3>
              <ul className="space-y-2.5">
                {features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-sm text-zinc-700 dark:text-zinc-300">
                    <Check className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sysReqEntries.length > 0 && (
            <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 font-display">
                {t.product.requirements}
              </h3>
              <dl className="divide-y divide-zinc-200 dark:divide-zinc-800/80 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-[#111114]">
                {sysReqEntries.map((row) => (
                  <div key={row.label} className="px-4 py-3 grid grid-cols-3 gap-4 text-sm">
                    <dt className="text-zinc-500 dark:text-zinc-400 font-medium">{row.label}</dt>
                    <dd className="col-span-2 text-zinc-900 dark:text-zinc-200">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-4 font-display">
              {t.product.versionHistory}
            </h3>
            <div className="space-y-3">
              {hasGitHubSynced &&
                githubReleases.slice(0, 4).map((rel) => (
                  <div
                    key={rel.id}
                    className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-white">
                        {rel.tagName} · {rel.name}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-zinc-500">
                        {formatDate(rel.publishedAt, lang)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 whitespace-pre-line line-clamp-4">
                      {rel.body || 'Published via GitHub Releases.'}
                    </p>
                  </div>
                ))}

              {product.versionHistory.map((item, idx) => (
                <div
                  key={`${item.version}-${idx}`}
                  className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-white">
                      v{item.version}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-zinc-500">
                      {formatDate(item.date, lang)}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400">
                    {lang === 'ar' && item.notesAr ? item.notesAr : item.notes}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Contiguous Purchase / Download / Info Module */}
        <aside className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
          <div className="p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-6">
            <div className="flex items-start gap-4">
              <ImageWithFallback
                src={product.icon || product.coverImage}
                alt={`${title} icon`}
                className="w-16 h-16 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-1">
                  {categoryName} · {product.developer}
                </p>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-white font-display leading-tight">
                  {title}
                </h1>
                <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-400">{tagline}</p>
              </div>
            </div>

            {product.isSampleDemo && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900/80 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800">
                {lang === 'ar'
                  ? 'منتج تجريبي للمعاينة: استبدله أو حدّث مستودع GitHub من لوحة الإدارة أو products.config.json.'
                  : 'Sample showcase entry for development preview. Connect your own GitHub repository in Admin or products.config.json.'}
              </p>
            )}

            <dl className="grid grid-cols-2 gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs">
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">{t.product.version}</dt>
                <dd className="mt-0.5 font-mono font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  v{product.version}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">{t.product.lastUpdated}</dt>
                <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formatDate(product.updatedAt, lang)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">{t.product.releaseDate}</dt>
                <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {formatDate(product.releaseDate, lang)}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500 dark:text-zinc-400">{t.product.license}</dt>
                <dd className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-100">{product.license}</dd>
              </div>
            </dl>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">{t.product.platforms}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-200 text-end">
                  {product.platforms.join(' · ')}
                </span>
              </div>
              {product.technologies.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500 dark:text-zinc-400">{t.product.technologies}</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-200 text-end">
                    {product.technologies.join(' · ')}
                  </span>
                </div>
              )}
            </div>

            {product.liveUrl && (
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleOpenWebApp}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                >
                  <span>{t.product.openWebApp}</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
                  {t.product.downloadsTitle}
                </h2>
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {hasGitHubSynced ? t.product.githubSynced : t.product.githubFallback}
                </span>
              </div>

              {hasGitHubSynced && githubReleases.length > 1 && (
                <div>
                  <label className="block text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                    {t.product.selectVersion}
                  </label>
                  <select
                    value={selectedReleaseTag}
                    onChange={(e) => setSelectedReleaseTag(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
                  >
                    <option value="latest">Latest ({githubReleases[0]?.tagName})</option>
                    {githubReleases.map((r) => (
                      <option key={r.id} value={r.tagName}>
                        {r.tagName} — {formatDate(r.publishedAt, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {availableAssets.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 py-3">{t.product.noDownloadsYet}</p>
              ) : (
                <div className="space-y-2.5">
                  {availableAssets.slice(0, 8).map((asset) => (
                    <div
                      key={asset.id}
                      className="p-3.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {asset.name}
                        </p>
                        <p className="mt-0.5 text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          {asset.format}
                          {asset.platform ? ` · ${asset.platform}` : ''} · {formatBytes(asset.sizeBytes)} · v{asset.version}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownloadClick(asset)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-white text-white dark:text-zinc-900 transition-colors whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{asset.format === 'APK' ? t.product.downloadApk : t.product.downloadBtn}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {product.githubRepo && isSafeExternalUrl(product.githubRepo) && (
                <div className="pt-2 flex flex-wrap items-center gap-3 text-xs">
                  <a
                    href={product.githubRepo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  >
                    <Github className="w-3.5 h-3.5" />
                    <span>{t.product.viewOnGithub}</span>
                  </a>
                  {product.githubReleases && isSafeExternalUrl(product.githubReleases) && (
                    <a
                      href={product.githubReleases}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>{t.product.releasesPage}</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t.product.linkCopied : t.product.copyLink}</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t.product.share}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportSent(false);
                  setReportOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white ms-auto"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{t.product.reportProblem}</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-16 pt-12 border-t border-zinc-200 dark:border-zinc-800">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6 font-display">
            {t.product.relatedProducts}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      {lightboxOpen && gallery.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 end-4 p-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            aria-label={t.product.cancel}
          >
            <X className="w-5 h-5" />
          </button>

          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveShot((i) => (i - 1 + gallery.length) % gallery.length);
                }}
                className="absolute start-4 p-3 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Previous image"
              >
                <PrevChevron className="w-6 h-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveShot((i) => (i + 1) % gallery.length);
                }}
                className="absolute end-4 p-3 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Next image"
              >
                <NextChevron className="w-6 h-6" />
              </button>
            </>
          )}

          <div className="max-w-5xl w-full max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <ImageWithFallback
              src={gallery[activeShot]}
              alt={`${title} fullscreen ${activeShot + 1}`}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            <p className="mt-3 text-xs font-mono text-zinc-400 tabular-nums">
              {activeShot + 1} / {gallery.length}
            </p>
          </div>
        </div>
      )}

      {confirmAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setConfirmAsset(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-md w-full p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{t.product.confirmDownloadTitle}</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t.product.confirmDownloadBody}</p>
            <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-900 font-mono text-xs text-zinc-800 dark:text-zinc-200 break-all">
              {confirmAsset.name} ({confirmAsset.format} · {formatBytes(confirmAsset.sizeBytes)})
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmAsset(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {t.product.cancel}
              </button>
              <button
                type="button"
                onClick={confirmExternalDownload}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {t.product.confirmProceed}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setReportOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-lg w-full p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{t.reportModal.title}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t.reportModal.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reportSent ? (
              <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-300">
                {t.reportModal.success}
              </div>
            ) : (
              <form onSubmit={submitProblemReport} className="space-y-3">
                {reportError && (
                  <p className="text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">{reportError}</p>
                )}
                <input
                  required
                  type="text"
                  value={reportForm.name}
                  onChange={(e) => setReportForm({ ...reportForm, name: e.target.value })}
                  placeholder={t.reportModal.name}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                />
                <input
                  required
                  type="email"
                  value={reportForm.email}
                  onChange={(e) => setReportForm({ ...reportForm, email: e.target.value })}
                  placeholder={t.reportModal.email}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                />
                <input
                  required
                  type="text"
                  value={reportForm.subject}
                  onChange={(e) => setReportForm({ ...reportForm, subject: e.target.value })}
                  placeholder={t.reportModal.subject}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                />
                <textarea
                  required
                  rows={4}
                  value={reportForm.message}
                  onChange={(e) => setReportForm({ ...reportForm, message: e.target.value })}
                  placeholder={t.reportModal.details}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300"
                  >
                    {t.product.cancel}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    {t.reportModal.submit}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
