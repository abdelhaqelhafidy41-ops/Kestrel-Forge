import { useEffect } from 'react';
import { brandConfig } from '../config/brand';

interface SeoOptions {
  title: string;
  description: string;
  canonicalPath?: string;
  image?: string;
  structuredData?: Record<string, unknown>;
}

export function usePageSeo({ title, description, canonicalPath, image, structuredData }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(brandConfig.name.en) ? title : `${title} — ${brandConfig.name.en}`;
    document.title = fullTitle;

    const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);

    const origin = window.location.origin;
    const canonicalUrl = canonicalPath ? `${origin}${canonicalPath}` : `${origin}${window.location.pathname}`;
    setMeta('property', 'og:url', canonicalUrl);

    if (image) {
      const absImage = image.startsWith('http') ? image : `${origin}${image}`;
      setMeta('property', 'og:image', absImage);
      setMeta('name', 'twitter:image', absImage);
    }

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonicalUrl;

    const ldId = 'kf-structured-data';
    const existingScript = document.getElementById(ldId);
    if (existingScript) existingScript.remove();

    if (structuredData) {
      const script = document.createElement('script');
      script.id = ldId;
      script.type = 'application/ld+json';
      script.text = JSON.stringify({
        '@context': 'https://schema.org',
        ...structuredData,
      });
      document.head.appendChild(script);
    }
  }, [title, description, canonicalPath, image, structuredData]);
}
