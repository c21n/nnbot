/**
 * Marketplace Server Type Definitions
 *
 * All shared types for the plugin marketplace API server.
 */

// ============ Database Models ============

/**
 * User model (database)
 */
export interface User {
  readonly id: number;
  readonly github_id: number;
  readonly username: string;
  readonly display_name: string | null;
  readonly email: string | null;
  readonly avatar_url: string | null;
  readonly bio: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Plugin model (database)
 */
export interface Plugin {
  readonly id: number;
  readonly plugin_id: string;  // 格式: username/plugin-name
  readonly name: string;
  readonly display_name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly tags: string[];
  readonly author_id: number;
  readonly license: string | null;
  readonly homepage: string | null;
  readonly repository: string | null;
  readonly icon: string | null;
  readonly downloads: number;
  readonly rating: number;
  readonly rating_count: number;
  readonly latest_version: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Plugin version model (database)
 */
export interface PluginVersion {
  readonly id: number;
  readonly plugin_id: number;
  readonly version: string;
  readonly changelog: string | null;
  readonly file_url: string | null;
  readonly checksum: string | null;
  readonly dependencies: PluginDependency[] | null;
  readonly permissions: PluginPermission[] | null;
  readonly created_at: Date;
}

/**
 * Download record model (database)
 */
export interface DownloadRecord {
  readonly id: number;
  readonly plugin_id: number;
  readonly version: string | null;
  readonly user_id: number | null;
  readonly ip_address: string | null;
  readonly user_agent: string | null;
  readonly created_at: Date;
}

// ============ API Types ============

/**
 * Plugin metadata (API response)
 */
export interface PluginMetadata {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly author: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly downloads: number;
  readonly rating: number;
  readonly ratingCount: number;
  readonly updatedAt: string;
  readonly icon?: string;
  readonly homepage?: string;
}

/**
 * Plugin detail (API response)
 */
export interface PluginDetail extends PluginMetadata {
  readonly readme: string;
  readonly changelog: string;
  readonly versions: readonly PluginVersionInfo[];
  readonly dependencies: readonly PluginDependency[];
  readonly permissions: readonly PluginPermission[];
  readonly license: string;
  readonly repository?: string;
}

/**
 * Plugin version info (API response)
 */
export interface PluginVersionInfo {
  readonly version: string;
  readonly releasedAt: string;
  readonly changelog: string;
  readonly downloadUrl: string;
  readonly checksum: string;
}

/**
 * Plugin dependency
 */
export interface PluginDependency {
  readonly pluginId: string;
  readonly versionRange: string;
  readonly optional: boolean;
}

/**
 * Plugin permission
 */
export interface PluginPermission {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
}

/**
 * Plugin filters for search
 */
export interface PluginFilters {
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly minRating?: number;
  readonly sortBy?: 'downloads' | 'rating' | 'updated' | 'created';
  readonly sortOrder?: 'asc' | 'desc';
  readonly page?: number;
  readonly limit?: number;
}

/**
 * Create plugin request
 */
export interface CreatePluginRequest {
  readonly name: string;
  readonly displayName: string;
  readonly description?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: string;
  readonly icon?: string;
}

/**
 * Update plugin request
 */
export interface UpdatePluginRequest {
  readonly displayName?: string;
  readonly description?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: string;
  readonly icon?: string;
}

/**
 * Publish version request
 */
export interface PublishVersionRequest {
  readonly version: string;
  readonly changelog?: string;
  readonly file: Buffer;
  readonly checksum: string;
  readonly dependencies?: readonly PluginDependency[];
  readonly permissions?: readonly PluginPermission[];
}

// ============ Auth Types ============

/**
 * GitHub OAuth token response
 */
export interface GitHubTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly scope: string;
}

/**
 * GitHub user info
 */
export interface GitHubUser {
  readonly id: number;
  readonly login: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly avatar_url: string;
  readonly bio: string | null;
}

/**
 * JWT payload
 */
export interface JWTPayload {
  readonly userId: number;
  readonly username: string;
  readonly githubId: number;
  readonly iat?: number;
  readonly exp?: number;
}

/**
 * Auth response
 */
export interface AuthResponse {
  readonly token: string;
  readonly user: {
    readonly id: number;
    readonly username: string;
    readonly displayName: string | null;
    readonly avatarUrl: string | null;
  };
}

// ============ Service Types ============

/**
 * Plugin service interface
 */
export interface IPluginService {
  /**
   * Search plugins
   */
  searchPlugins(query: string, filters?: PluginFilters): Promise<PluginMetadata[]>;

