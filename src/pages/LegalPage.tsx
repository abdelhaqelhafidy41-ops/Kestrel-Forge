import React from 'react';
import { useLanguage } from '../context/LanguageContext';
import { usePageSeo } from '../hooks/usePageSeo';

interface LegalPageProps {
  mode: 'privacy' | 'terms';
}

export const LegalPage: React.FC<LegalPageProps> = ({ mode }) => {
  const { lang } = useLanguage();

  const isPrivacy = mode === 'privacy';
  const title = isPrivacy
    ? lang === 'ar'
      ? 'سياسة الخصوصية'
      : 'Privacy Policy'
    : lang === 'ar'
      ? 'شروط الاستخدام'
      : 'Terms of Use';

  usePageSeo({
    title,
    description: isPrivacy
      ? 'Privacy practices and zero-PII aggregate download counting policy for Kestrel Forge.'
      : 'Software distribution license and GitHub Releases terms of use for Kestrel Forge.',
    canonicalPath: isPrivacy ? '/privacy' : '/terms',
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 space-y-6">
      <h1 className="text-3xl font-bold text-zinc-900 dark:text-white font-display">{title}</h1>
      <div className="space-y-4 text-sm sm:text-base text-zinc-700 dark:text-zinc-300 leading-relaxed">
        {isPrivacy ? (
          <>
            <p>
              Kestrel Forge respects visitor privacy. We do not embed third-party ad trackers, behavioral profiling scripts, or invasive analytics cookies across our storefront or standalone applications.
            </p>
            <p>
              When you download a build or launch a web application, we record only aggregate, non-personal technical counts (product ID, file format, release version, and timestamp) to measure release adoption and verify distribution health. We do not store IP addresses or browser fingerprints in our download analytics table.
            </p>
            <p>
              Messages submitted via the Contact or Report a Problem forms are stored solely to respond to your inquiry or resolve reported software issues.
            </p>
          </>
        ) : (
          <>
            <p>
              Software, Android APKs, Windows installers, and video games published on Kestrel Forge are distributed under the specific open-source or freeware license stated on each product detail page.
            </p>
            <p>
              External binary links hosted on GitHub Releases are governed by GitHub availability and the corresponding repository release checksums. Always verify file formats and versions prior to installation.
            </p>
            <p>
              All products are provided as-is without implied warranties beyond those required by applicable law.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
