import React from 'react';
import { Link } from 'react-router-dom';
import { Github, Mail, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { brandConfig } from '../config/brand';
import { BrandLogo } from './BrandLogo';

export const Footer: React.FC = () => {
  const { lang, t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-[#09090B]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-4">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight text-zinc-900 dark:text-white font-display"
            >
              <BrandLogo className="w-6 h-6" />
              <span>{brandConfig.name[lang]}</span>
            </Link>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xs">
              {t.footer.tagline}
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href={brandConfig.social.github}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                aria-label={t.footer.githubProfile}
              >
                <Github className="w-4 h-4" />
              </a>
              <Link
                to="/contact"
                className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                aria-label={t.nav.contact}
              >
                <Mail className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {t.footer.navigation}
            </h3>
            <ul className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link to="/" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.home}
                </Link>
              </li>
              <li>
                <Link to="/products" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.allProducts}
                </Link>
              </li>
              <li>
                <Link to="/search" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.search}
                </Link>
              </li>
              <li>
                <Link to="/about" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.about}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.contact}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {t.footer.categories}
            </h3>
            <ul className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link to="/games" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.games}
                </Link>
              </li>
              <li>
                <Link to="/android" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.android}
                </Link>
              </li>
              <li>
                <Link to="/windows" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.windows}
                </Link>
              </li>
              <li>
                <Link to="/web-apps" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.nav.web}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              {t.footer.resources}
            </h3>
            <ul className="space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link to="/privacy" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.footer.privacy}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
                  {t.footer.terms}
                </Link>
              </li>
              <li>
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t.nav.admin}</span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500 dark:text-zinc-500">
          <p>
            © {year} {brandConfig.name[lang]}. {t.footer.rights}
          </p>
          <p>{brandConfig.contactEmail}</p>
        </div>
      </div>
    </footer>
  );
};