  /**
   * Get plugin detail
   */
  getPluginDetail(pluginId: string): Promise<PluginDetail | null>;

  /**
   * Create plugin
   */
  createPlugin(authorId: number, data: CreatePluginRequest): Promise<PluginMetadata>;

  /**
   * Update plugin
   */
  updatePlugin(pluginId: string, userId: number, data: UpdatePluginRequest): Promise<PluginMetadata>;

  /**
   * Delete plugin
   */
  deletePlugin(pluginId: string, userId: number): Promise<void>;

  /**
   * Publish version
   */
  publishVersion(pluginId: string, userId: number, data: PublishVersionRequest): Promise<PluginVersionInfo>;

  /**
   * Get versions
   */
  getVersions(pluginId: string): Promise<PluginVersionInfo[]>;

  /**
   * Get download URL
   */
  getDownloadUrl(pluginId: string, version: string): Promise<string | null>;

  /**
   * Record download
   */
  recordDownload(pluginId: string, version: string, userId?: number, ipAddress?: string, userAgent?: string): Promise<void>;

  /**
   * Get popular plugins
   */
  getPopularPlugins(limit?: number): Promise<PluginMetadata[]>;

  /**
   * Get recommended plugins
   */
  getRecommendedPlugins(limit?: number): Promise<PluginMetadata[]>;
}

/**
 * GitHub service interface
 */
export interface IGitHubService {
  /**
   * Get OAuth URL
   */
  getOAuthUrl(state: string): string;

  /**
   * Exchange code for token
   */
  exchangeCode(code: string): Promise<GitHubTokenResponse>;

  /**
   * Get user info
   */
  getUserInfo(accessToken: string): Promise<GitHubUser>;

  /**
   * Create release
   */
  createRelease(
    owner: string,
    repo: string,
    tag: string,
    name: string,
    body: string,
    file: Buffer,
    fileName: string
  ): Promise<{ url: string; downloadUrl: string }>;
}

/**
 * Scanner service interface
 */
export interface IScannerService {
  /**
   * Scan plugin file
   */
  scanPlugin(content: string): Promise<ScanResult>;
}

/**
 * Scan result
 */
export interface ScanResult {
  readonly passed: boolean;
  readonly warnings: readonly ScanWarning[];
  readonly errors: readonly ScanError[];
}

/**
 * Scan warning
 */
export interface ScanWarning {
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly rule: string;
}

/**
 * Scan error
 */
export interface ScanError {
  readonly line: number;
  readonly column: number;
  readonly message: string;
  readonly rule: string;
}

// ============ Config Types ============

/**
 * Server configuration
 */
export interface ServerConfig {
  readonly host: string;
  readonly port: number;
  readonly cors: {
    readonly origin: string | string[];
    readonly credentials: boolean;
  };
}

/**
 * Database configuration
 */
export interface DatabaseConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password: string;
  readonly ssl: boolean;
}

/**
 * GitHub configuration
 */
export interface GitHubConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly callbackUrl: string;
  readonly pluginRepoOwner: string;
  readonly pluginRepoName: string;
}

/**
 * JWT configuration
 */
export interface JWTConfig {
  readonly secret: string;
  readonly expiresIn: string;
}

/**
 * Root configuration
 */
export interface Config {
  readonly server: ServerConfig;
  readonly database: DatabaseConfig;
  readonly github: GitHubConfig;
  readonly jwt: JWTConfig;
}

// ============ API Response Types ============

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly meta?: {
    readonly total: number;
    readonly page: number;
    readonly limit: number;
  };
}

/**
 * Pagination meta
 */
export interface PaginationMeta {
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
}
