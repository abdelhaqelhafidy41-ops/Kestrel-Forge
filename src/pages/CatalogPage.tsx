import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, RotateCcw } from 'lucide-react';
import type { Product, ProductCategory } from '../types/product';
import { useLanguage } from '../context/LanguageContext';
import { usePageSeo } from '../hooks/usePageSeo';
import { getCategoryLabel } from '../utils/format';
import { ProductCard } from '../components/ProductCard';
import { SkeletonCard } from '../components/SkeletonCard';

const PAGE_SIZE = 6;

interface CatalogPageProps {
  forcedCategory?: ProductCategory;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ forcedCategory }) => {
  const { category: routeCategory } = useParams<{ category?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { lang, t } = useLanguage();

  const initialCategory = (forcedCategory || routeCategory || searchParams.get('category') || 'all') as
    | 'all'
    | ProductCategory;
  const [category, setCategory] = useState<'all' | ProductCategory>(initialCategory);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [platform, setPlatform] = useState(searchParams.get('platform') || 'all');
  const [os, setOs] = useState(searchParams.get('os') || 'all');
  const [productType, setProductType] = useState(searchParams.get('type') || 'all');
  const [sort, setSort] = useState(searchParams.get('sort') || 'updated');
  const [featuredOnly, setFeaturedOnly] = useState(searchParams.get('featured') === 'true');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (forcedCategory) {
      setCategory(forcedCategory);
      setLimit(PAGE_SIZE);
    } else if (routeCategory) {
      setCategory(routeCategory as ProductCategory);
      setLimit(PAGE_SIZE);
    }
  }, [forcedCategory, routeCategory]);

  const pageTitle = category === 'all' ? t.catalog.title : getCategoryLabel(category, lang);

  usePageSeo({
    title: pageTitle,
    description: t.catalog.subtitle,
  });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('q', search.trim());
        if (category !== 'all') params.set('category', category);
        if (platform !== 'all') params.set('platform', platform);
        if (os !== 'all') params.set('os', os);
        if (productType !== 'all') params.set('type', productType);
        if (featuredOnly) params.set('featured', 'true');
        params.set('sort', sort);
        params.set('limit', String(limit));

        const res = await fetch(`/api/products?${params.toString()}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { items: Product[]; total: number };
          setItems(data.items);
          setTotal(data.total);
        }
      } catch {
        // Ignore abort
      } finally {
        setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [search, category, platform, os, productType, featuredOnly, sort, limit]);

  const resetFilters = () => {
    setCategory(forcedCategory || 'all');
    setSearch('');
    setPlatform('all');
    setOs('all');
    setProductType('all');
    setSort('updated');
    setFeaturedOnly(false);
    setLimit(PAGE_SIZE);
    setSearchParams({});
  };

  const categoryTabs: Array<{ id: 'all' | ProductCategory; label: string }> = [
    { id: 'all', label: t.categories.all },
    { id: 'games', label: t.categories.games },
    { id: 'android', label: t.categories.android },
    { id: 'windows', label: t.categories.windows },
    { id: 'web', label: t.categories.web },
    { id: 'other', label: t.categories.other },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
          {pageTitle}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-2xl">
          {t.catalog.subtitle}
        </p>
      </div>

      {/* Category Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-xl bg-zinc-100 dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/80 mb-6 w-fit max-w-full overflow-x-auto">
        {categoryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setCategory(tab.id);
              setLimit(PAGE_SIZE);
            }}
            className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              category === tab.id
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 mb-8">
        <div className="lg:col-span-3 relative">
          <Search className="w-4 h-4 text-zinc-400 absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.catalog.searchLabel}
            aria-label={t.catalog.searchLabel}
            className="w-full ps-10 pe-4 py-2.5 rounded-lg text-sm bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="lg:col-span-2">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            aria-label={t.catalog.platformLabel}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">{t.catalog.allPlatforms}</option>
            <option value="Windows">Windows</option>
            <option value="Android">Android</option>
            <option value="Web">Web</option>
            <option value="Linux">Linux</option>
            <option value="macOS">macOS</option>
            <option value="PWA">PWA</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            value={os}
            onChange={(e) => setOs(e.target.value)}
            aria-label={t.catalog.osLabel}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">{t.catalog.allOS}</option>
            <option value="windows">Windows 10/11</option>
            <option value="android">Android</option>
            <option value="linux">Linux / Ubuntu</option>
            <option value="macos">macOS</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
            aria-label="Product Type"
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="all">{lang === 'ar' ? 'جميع الأنواع' : 'All Types'}</option>
            <option value="downloadable">{lang === 'ar' ? 'قابل للتحميل' : 'Downloadable'}</option>
            <option value="web">{lang === 'ar' ? 'تطبيق ويب' : 'Web App'}</option>
            <option value="hybrid">{lang === 'ar' ? 'ويب + تحميل' : 'Web + Download'}</option>
          </select>
        </div>

        <div className="lg:col-span-2">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label={t.catalog.sortLabel}
            className="w-full px-3 py-2.5 rounded-lg text-sm bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-indigo-500"
          >
            <option value="updated">{lang === 'ar' ? 'آخر تحديث' : 'Last Updated'}</option>
            <option value="newest">{t.catalog.sortNewest}</option>
            <option value="alpha">{t.catalog.sortAlpha}</option>
            <option value="popular">{t.catalog.sortPopular}</option>
          </select>
        </div>

        <div className="lg:col-span-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFeaturedOnly((v) => !v)}
            title={t.catalog.featuredOnly}
            className={`w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
              featuredOnly
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-[#111114] text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between gap-4 mb-6 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="tabular-nums">
          {t.catalog.showing} {items.length} {t.catalog.of} {total} {t.catalog.results}
        </span>
        {(category !== (forcedCategory || 'all') || search || platform !== 'all' || os !== 'all' || productType !== 'all' || featuredOnly) && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t.catalog.resetFilters}</span>
          </button>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 px-6 text-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{t.catalog.emptyTitle}</h3>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            {t.catalog.emptyDesc}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t.catalog.resetFilters}</span>
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {items.length < total && (
            <div className="mt-10 text-center">
              <button
                type="button"
                onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
                disabled={loading}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors disabled:opacity-50"
              >
                {t.catalog.loadMore}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
