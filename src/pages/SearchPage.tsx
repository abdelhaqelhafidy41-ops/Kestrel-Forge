import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { Product } from '../types/product';
import { useLanguage } from '../context/LanguageContext';
import { ProductCard } from '../components/ProductCard';
import { SkeletonCard } from '../components/SkeletonCard';
import { usePageSeo } from '../hooks/usePageSeo';

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { lang, t } = useLanguage();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  usePageSeo({
    title: lang === 'ar' ? 'البحث في المتجر' : 'Search Software Catalog',
    description: t.search.subtitle,
    canonicalPath: '/search',
  });

  useEffect(() => {
    setQuery(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    async function runSearch() {
      setLoading(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(query.trim())}&limit=30`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = (await res.json()) as { items: Product[] };
          setResults(data.items);
        }
      } catch {
        // Ignore abort
      } finally {
        setLoading(false);
      }
    }
    void runSearch();
    return () => controller.abort();
  }, [query]);

  const suggestions = ['Android', 'Windows', 'Rust', 'APK', 'Godot', 'WebGL'];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14">
      <div className="max-w-3xl mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-white font-display">
          {t.search.title}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
          {t.search.subtitle}
        </p>

        <div className="mt-6 relative">
          <Search className="w-5 h-5 text-zinc-400 absolute top-1/2 -translate-y-1/2 start-4 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              const val = e.target.value;
              setQuery(val);
              setSearchParams(val ? { q: val } : {});
            }}
            placeholder={t.search.placeholder}
            className="w-full ps-12 pe-4 py-3.5 rounded-xl text-sm sm:text-base bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>{t.search.suggestions}:</span>
          {suggestions.map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => {
                setQuery(term);
                setSearchParams({ q: term });
              }}
              className="px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-indigo-500 transition-colors"
            >
              {term}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, idx) => (
            <SkeletonCard key={idx} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="py-16 px-6 text-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#111114]">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">
            {t.search.noResultsTitle}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">
            {t.search.noResultsDesc}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {results.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};
