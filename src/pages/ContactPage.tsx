import React, { useState } from 'react';
import { Github, Mail, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { usePageSeo } from '../hooks/usePageSeo';

export const ContactPage: React.FC = () => {
  const { lang, t } = useLanguage();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  usePageSeo({
    title: lang === 'ar' ? 'تواصل معنا' : 'Contact Studio',
    description: t.contact.subtitle,
    canonicalPath: '/contact',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', ...form }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error || 'Failed to send message');
        return;
      }
      setSent(true);
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      setError('Network error while sending message');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      <div className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 dark:text-white font-display">
          {t.contact.title}
        </h1>
        <p className="mt-2 text-sm sm:text-base text-zinc-600 dark:text-zinc-400 max-w-2xl">
          {t.contact.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 p-6 sm:p-8 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
          {sent ? (
            <div className="py-8 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">{t.contact.sentTitle}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mx-auto">{t.contact.sentDesc}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    {t.contact.name}
                  </label>
                  <input
                    required
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                    {t.contact.email}
                  </label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  {t.contact.subject}
                </label>
                <input
                  required
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  {t.contact.message}
                </label>
                <textarea
                  required
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
              >
                {submitting ? t.contact.sending : t.contact.send}
              </button>
            </form>
          )}
        </div>

        <aside className="lg:col-span-4 p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-4">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-white">{t.contact.directLinks}</h2>
          <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
            <a
              href="mailto:contact@kestrelforge.dev"
              className="flex items-center gap-2.5 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <Mail className="w-4 h-4 text-indigo-500" />
              <span>contact@kestrelforge.dev</span>
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              <Github className="w-4 h-4 text-indigo-500" />
              <span>GitHub Releases & Source</span>
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
};
