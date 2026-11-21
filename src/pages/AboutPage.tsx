import React from 'react';
import { Link } from 'react-router-dom';
import { Github, ArrowRight, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { ImageWithFallback } from '../components/ImageWithFallback';
import { usePageSeo } from '../hooks/usePageSeo';
import { brandConfig } from '../config/brand';

export const AboutPage: React.FC = () => {
  const { isRtl, lang, t } = useLanguage();
  const Arrow = isRtl ? ArrowLeft : ArrowRight;

  usePageSeo({
    title: lang === 'ar' ? `عن ${brandConfig.name.ar}` : `About ${brandConfig.name.en}`,
    description: t.about.subtitle,
    canonicalPath: '/about',
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 space-y-5">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white font-display">
            {t.about.title}
          </h1>
          <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {t.about.subtitle}
          </p>
          <div className="pt-2 space-y-4 text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white font-display">
              {t.about.storyTitle}
            </h2>
            <p>{t.about.storyP1}</p>
            <p>{t.about.storyP2}</p>
          </div>

          <div className="pt-4 flex flex-wrap items-center gap-3">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              <span>{t.hero.exploreProducts}</span>
              <Arrow className="w-4 h-4" />
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 transition-colors"
            >
              <Github className="w-4 h-4" />
              <span>{t.footer.githubProfile}</span>
            </a>
          </div>
        </div>

        <div className="lg:col-span-5 grid grid-cols-1 gap-4">
          <div className="aspect-square rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
            <ImageWithFallback
              src="/src/assets/images/studio_founder_portrait_1795186839533.jpg"
              alt="Kestrel Forge founder portrait"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      {/* Studio Workstation Banner */}
      <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 aspect-[21/9] bg-zinc-900">
        <ImageWithFallback
          src="/src/assets/images/hero_showcase_studio_1795186839580.jpg"
          alt="Kestrel Forge engineering studio"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Workflow Architecture */}
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white font-display">
          {t.about.workflowTitle}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { title: t.about.step1Title, desc: t.about.step1Desc },
            { title: t.about.step2Title, desc: t.about.step2Desc },
            { title: t.about.step3Title, desc: t.about.step3Desc },
          ].map((step) => (
            <div
              key={step.title}
              className="p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800"
            >
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
