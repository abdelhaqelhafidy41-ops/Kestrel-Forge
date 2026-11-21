export type ProductCategory = 'games' | 'android' | 'windows' | 'web' | 'other';

export interface SystemRequirements {
  os?: string;
  processor?: string;
  memory?: string;
  storage?: string;
  graphics?: string;
  network?: string;
}

export interface DownloadAsset {
  id: string;
  name: string;
  format: string;
  sizeBytes: number;
  url: string;
  version: string;
  releaseDate: string;
  source: 'direct' | 'github';
  platform?: string;
  downloadCount?: number;
  sha256?: string;
}

export interface VersionHistoryEntry {
  version: string;
  date: string;
  notes: string;
  notesAr?: string;
  tag?: string;
}

export interface GitHubAsset {
  id: number;
  name: string;
  size: number;
  downloadUrl: string;
  contentType: string;
  downloadCount: number;
  format: string;
  platformHint?: string;
}

export interface GitHubRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
  prerelease: boolean;
  assets: GitHubAsset[];
}

export interface GitHubCacheSummary {
  repoFullName: string;
  latestTag: string | null;
  releaseName: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
  htmlUrl: string | null;
  assets: GitHubAsset[];
  allReleases: GitHubRelease[];
  fetchedAt: string | null;
  fetchStatus: 'ok' | 'not_found' | 'rate_limited' | 'error' | 'unconfigured';
  errorMessage?: string | null;
}

export interface AssetFilterConfig {
  extensions?: string[];
  pattern?: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  tagline: string;
  taglineAr: string;
  category: ProductCategory;
  description: string;
  descriptionAr: string;
  features: string[];
  featuresAr: string[];
  icon: string;
  coverImage: string;
  screenshots: string[];
  githubRepo: string;
  githubOwner: string;
  githubRepoName: string;
  githubReleases: string;
  githubApiUrl: string;
  liveUrl: string | null;
  featured: boolean;
  published: boolean;
  releaseSync: boolean;
  managedBy: 'config' | 'dashboard';
  isSampleDemo: boolean;
  assetFilter: AssetFilterConfig;
  platforms: string[];
  technologies: string[];
  systemRequirements: SystemRequirements;
  version: string;
  releaseDate: string;
  updatedAt: string;
  developer: string;
  license: string;
  manualDownloads: DownloadAsset[];
  versionHistory: VersionHistoryEntry[];
  totalDownloads: number;
  directDownloads: number;
  githubClicks: number;
  webLaunches: number;
  githubCache?: GitHubCacheSummary | null;
}

export interface CategoryInfo {
  id: ProductCategory;
  slug: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  productCount?: number;
}

export interface PlatformStats {
  totalProducts: number;
  totalGames: number;
  totalApplications: number;
  totalAndroid: number;
  totalWindows: number;
  totalWeb: number;
  totalDownloads: number;
  directDownloads: number;
  githubReleaseClicks: number;
  webAppLaunches: number;
}

export interface AnalyticsSummary {
  stats: PlatformStats;
  dailySeries: Array<{
    date: string;
    direct: number;
    github: number;
    web: number;
    total: number;
  }>;
  byProduct: Array<{
    productId: string;
    productName: string;
    category: ProductCategory;
    direct: number;
    github: number;
    web: number;
    total: number;
  }>;
  byPlatform: Array<{
    platform: string;
    count: number;
  }>;
  byVersion: Array<{
    version: string;
    count: number;
  }>;
  byFormat: Array<{
    format: string;
    count: number;
  }>;
  recentEvents: Array<{
    id: number;
    productId: string;
    productName: string;
    fileName: string;
    fileFormat: string;
    sourceType: 'direct_file' | 'github_release_click' | 'web_app_launch';
    version: string;
    createdAt: string;
  }>;
}

export interface ContactMessage {
  id: number;
  type: 'contact' | 'bug_report';
  productId: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
}
