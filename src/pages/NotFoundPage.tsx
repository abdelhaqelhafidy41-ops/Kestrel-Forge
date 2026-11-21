import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { usePageSeo } from '../hooks/usePageSeo';

export const NotFoundPage: React.FC = () => {
  const { t } = useLanguage();

  usePageSeo({
    title: `${t.notFound.code} — ${t.notFound.title}`,
    description: t.notFound.description,
    canonicalPath: '/404',
  });

  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <p className="text-5xl font-bold font-mono text-indigo-500">{t.notFound.code}</p>
      <h1 className="mt-4 text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-white font-display">
        {t.notFound.title}
      </h1>
      <p className="mt-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
        {t.notFound.description}
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          to="/"
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          {t.notFound.backHome}
        </Link>
        <Link
          to="/products"
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
        >
          {t.notFound.browseCatalog}
        </Link>
      </div>
    </div>
  );
};
