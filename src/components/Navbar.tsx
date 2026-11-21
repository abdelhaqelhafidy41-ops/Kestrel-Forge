import React, { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Search, Sun, Moon, Globe, Menu, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { brandConfig } from '../config/brand';
import { BrandLogo } from './BrandLogo';
import { SearchModal } from './SearchModal';

export const Navbar: React.FC = () => {
  const { lang, t, toggleLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navLinks = [
    { to: '/', label: t.nav.home, end: true },
    { to: '/products', label: t.nav.allProducts },
    { to: '/games', label: t.nav.games },
    { to: '/android', label: t.nav.android },
    { to: '/windows', label: t.nav.windows },
    { to: '/web-apps', label: t.nav.web },
    { to: '/about', label: t.nav.about },
  ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium whitespace-nowrap shrink-0 transition-colors py-1 border-b-2 ${
      isActive
        ? 'text-zinc-900 dark:text-white border-indigo-500'
        : 'text-zinc-600 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100'
    }`;

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/85 dark:bg-[#09090B]/85 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0 font-display"
          >
            <BrandLogo className="w-7 h-7 shrink-0" />
            <span>{brandConfig.name[lang]}</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-5 overflow-x-auto" aria-label="Main navigation">
            {navLinks.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors whitespace-nowrap shrink-0"
              aria-label={t.nav.search}
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.nav.search}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 transition-colors"
              aria-label={t.nav.toggleTheme}
              title={t.nav.toggleTheme}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={toggleLang}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-colors whitespace-nowrap shrink-0"
              aria-label="Switch language"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{t.nav.switchLanguage}</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-4 py-4 space-y-1">
            {navLinks.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600/10 text-indigo-600 dark:text-indigo-400'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink
              to="/contact"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {t.nav.contact}
            </NavLink>
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              {t.nav.admin}
            </NavLink>
          </div>
        )}
      </header>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
};
