import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Package,
  RefreshCw,
  Inbox,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Lock,
  GitBranch,
  KeyRound,
} from 'lucide-react';
import type { AnalyticsSummary, ContactMessage, Product } from '../types/product';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { usePageSeo } from '../hooks/usePageSeo';
import { formatDate, getCategoryLabel } from '../utils/format';
import { AdminProductModal } from '../components/AdminProductModal';

export type AdminTab = 'overview' | 'products' | 'github' | 'messages';

interface AdminPageProps {
  initialTab?: AdminTab;
}

export const AdminPage: React.FC<AdminPageProps> = ({ initialTab = 'overview' }) => {
  const { user, loading: authLoading, login, logout } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();

  usePageSeo({
    title: t.nav.admin,
    description: t.admin.loginSubtitle,
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [products, setProducts] = useState<Product[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [modalProduct, setModalProduct] = useState<Product | null | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadAdminData = async () => {
    setLoadingData(true);
    try {
      const [prodRes, analyticsRes, msgRes] = await Promise.all([
        fetch('/api/products?limit=50&includeUnpublished=true', { credentials: 'include' }),
        fetch('/api/admin/analytics', { credentials: 'include' }),
        fetch('/api/admin/messages', { credentials: 'include' }),
      ]);
      if (prodRes.ok) {
        const d = (await prodRes.json()) as { items: Product[] };
        setProducts(d.items);
      }
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (msgRes.ok) setMessages(await msgRes.json());
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user) {
      void loadAdminData();
    }
  }, [user]);

  const handleTabSelect = (nextTab: AdminTab) => {
    setTab(nextTab);
    if (nextTab === 'overview') navigate('/admin/analytics');
    else if (nextTab === 'products') navigate('/admin/products');
    else if (nextTab === 'github') navigate('/admin/releases');
    else navigate('/admin');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    setAuthError(null);
    try {
      await login(email, password);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSigningIn(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/products/${encodeURIComponent(deleteTarget.id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      setStatusMessage(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      await loadAdminData();
    }
  };

  const handleSyncSingle = async (productId: string) => {
    setSyncingId(productId);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/sync-github`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const summary = (await res.json()) as { fetchStatus: string; latestTag: string | null; errorMessage?: string };
        setStatusMessage(
          summary.fetchStatus === 'ok'
            ? `Synced ${productId}: latest tag ${summary.latestTag || 'none'}`
            : `Sync status for ${productId}: ${summary.errorMessage || summary.fetchStatus}`
        );
        await loadAdminData();
      }
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/sync-all-github', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const d = (await res.json()) as { synced: number };
        setStatusMessage(`Completed GitHub Releases sync across ${d.synced} repositories.`);
        await loadAdminData();
      }
    } finally {
      setSyncingAll(false);
    }
  };

  const handleReconcileConfig = async () => {
    setReconciling(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/reconcile-config', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const d = (await res.json()) as {
          inserted: number;
          updatedConfigOwned: number;
          skippedDashboardOwned: number;
        };
        setStatusMessage(
          `Reconciled products.config.json: ${d.inserted} added, ${d.updatedConfigOwned} config-owned updated, ${d.skippedDashboardOwned} dashboard-owned preserved.`
        );
        await loadAdminData();
      }
    } finally {
      setReconciling(false);
    }
  };

  const toggleMessageStatus = async (msg: ContactMessage) => {
    const next = msg.status === 'open' ? 'resolved' : 'open';
    await fetch(`/api/admin/messages/${msg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: next }),
    });
    await loadAdminData();
  };

  if (authLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center text-sm text-zinc-500">
        Verifying admin session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 sm:py-24">
        <div className="p-6 sm:p-8 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600/10 text-indigo-500 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white font-display">
                {t.admin.loginTitle}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                {t.admin.loginSubtitle}
              </p>
            </div>
          </div>

          {authError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
              {authError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">{t.admin.email}</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@kestrelforge.dev"
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1.5">{t.admin.password}</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={signingIn}
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
            >
              {signingIn ? t.admin.signingIn : t.admin.signIn}
            </button>
          </form>

          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed pt-2 border-t border-zinc-200 dark:border-zinc-800">
            Configure <code className="font-mono">ADMIN_EMAIL</code>,{' '}
            <code className="font-mono">ADMIN_PASSWORD</code>, and{' '}
            <code className="font-mono">JWT_SECRET</code> in your server environment.
            {import.meta.env.DEV && (
              <>
                {' '}
                Dev seed: <code className="font-mono">admin@kestrelforge.dev</code> /{' '}
                <code className="font-mono">KestrelAdmin2026!</code>.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  const dailyMax = Math.max(1, ...(analytics?.dailySeries.map((d) => d.total) || [1]));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3 p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-2">
          <div className="px-3 py-2 mb-2 border-b border-zinc-200 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-900 dark:text-white truncate">{user.email}</p>
            <p className="text-[11px] text-zinc-500">Administrator</p>
          </div>

          {[
            { id: 'overview' as const, label: t.admin.overview, icon: BarChart3 },
            { id: 'products' as const, label: t.admin.products, icon: Package },
            { id: 'github' as const, label: t.admin.githubSync, icon: RefreshCw },
            { id: 'messages' as const, label: t.admin.messages, icon: Inbox },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabSelect(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === item.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
            <button
              type="button"
              onClick={() => {
                setPwError(null);
                setPasswordModalOpen(true);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Change Password</span>
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>{t.admin.signOut}</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="lg:col-span-9 space-y-6">
          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs font-medium text-indigo-600 dark:text-indigo-300 flex items-center justify-between gap-4">
              <span>{statusMessage}</span>
              <button type="button" onClick={() => setStatusMessage(null)} className="underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Tab 1: Overview & Analytics */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
                  <div className="text-2xl font-bold font-mono tabular-nums text-zinc-900 dark:text-white">
                    {analytics?.stats.totalProducts ?? products.length}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{t.stats.totalProducts}</div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
                  <div className="text-2xl font-bold font-mono tabular-nums text-emerald-500">
                    {analytics?.stats.directDownloads ?? 0}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{t.stats.verifiedDirect}</div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
                  <div className="text-2xl font-bold font-mono tabular-nums text-indigo-500">
                    {analytics?.stats.githubReleaseClicks ?? 0}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{t.stats.githubClicks}</div>
                </div>
                <div className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
                  <div className="text-2xl font-bold font-mono tabular-nums text-amber-500">
                    {analytics?.stats.webAppLaunches ?? 0}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{t.stats.webLaunches}</div>
                </div>
              </div>

              {/* 14-Day Bar Chart */}
              <div className="p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-6">
                  {t.admin.downloadsOverTime}
                </h2>
                <div className="h-44 flex items-end gap-2">
                  {(analytics?.dailySeries || []).map((day) => {
                    const heightPct = Math.round((day.total / dailyMax) * 100);
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 group">
                        <div className="w-full h-36 flex items-end justify-center">
                          <div
                            title={`${day.date}: ${day.total} total (${day.direct} direct, ${day.github} GitHub, ${day.web} web)`}
                            style={{ height: `${Math.max(4, heightPct)}%` }}
                            className={`w-full max-w-[28px] rounded-t-md transition-all ${
                              day.total > 0
                                ? 'bg-indigo-500 group-hover:bg-indigo-400'
                                : 'bg-zinc-200 dark:bg-zinc-800'
                            }`}
                          />
                        </div>
                        <span className="text-[10px] font-mono tabular-nums text-zinc-500">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By Platform & By Version Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
                    Downloads by Platform
                  </h3>
                  {(analytics?.byPlatform || []).length === 0 ? (
                    <p className="text-xs text-zinc-500">No platform download events yet.</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {analytics!.byPlatform.map((item) => (
                        <div key={item.platform} className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/70">
                          <span className="text-zinc-700 dark:text-zinc-300">{item.platform}</span>
                          <span className="font-mono tabular-nums font-semibold">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-5 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-3">
                    Downloads by Version
                  </h3>
                  {(analytics?.byVersion || []).length === 0 ? (
                    <p className="text-xs text-zinc-500">No version download events yet.</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      {analytics!.byVersion.map((item) => (
                        <div key={item.version} className="flex justify-between py-1 border-b border-zinc-100 dark:border-zinc-800/70">
                          <span className="font-mono text-zinc-700 dark:text-zinc-300">v{item.version}</span>
                          <span className="font-mono tabular-nums font-semibold">{item.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Per-Product Breakdown */}
              <div className="p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
                  {t.admin.sourceBreakdown}
                </h2>
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                      <th className="py-2.5 text-start font-medium">Product</th>
                      <th className="py-2.5 text-start font-medium">Category</th>
                      <th className="py-2.5 text-end font-medium">Direct</th>
                      <th className="py-2.5 text-end font-medium">GitHub Clicks</th>
                      <th className="py-2.5 text-end font-medium">Web Launches</th>
                      <th className="py-2.5 text-end font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {(analytics?.byProduct || []).map((row) => (
                      <tr key={row.productId} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                        <td className="py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{row.productName}</td>
                        <td className="py-2.5 text-zinc-500">{getCategoryLabel(row.category, lang)}</td>
                        <td className="py-2.5 text-end font-mono tabular-nums">{row.direct}</td>
                        <td className="py-2.5 text-end font-mono tabular-nums">{row.github}</td>
                        <td className="py-2.5 text-end font-mono tabular-nums">{row.web}</td>
                        <td className="py-2.5 text-end font-mono font-semibold tabular-nums">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Recent Events */}
              <div className="p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-white mb-4">
                  {t.admin.recentActivity}
                </h2>
                {(analytics?.recentEvents || []).length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4">{t.admin.noEventsYet}</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                        <th className="py-2 text-start font-medium">Product</th>
                        <th className="py-2 text-start font-medium">Asset</th>
                        <th className="py-2 text-start font-medium">Type</th>
                        <th className="py-2 text-end font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                      {analytics!.recentEvents.map((ev) => (
                        <tr key={ev.id}>
                          <td className="py-2 font-medium text-zinc-900 dark:text-zinc-100">{ev.productName}</td>
                          <td className="py-2 font-mono text-zinc-600 dark:text-zinc-400">
                            {ev.fileName} ({ev.fileFormat})
                          </td>
                          <td className="py-2 text-zinc-500">{ev.sourceType}</td>
                          <td className="py-2 text-end font-mono tabular-nums text-zinc-500">
                            {formatDate(ev.createdAt, lang)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Products Manager */}
          {tab === 'products' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">
                  {t.admin.products} ({products.length})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReconcileConfig}
                    disabled={reconciling}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 disabled:opacity-50"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>{reconciling ? 'Syncing Config...' : 'Import products.config.json'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalProduct(null)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t.admin.addProduct}</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                      <th className="px-4 py-3 text-start font-medium">Name</th>
                      <th className="px-4 py-3 text-start font-medium">Category</th>
                      <th className="px-4 py-3 text-start font-medium">Version</th>
                      <th className="px-4 py-3 text-start font-medium">Source</th>
                      <th className="px-4 py-3 text-end font-medium">Downloads</th>
                      <th className="px-4 py-3 text-end font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {products.map((p) => (
                      <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                          {p.name}
                          {!p.published && (
                            <span className="ms-2 text-[10px] text-zinc-500 font-semibold">Draft</span>
                          )}
                          {p.featured && (
                            <span className="ms-2 text-[10px] text-amber-500 font-semibold">Featured</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{getCategoryLabel(p.category, lang)}</td>
                        <td className="px-4 py-3 font-mono tabular-nums">v{p.version}</td>
                        <td className="px-4 py-3 font-mono text-zinc-500">{p.managedBy}</td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums">{p.totalDownloads}</td>
                        <td className="px-4 py-3 text-end">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              to={`/product/${p.slug || p.id}`}
                              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                              title="View"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setModalProduct(p)}
                              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-indigo-500"
                              title={t.admin.editProduct}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(p)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-red-500"
                              title={t.admin.deleteProduct}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab 3: GitHub Releases Sync */}
          {tab === 'github' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">
                  {t.admin.githubSync}
                </h2>
                <button
                  type="button"
                  onClick={handleSyncAll}
                  disabled={syncingAll}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingAll ? 'animate-spin' : ''}`} />
                  <span>{syncingAll ? t.admin.syncing : t.admin.syncAll}</span>
                </button>
              </div>

              <div className="space-y-3">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-900 dark:text-white">{p.name}</span>
                        <span className="text-xs font-mono text-zinc-500">v{p.version}</span>
                      </div>
                      <p className="text-xs font-mono text-zinc-500 truncate">
                        {p.githubOwner && p.githubRepoName
                          ? `${p.githubOwner}/${p.githubRepoName}`
                          : 'No GitHub repo configured'}
                      </p>
                      {p.githubCache && (
                        <p className="text-[11px] text-zinc-500">
                          Status: <span className="font-mono">{p.githubCache.fetchStatus}</span>
                          {p.githubCache.latestTag ? ` · Tag: ${p.githubCache.latestTag}` : ''}
                          {p.githubCache.assets.length ? ` · Assets: ${p.githubCache.assets.length}` : ''}
                          {p.githubCache.errorMessage ? ` · ${p.githubCache.errorMessage}` : ''}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!p.githubOwner || syncingId === p.id}
                      onClick={() => handleSyncSingle(p.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 disabled:opacity-50 shrink-0"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncingId === p.id ? 'animate-spin' : ''}`} />
                      <span>{t.admin.syncNow}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Messages & Bug Reports */}
          {tab === 'messages' && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">
                {t.admin.messages} ({messages.length})
              </h2>
              {loadingData && messages.length === 0 ? (
                <p className="text-xs text-zinc-500">Loading messages...</p>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 text-xs text-zinc-500">
                  No contact inquiries or problem reports submitted yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className="p-4 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-semibold text-zinc-900 dark:text-white">{msg.subject}</span>
                          <span className="text-zinc-500 ms-2">
                            ({msg.type}
                            {msg.productId ? ` · ${msg.productId}` : ''})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleMessageStatus(msg)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold ${
                            msg.status === 'resolved'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-amber-500/10 text-amber-500'
                          }`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{msg.status === 'resolved' ? 'Resolved' : 'Mark Resolved'}</span>
                        </button>
                      </div>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300">{msg.message}</p>
                      <p className="text-[11px] text-zinc-500">
                        From {msg.name} ({msg.email}) · {formatDate(msg.createdAt, lang)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modalProduct !== undefined && (
        <AdminProductModal
          initial={modalProduct}
          onClose={() => setModalProduct(undefined)}
          onSaved={loadAdminData}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-md w-full p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{t.admin.confirmDeleteTitle}</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t.admin.confirmDeleteDesc} ({deleteTarget.name})
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300"
              >
                {t.product.cancel}
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white"
              >
                {t.admin.deleteProduct}
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPasswordModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-md w-full p-6 rounded-xl bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Update Admin Password</h3>
            {pwError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
                {pwError}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setPwSaving(true);
                setPwError(null);
                try {
                  const res = await fetch('/api/admin/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(pwForm),
                  });
                  const data = (await res.json()) as { ok?: boolean; error?: string };
                  if (!res.ok) {
                    setPwError(data.error || 'Failed to update password');
                    return;
                  }
                  setPasswordModalOpen(false);
                  setPwForm({ currentPassword: '', newPassword: '' });
                  setStatusMessage('Admin password updated successfully.');
                } finally {
                  setPwSaving(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Current Password</label>
                <input
                  required
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">New Password (min 8 chars)</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300"
                >
                  {t.product.cancel}
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {pwSaving ? t.admin.saving : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
