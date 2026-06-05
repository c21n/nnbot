/**
 * GitHub Service
 *
 * Handles GitHub OAuth and GitHub Releases API integration.
 */

import axios, { AxiosError } from 'axios';
import type { IGitHubService, GitHubTokenResponse, GitHubUser } from '../types/index.js';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('GitHub');

/**
 * GitHub service implementation
 */
export class GitHubService implements IGitHubService {
  private config = getConfig().github;

  /**
   * Get GitHub OAuth URL
   */
  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackUrl,
      scope: 'read:user user:email',
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange OAuth code for access token
   */
  async exchangeCode(code: string): Promise<GitHubTokenResponse> {
    try {
      const response = await axios.post<GitHubTokenResponse>(
        'https://github.com/login/oauth/access_token',
        {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
        },
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      return response.data;
    } catch (err) {
      const error = err as AxiosError;
      logger.error('Failed to exchange OAuth code', error.message);
      throw new Error('Failed to exchange OAuth code');
    }
  }

  /**
   * Get GitHub user info
   */
  async getUserInfo(accessToken: string): Promise<GitHubUser> {
    try {
      const response = await axios.get<GitHubUser>('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      return response.data;
    } catch (err) {
      const error = err as AxiosError;
      logger.error('Failed to get GitHub user info', error.message);
      throw new Error('Failed to get GitHub user info');
    }
  }

  /**
   * Create a GitHub Release and upload plugin file
   */
  async createRelease(
    owner: string,
    repo: string,
    tag: string,
    name: string,
    body: string,
    file: Buffer,
    fileName: string
  ): Promise<{ url: string; downloadUrl: string }> {
    const config = getConfig();
    const token = config.github.clientSecret; // Should use a separate token for releases

    try {
      // Create release
      const releaseResponse = await axios.post(
        `https://api.github.com/repos/${owner}/${repo}/releases`,
        {
          tag_name: tag,
          name,
          body,
          draft: false,
          prerelease: false,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      const release = releaseResponse.data;
      const uploadUrl = release.upload_url.replace('{?name,label}', '');

      // Upload asset
      const assetResponse = await axios.post(
        `${uploadUrl}?name=${encodeURIComponent(fileName)}`,
        file,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/javascript',
            Accept: 'application/vnd.github.v3+json',
          },
          maxContentLength: 10 * 1024 * 1024, // 10MB
        }
      );

      return {
        url: release.html_url,
        downloadUrl: assetResponse.data.browser_download_url,
      };
    } catch (err) {
      const error = err as AxiosError;
      logger.error('Failed to create GitHub release', error.message);
      throw new Error('Failed to create GitHub release');
    }
  }

  /**
   * Get release download URL
   */
  async getReleaseDownloadUrl(
    owner: string,
    repo: string,
    tag: string,
    fileName: string
  ): Promise<string | null> {
    try {
      const response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      const release = response.data;
      const asset = release.assets?.find(
        (a: { name: string }) => a.name === fileName
      );

      return asset?.browser_download_url || null;
    } catch (err) {
      const error = err as AxiosError;
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Failed to get release download URL', error.message);
      throw new Error('Failed to get release download URL');
    }
  }
}

/**
 * Singleton GitHub service instance
 */
let githubInstance: GitHubService | null = null;

/**
 * Get GitHub service instance
 */
export function getGitHubService(): GitHubService {
  if (!githubInstance) {
    githubInstance = new GitHubService();
  }
  return githubInstance;
}
