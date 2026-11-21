import React, { createContext, useContext, useEffect, useState } from 'react';
import { translations, type Language } from '../i18n/translations';

interface LanguageContextValue {
  lang: Language;
  isRtl: boolean;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (typeof translations)[Language];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('kf_lang');
    return saved === 'ar' ? 'ar' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('kf_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = (next: Language) => setLangState(next);
  const toggleLang = () => setLangState((prev) => (prev === 'en' ? 'ar' : 'en'));

  return (
    <LanguageContext.Provider
      value={{
        lang,
        isRtl: lang === 'ar',
        setLang,
        toggleLang,
        t: translations[lang],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
