import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ArrowUpLeft } from 'lucide-react';
import type { Product } from '../types/product';
import { useLanguage } from '../context/LanguageContext';
import { getCategoryLabel } from '../utils/format';
import { ImageWithFallback } from './ImageWithFallback';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { lang, isRtl, t } = useLanguage();
  const title = lang === 'ar' && product.nameAr ? product.nameAr : product.name;
  const tagline = lang === 'ar' && product.taglineAr ? product.taglineAr : product.tagline;
  const categoryName = getCategoryLabel(product.category, lang);
  const ArrowIcon = isRtl ? ArrowUpLeft : ArrowUpRight;
  const productUrl = `/product/${product.slug || product.id}`;

  return (
    <article className="group flex flex-col bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/90 rounded-xl overflow-hidden transition-transform duration-200 hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-700">
      <Link
        to={productUrl}
        className="block relative aspect-[4/3] overflow-hidden bg-zinc-100 dark:bg-zinc-900"
      >
        <ImageWithFallback
          src={product.coverImage}
          alt={title}
          fallbackTitle={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-65" />
      </Link>

      <div className="flex flex-col flex-1 p-5">
        <div className="flex items-start gap-3 mb-3">
          <ImageWithFallback
            src={product.icon || product.coverImage}
            alt={`${title} icon`}
            className="w-10 h-10 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="font-medium text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                  {categoryName}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums whitespace-nowrap">v{product.version}</span>
              </div>
              {product.featured && (
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap shrink-0">
                  {t.product.featured}
                </span>
              )}
            </div>
            <Link to={productUrl} className="block">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">
                {title}
              </h3>
            </Link>
          </div>
        </div>

        <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed flex-1">
          {tagline}
        </p>

        <div className="mt-4 pt-3.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between gap-3">
          <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400 truncate">
            {product.platforms.slice(0, 3).join(' · ')}
          </span>
          <Link
            to={productUrl}
            className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors whitespace-nowrap shrink-0"
          >
            <span>{t.hero.viewDetails}</span>
            <ArrowIcon className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </article>
  );
};
