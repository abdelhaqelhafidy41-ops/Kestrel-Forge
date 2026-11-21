import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowRight, ArrowLeft } from 'lucide-react';
import type { Product } from '../types/product';
import { useLanguage } from '../context/LanguageContext';
import { getCategoryLabel } from '../utils/format';
import { ImageWithFallback } from './ImageWithFallback';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = ({ open, onClose }) => {
  const { lang, isRtl, t } = useLanguage();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 40);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products?q=${encodeURIComponent(query.trim())}&limit=6`, {
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
    }, 150);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.search.title}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.nav.searchPlaceholder}
            className="w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white px-2 py-1"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label={t.product.cancel}
          >
            <X className="w-4 h-4" />
          </button>
        </form>

        <div className="max-h-96 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {loading && results.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{t.search.noResultsTitle}</p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{t.search.noResultsDesc}</p>
            </div>
          ) : (
            results.map((item) => {
              const title = lang === 'ar' && item.nameAr ? item.nameAr : item.name;
              const tagline = lang === 'ar' && item.taglineAr ? item.taglineAr : item.tagline;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`/product/${item.slug || item.id}`);
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 text-start hover:bg-zinc-50 dark:hover:bg-zinc-900/70 transition-colors"
                >
                  <ImageWithFallback
                    src={item.coverImage}
                    alt={title}
                    className="w-12 h-9 rounded-md object-cover shrink-0 bg-zinc-200 dark:bg-zinc-800"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{title}</span>
                      <span className="text-xs font-mono text-zinc-400 shrink-0">v{item.version}</span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {getCategoryLabel(item.category, lang)} · {tagline}
                    </p>
                  </div>
                  <Arrow className="w-4 h-4 text-zinc-400 shrink-0" />
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span>{t.search.suggestions}: Games, Android, Windows, Web</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate(`/search?q=${encodeURIComponent(query.trim())}`);
            }}
            className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
          >
            {t.sections.viewAll}
          </button>
        </div>
      </div>
    </div>
  );
};
