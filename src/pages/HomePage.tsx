import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowLeft,
  Gamepad2,
  Smartphone,
  Monitor,
  Globe,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Shield,
  GitBranch,
  Zap,
} from 'lucide-react';
import type { CategoryInfo, PlatformStats, Product } from '../types/product';
import { useLanguage } from '../context/LanguageContext';
import { brandConfig } from '../config/brand';
import { usePageSeo } from '../hooks/usePageSeo';
import { formatDate, getCategoryLabel, isSafeExternalUrl } from '../utils/format';
import { ProductCard } from '../components/ProductCard';
import { SkeletonCard } from '../components/SkeletonCard';
import { ImageWithFallback } from '../components/ImageWithFallback';

export const HomePage: React.FC = () => {
  const { lang, isRtl, t } = useLanguage();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [latest, setLatest] = useState<Product[]>([]);
  const [popular, setPopular] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex] = useState(0);

  usePageSeo({
    title: `${brandConfig.name[lang]} — ${brandConfig.hero.headline[lang]}`,
    description: brandConfig.hero.subheadline[lang],
    canonicalPath: '/',
    structuredData: {
      '@type': 'WebSite',
      name: brandConfig.name.en,
      description: brandConfig.hero.subheadline.en,
    },
  });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [statsRes, featuredRes, latestRes, popularRes, catRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/products?featured=true&limit=6'),
          fetch('/api/products?sort=updated&limit=3'),
          fetch('/api/products?sort=popular&limit=3'),
          fetch('/api/categories'),
        ]);
        if (!active) return;
        if (statsRes.ok) setStats(await statsRes.json());
        if (featuredRes.ok) {
          const data = (await featuredRes.json()) as { items: Product[] };
          setFeatured(data.items);
        }
        if (latestRes.ok) {
          const data = (await latestRes.json()) as { items: Product[] };
          setLatest(data.items);
        }
        if (popularRes.ok) {
          const data = (await popularRes.json()) as { items: Product[] };
          setPopular(data.items);
        }
        if (catRes.ok) setCategories(await catRes.json());
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const heroProducts = featured.length > 0 ? featured : latest;
  const activeHero = heroProducts[heroIndex % Math.max(1, heroProducts.length)];
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  const categoryCards = [
    {
      id: 'games',
      icon: Gamepad2,
      to: '/games',
      title: t.categories.games,
      fallbackDesc: 'Standalone PC and tactical indie titles.',
    },
    {
      id: 'android',
      icon: Smartphone,
      to: '/android',
      title: t.categories.android,
      fallbackDesc: 'Signed APK utilities engineered for speed.',
    },
    {
      id: 'windows',
      icon: Monitor,
      to: '/windows',
      title: t.categories.windows,
      fallbackDesc: 'Native EXE, MSI, and portable ZIP desktop software.',
    },
    {
      id: 'web',
      icon: Globe,
      to: '/web-apps',
      title: t.categories.web,
      fallbackDesc: 'Interactive browser sandboxes and live web tools.',
    },
  ];

  const pillars = [
    {
      icon: GitBranch,
      title: lang === 'ar' ? 'توزيع شفاف عبر GitHub' : 'Transparent GitHub Releases',
      desc:
        lang === 'ar'
          ? 'ترتبط كل حزمة تثبيت وملف APK مباشرة ببناء GitHub Actions موثق مع ملاحظات الإصدار الكاملة.'
          : 'Every installer and Android APK links directly to reproducible GitHub Actions builds and release notes.',
    },
    {
      icon: Shield,
      title: lang === 'ar' ? 'تصميم يحترم الخصوصية' : 'Privacy-First Architecture',
      desc:
        lang === 'ar'
          ? 'تطبيقات سريعة بدون برمجيات تتبع إعلانية أو إجراءات تثبيت مزعجة.'
          : 'Zero ad-tech trackers, zero bundled bloatware, and clean standalone binaries you control.',
    },
    {
      icon: Zap,
      title: lang === 'ar' ? 'أداء أصلي وتحديث مستمر' : 'Native Performance & Active Updates',
      desc:
        lang === 'ar'
          ? 'تُبنى المنتجات بأدوات أصلية مثل Rust و Kotlin و TypeScript مع مزامنة تلقائية للإصدارات.'
          : 'Engineered with Rust, Kotlin, Godot, and TypeScript with automatic release synchronization.',
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-zinc-200 dark:border-zinc-800/80">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.16),_transparent_60%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.20),_transparent_60%)]"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="lg:col-span-7 flex flex-col justify-center"
            >
              <p className="text-xs font-semibold tracking-wide text-indigo-600 dark:text-indigo-400 mb-3">
                {brandConfig.tagline[lang]}
              </p>
              <h1
                className="font-display font-bold tracking-tight text-zinc-900 dark:text-white leading-[1.08]"
                style={{ fontSize: 'clamp(2.25rem, 4.2vw, 3.6rem)', textWrap: 'balance' }}
              >
                {brandConfig.hero.headline[lang]}
              </h1>
              <p className="mt-5 text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-2xl">
                {brandConfig.hero.subheadline[lang]}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                <Link
                  to="/products"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap shrink-0"
                >
                  <span>{t.hero.exploreProducts}</span>
                  <Arrow className="w-4 h-4" />
                </Link>
                <Link
                  to="/games"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors whitespace-nowrap shrink-0"
                >
                  <Gamepad2 className="w-4 h-4" />
                  <span>{t.hero.discoverGames}</span>
                </Link>
              </div>
            </motion.div>

            {/* Right Featured Product Preview Card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="lg:col-span-5 flex flex-col"
            >
              {activeHero ? (
                <div className="flex flex-col flex-1 bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                  <div className="relative aspect-[16/10] lg:flex-1 bg-zinc-900 overflow-hidden">
                    <ImageWithFallback
                      src={activeHero.coverImage}
                      alt={lang === 'ar' && activeHero.nameAr ? activeHero.nameAr : activeHero.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                    <div className="absolute bottom-4 inset-x-4 flex items-end justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-indigo-300 mb-1">
                          {t.hero.featuredLabel} · {getCategoryLabel(activeHero.category, lang)} · v{activeHero.version}
                        </p>
                        <h2 className="text-lg font-bold text-white truncate">
                          {lang === 'ar' && activeHero.nameAr ? activeHero.nameAr : activeHero.name}
                        </h2>
                      </div>
                      {heroProducts.length > 1 && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setHeroIndex((i) => (i - 1 + heroProducts.length) % heroProducts.length)
                            }
                            className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/75 border border-white/15 transition-colors"
                            aria-label="Previous featured product"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setHeroIndex((i) => (i + 1) % heroProducts.length)}
                            className="p-1.5 rounded-md bg-black/50 text-white hover:bg-black/75 border border-white/15 transition-colors"
                            aria-label="Next featured product"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="p-4 sm:p-5 flex items-center justify-between gap-4 border-t border-zinc-200 dark:border-zinc-800/80">
                    <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 line-clamp-1">
                      {lang === 'ar' && activeHero.taglineAr ? activeHero.taglineAr : activeHero.tagline}
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                      {activeHero.liveUrl && isSafeExternalUrl(activeHero.liveUrl) && (
                        <a
                          href={activeHero.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            void fetch('/api/downloads/track', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                productId: activeHero.id,
                                fileName: `${activeHero.name} Web App`,
                                fileFormat: 'WEB',
                                sourceType: 'web_app_launch',
                                version: activeHero.version,
                              }),
                            }).catch(() => undefined);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors whitespace-nowrap"
                        >
                          <span>{t.hero.launchApp}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <Link
                        to={`/product/${activeHero.slug || activeHero.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 transition-colors whitespace-nowrap"
                      >
                        <span>{t.hero.viewDetails}</span>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 animate-pulse min-h-[280px]" />
              )}
            </motion.div>
          </div>

          {/* 4-column Dynamic Statistics Strip */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/90">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white">
                {stats ? stats.totalProducts : '—'}
              </div>
              <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t.stats.totalProducts}
              </div>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/90">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white">
                {stats ? stats.totalGames : '—'}
              </div>
              <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t.stats.totalGames}
              </div>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/90">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white">
                {stats ? stats.totalApplications : '—'}
              </div>
              <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t.stats.totalApplications}
              </div>
            </div>
            <div className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/90">
              <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                {stats ? stats.totalDownloads : '—'}
              </div>
              <div className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t.stats.totalDownloads}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
              {t.sections.featuredTitle}
            </h2>
            <p className="mt-1.5 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
              {t.sections.featuredSubtitle}
            </p>
          </div>
          <Link
            to="/products?featured=true"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
          >
            <span>{t.sections.viewAll}</span>
            <Arrow className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading
            ? Array.from({ length: 3 }).map((_, idx) => <SkeletonCard key={idx} />)
            : featured.slice(0, 6).map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      </section>

      {/* Product Categories Showcase */}
      <section className="border-y border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/60 dark:bg-[#0C0C0F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div className="mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
              {t.sections.categoriesTitle}
            </h2>
            <p className="mt-1.5 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
              {t.sections.categoriesSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {categoryCards.map((card) => {
              const Icon = card.icon;
              const catInfo = categories.find((c) => c.id === card.id);
              const desc = catInfo
                ? lang === 'ar'
                  ? catInfo.descriptionAr
                  : catInfo.description
                : card.fallbackDesc;
              const count = catInfo?.productCount ?? 0;

              return (
                <Link
                  key={card.id}
                  to={card.to}
                  className="group p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800/90 hover:border-indigo-500/60 dark:hover:border-indigo-500/50 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                        {count} {t.sections.productsCount}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {card.title}
                    </h3>
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {desc}
                    </p>
                  </div>
                  <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    <span>{t.sections.viewAll}</span>
                    <Arrow className="w-3.5 h-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Latest Releases & Popular Products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16 space-y-16">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
                {t.sections.latestTitle}
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                {t.sections.latestSubtitle}
              </p>
            </div>
            <Link
              to="/products?sort=updated"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
            >
              <span>{t.sections.viewAll}</span>
              <Arrow className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {latest.map((item) => (
              <Link
                key={item.id}
                to={`/product/${item.slug || item.id}`}
                className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500/50 transition-colors flex items-center gap-4"
              >
                <ImageWithFallback
                  src={item.icon || item.coverImage}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                    v{item.version} · {formatDate(item.updatedAt, lang)}
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate mt-0.5">
                    {lang === 'ar' && item.nameAr ? item.nameAr : item.name}
                  </div>
                  <div className="text-xs text-zinc-500 truncate mt-0.5">
                    {item.platforms.join(', ')}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
                {t.sections.popularTitle}
              </h2>
              <p className="mt-1.5 text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
                {t.sections.popularSubtitle}
              </p>
            </div>
            <Link
              to="/products?sort=popular"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
            >
              <span>{t.sections.viewAll}</span>
              <Arrow className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading
              ? Array.from({ length: 3 }).map((_, idx) => <SkeletonCard key={idx} />)
              : popular.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        </div>
      </section>

      {/* Why Choose These Products & About Developer */}
      <section className="border-t border-zinc-200 dark:border-zinc-800/80 bg-zinc-100/60 dark:bg-[#0C0C0F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-4 space-y-3">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-display">
                {lang === 'ar' ? 'لماذا برمجيات كيستريل فورج؟' : 'Why Choose Kestrel Forge'}
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {lang === 'ar'
                  ? 'كل لعبة وتطبيق مبني بنظام تحكم في المصدر وبناء آلي عبر GitHub Actions وتوزيع مباشر عبر GitHub Releases.'
                  : 'Every game, Android APK, Windows utility, and web app is engineered with reproducible builds and direct GitHub Releases distribution.'}
              </p>
              <Link
                to="/about"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pt-1"
              >
                <span>{t.nav.about}</span>
                <Arrow className="w-4 h-4" />
              </Link>
            </div>
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-5">
              {pillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div
                    key={pillar.title}
                    className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800"
                  >
                    <Icon className="w-5 h-5 text-indigo-500 mb-3" />
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{pillar.title}</h3>
                    <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {pillar.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
