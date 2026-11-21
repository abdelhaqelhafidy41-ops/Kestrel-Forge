import React, { useState } from 'react';
import { Upload, X, Plus, Trash2 } from 'lucide-react';
import type { DownloadAsset, Product, ProductCategory, VersionHistoryEntry } from '../types/product';
import { useLanguage } from '../context/LanguageContext';

interface AdminProductModalProps {
  initial: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

export const AdminProductModal: React.FC<AdminProductModalProps> = ({
  initial,
  onClose,
  onSaved,
}) => {
  const { t } = useLanguage();
  const isEditing = Boolean(initial);

  const [id, setId] = useState(initial?.id || '');
  const [slug, setSlug] = useState(initial?.slug || '');
  const [name, setName] = useState(initial?.name || '');
  const [nameAr, setNameAr] = useState(initial?.nameAr || '');
  const [tagline, setTagline] = useState(initial?.tagline || '');
  const [taglineAr, setTaglineAr] = useState(initial?.taglineAr || '');
  const [category, setCategory] = useState<ProductCategory>(initial?.category || 'windows');
  const [description, setDescription] = useState(initial?.description || '');
  const [descriptionAr, setDescriptionAr] = useState(initial?.descriptionAr || '');
  const [featuresText, setFeaturesText] = useState((initial?.features || []).join('\n'));
  const [featuresArText, setFeaturesArText] = useState((initial?.featuresAr || []).join('\n'));
  const [icon, setIcon] = useState(initial?.icon || '');
  const [coverImage, setCoverImage] = useState(initial?.coverImage || '');
  const [screenshots, setScreenshots] = useState<string[]>(initial?.screenshots || []);
  const [githubRepo, setGithubRepo] = useState(initial?.githubRepo || '');
  const [githubReleases, setGithubReleases] = useState(initial?.githubReleases || '');
  const [liveUrl, setLiveUrl] = useState(initial?.liveUrl || '');
  const [featured, setFeatured] = useState(initial?.featured || false);
  const [published, setPublished] = useState(initial?.published ?? true);
  const [releaseSync, setReleaseSync] = useState(initial?.releaseSync ?? true);
  const [assetExtensionsText, setAssetExtensionsText] = useState(
    (initial?.assetFilter?.extensions || []).join(', ')
  );
  const [assetPattern, setAssetPattern] = useState(initial?.assetFilter?.pattern || '');
  const [platformsText, setPlatformsText] = useState((initial?.platforms || ['Windows']).join(', '));
  const [technologiesText, setTechnologiesText] = useState((initial?.technologies || []).join(', '));
  const [version, setVersion] = useState(initial?.version || '1.0.0');
  const [license, setLicense] = useState(initial?.license || 'MIT');
  const [developer, setDeveloper] = useState(initial?.developer || 'Kestrel Forge');
  const [reqOs, setReqOs] = useState(initial?.systemRequirements?.os || '');
  const [reqCpu, setReqCpu] = useState(initial?.systemRequirements?.processor || '');
  const [reqRam, setReqRam] = useState(initial?.systemRequirements?.memory || '');
  const [reqStorage, setReqStorage] = useState(initial?.systemRequirements?.storage || '');
  const [reqGpu, setReqGpu] = useState(initial?.systemRequirements?.graphics || '');

  const [manualDownloads, setManualDownloads] = useState<DownloadAsset[]>(
    initial?.manualDownloads || []
  );
  const [versionHistory, setVersionHistory] = useState<VersionHistoryEntry[]>(
    initial?.versionHistory || []
  );

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File): Promise<string | null> => {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || 'Image upload failed');
        return null;
      }
      return data.url;
    } catch {
      setError('Upload failed');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const cleanId = id.trim().toLowerCase();
    const cleanSlug = (slug.trim() || cleanId).toLowerCase();

    const payload = {
      id: cleanId,
      slug: cleanSlug,
      name: name.trim(),
      nameAr: nameAr.trim(),
      tagline: tagline.trim(),
      taglineAr: taglineAr.trim(),
      category,
      description: description.trim(),
      descriptionAr: descriptionAr.trim(),
      features: featuresText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      featuresAr: featuresArText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      icon: icon.trim() || coverImage.trim(),
      coverImage: coverImage.trim(),
      screenshots: screenshots.filter(Boolean),
      githubRepo: githubRepo.trim(),
      githubReleases: githubReleases.trim(),
      liveUrl: liveUrl.trim() ? liveUrl.trim() : null,
      featured,
      published,
      releaseSync,
      assetFilter: {
        extensions: assetExtensionsText
          .split(',')
          .map((s) => s.trim().toLowerCase().replace(/^\./, ''))
          .filter(Boolean),
        pattern: assetPattern.trim(),
      },
      platforms: platformsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      technologies: technologiesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      systemRequirements: {
        ...(reqOs ? { os: reqOs } : {}),
        ...(reqCpu ? { processor: reqCpu } : {}),
        ...(reqRam ? { memory: reqRam } : {}),
        ...(reqStorage ? { storage: reqStorage } : {}),
        ...(reqGpu ? { graphics: reqGpu } : {}),
      },
      version: version.trim(),
      developer: developer.trim() || 'Kestrel Forge',
      license: license.trim() || 'MIT',
      manualDownloads,
      versionHistory,
    };

    try {
      const endpoint = isEditing
        ? `/api/admin/products/${encodeURIComponent(initial!.id)}`
        : '/api/admin/products';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Failed to save product');
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError('Network error while saving product');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-4xl my-8 bg-white dark:bg-[#111114] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white font-display">
            {isEditing ? `${t.admin.editProduct}: ${initial?.name}` : t.admin.addProduct}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 max-h-[78vh] overflow-y-auto space-y-6 text-sm">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
              {error}
            </div>
          )}

          {/* Core Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Product ID</label>
              <input
                required
                disabled={isEditing}
                type="text"
                value={id}
                onChange={(e) => {
                  const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
                  setId(val);
                  if (!isEditing) setSlug(val);
                }}
                placeholder="my-windows-tool"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">URL Slug</label>
              <input
                required
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="my-windows-tool"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              >
                <option value="games">Games</option>
                <option value="android">Android Apps</option>
                <option value="windows">Windows Software</option>
                <option value="web">Web Apps</option>
                <option value="other">Developer Tools</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Version</label>
              <input
                required
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 font-mono text-xs"
              />
            </div>
          </div>

          {/* Names & Taglines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Name (English)</label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Name (Arabic)</label>
              <input
                type="text"
                dir="rtl"
                value={nameAr}
                onChange={(e) => setNameAr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Short Description (English)</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Short Description (Arabic)</label>
              <input
                type="text"
                dir="rtl"
                value={taglineAr}
                onChange={(e) => setTaglineAr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </div>

          {/* Descriptions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Description (English)</label>
              <textarea
                required
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Description (Arabic)</label>
              <textarea
                rows={4}
                dir="rtl"
                value={descriptionAr}
                onChange={(e) => setDescriptionAr(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
              />
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Features (one per line, EN)</label>
              <textarea
                rows={3}
                value={featuresText}
                onChange={(e) => setFeaturesText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Features (one per line, AR)</label>
              <textarea
                rows={3}
                dir="rtl"
                value={featuresArText}
                onChange={(e) => setFeaturesArText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>
          </div>

          {/* GitHub, Release Sync, & Asset Filter */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-500">GitHub Integration & Release Filters</span>
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={releaseSync}
                  onChange={(e) => setReleaseSync(e.target.checked)}
                  className="accent-indigo-600"
                />
                <span>Enable automatic GitHub Release sync</span>
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="url"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              />
              <input
                type="url"
                value={githubReleases}
                onChange={(e) => setGithubReleases(e.target.value)}
                placeholder="https://github.com/owner/repo/releases"
                className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              />
              <input
                type="text"
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
                placeholder="Live Web App URL (optional)"
                className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={assetExtensionsText}
                onChange={(e) => setAssetExtensionsText(e.target.value)}
                placeholder="Allowed asset extensions (e.g. apk, exe, msi, zip)"
                className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
              />
              <input
                type="text"
                value={assetPattern}
                onChange={(e) => setAssetPattern(e.target.value)}
                placeholder="Filename pattern filter (optional, e.g. win64)"
                className="px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
              />
            </div>
          </div>

          {/* Platforms, Tech, License, Visibility */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Platforms</label>
              <input
                required
                type="text"
                value={platformsText}
                onChange={(e) => setPlatformsText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">Technologies</label>
              <input
                type="text"
                value={technologiesText}
                onChange={(e) => setTechnologiesText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 mb-1">License & Developer</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={license}
                  onChange={(e) => setLicense(e.target.value)}
                  placeholder="MIT"
                  className="w-1/2 px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                />
                <input
                  type="text"
                  value={developer}
                  onChange={(e) => setDeveloper(e.target.value)}
                  placeholder="Developer"
                  className="w-1/2 px-2.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 py-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="accent-indigo-600"
                />
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Published</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                  className="accent-indigo-600"
                />
                <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Featured</span>
              </label>
            </div>
          </div>

          {/* Media & Image Uploads */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Media & Screenshots</h3>
              {uploading && <span className="text-xs text-indigo-500">Uploading...</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Cover Image Path / Upload</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={coverImage}
                    onChange={(e) => setCoverImage(e.target.value)}
                    placeholder="/uploads/cover.jpg"
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                  />
                  <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-semibold cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{t.admin.uploadImage}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await uploadFile(file);
                        if (url) {
                          setCoverImage(url);
                          if (!icon) setIcon(url);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Icon Image Path / Upload</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    placeholder="/uploads/icon.png"
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                  />
                  <label className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-white text-xs font-semibold cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const url = await uploadFile(file);
                        if (url) setIcon(url);
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-zinc-500">Screenshots ({screenshots.length})</span>
                <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 text-white text-xs font-semibold cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Screenshot</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const url = await uploadFile(file);
                      if (url) setScreenshots((prev) => [...prev, url]);
                    }}
                  />
                </label>
              </div>
              <div className="space-y-2">
                {screenshots.map((shot, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={shot}
                      onChange={(e) => {
                        const copy = [...screenshots];
                        copy[idx] = e.target.value;
                        setScreenshots(copy);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* System Requirements */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={reqOs}
              onChange={(e) => setReqOs(e.target.value)}
              placeholder="OS Requirement"
              className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
            />
            <input
              type="text"
              value={reqCpu}
              onChange={(e) => setReqCpu(e.target.value)}
              placeholder="Processor"
              className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
            />
            <input
              type="text"
              value={reqRam}
              onChange={(e) => setReqRam(e.target.value)}
              placeholder="Memory (RAM)"
              className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
            />
            <input
              type="text"
              value={reqStorage}
              onChange={(e) => setReqStorage(e.target.value)}
              placeholder="Storage"
              className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
            />
            <input
              type="text"
              value={reqGpu}
              onChange={(e) => setReqGpu(e.target.value)}
              placeholder="Graphics"
              className="px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
            />
          </div>

          {/* Manual Downloads & Version History */}
          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500">Direct Download Links ({manualDownloads.length})</span>
              <button
                type="button"
                onClick={() =>
                  setManualDownloads((prev) => [
                    ...prev,
                    {
                      id: `dl-${Date.now()}`,
                      name: 'App-Setup.exe',
                      format: 'EXE',
                      sizeBytes: 10485760,
                      url: 'https://github.com',
                      version,
                      releaseDate: new Date().toISOString(),
                      source: 'direct',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add File</span>
              </button>
            </div>
            {manualDownloads.map((dl, idx) => (
              <div key={dl.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={dl.name}
                  onChange={(e) => {
                    const copy = [...manualDownloads];
                    copy[idx] = { ...dl, name: e.target.value };
                    setManualDownloads(copy);
                  }}
                  placeholder="File name"
                  className="sm:col-span-4 px-2.5 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                />
                <input
                  type="text"
                  value={dl.format}
                  onChange={(e) => {
                    const copy = [...manualDownloads];
                    copy[idx] = { ...dl, format: e.target.value.toUpperCase() };
                    setManualDownloads(copy);
                  }}
                  placeholder="APK / EXE"
                  className="sm:col-span-2 px-2.5 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
                />
                <input
                  type="text"
                  value={dl.url}
                  onChange={(e) => {
                    const copy = [...manualDownloads];
                    copy[idx] = { ...dl, url: e.target.value };
                    setManualDownloads(copy);
                  }}
                  placeholder="Download URL"
                  className="sm:col-span-5 px-2.5 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setManualDownloads((prev) => prev.filter((_, i) => i !== idx))}
                  className="sm:col-span-1 p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500">Version History ({versionHistory.length})</span>
              <button
                type="button"
                onClick={() =>
                  setVersionHistory((prev) => [
                    { version, date: new Date().toISOString(), notes: 'Release notes...' },
                    ...prev,
                  ])
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-800 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Entry</span>
              </button>
            </div>
            {versionHistory.map((entry, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  value={entry.version}
                  onChange={(e) => {
                    const copy = [...versionHistory];
                    copy[idx] = { ...entry, version: e.target.value };
                    setVersionHistory(copy);
                  }}
                  placeholder="1.0.0"
                  className="sm:col-span-2 px-2.5 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
                />
                <input
                  type="text"
                  value={entry.notes}
                  onChange={(e) => {
                    const copy = [...versionHistory];
                    copy[idx] = { ...entry, notes: e.target.value };
                    setVersionHistory(copy);
                  }}
                  placeholder="Release notes"
                  className="sm:col-span-9 px-2.5 py-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setVersionHistory((prev) => prev.filter((_, i) => i !== idx))}
                  className="sm:col-span-1 p-1.5 text-red-500 hover:bg-red-500/10 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-300"
            >
              {t.product.cancel}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            >
              {saving ? t.admin.saving : t.admin.saveProduct}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
