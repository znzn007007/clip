// src/core/export/types.ts
import type { ClipDoc } from '../types/index.js';
import type { DownloadError } from './assets.js';

export type ExportFormat = 'md' | 'md+html';

export interface ExportOptions {
  outputDir: string;
  format: ExportFormat;
  downloadAssets: boolean;
  json: boolean;
  cdpEndpoint?: string;  // Chrome DevTools Protocol endpoint for connecting to existing browser
  debug?: boolean;

  // 去重相关
  force?: boolean;      // 强制覆盖已归档内容
  verbose?: boolean;    // 详细输出模式
}

export interface ExportPaths {
  markdownPath: string;
  htmlPath?: string;
  assetsDir: string;
}

export interface ExportStats {
  wordCount: number;
  imageCount: number;
}

export interface ExportResult {
  status: 'success' | 'failed';
  platform: string;
  canonicalUrl?: string;
  title?: string;
  paths?: ExportPaths;
  meta?: {
    author?: string;
    publishedAt?: string;
    fetchedAt: string;
  };
  stats?: ExportStats;
  diagnostics?: {
    warnings?: string[];
    error?: ExportError;
    assetFailures?: DownloadError[];
  };
}

export interface ExportError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  suggestion?: string;
}

export enum ErrorCode {
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  LOGIN_REQUIRED = 'login_required',
  DOM_CHANGED = 'dom_changed',
  EXTRACT_FAILED = 'extract_failed',
  ASSET_DOWNLOAD_FAILED = 'asset_download_failed',
  EXPORT_FAILED = 'export_failed',
  RATE_LIMITED = 'rate_limited',
  INVALID_URL = 'invalid_url',
  UNSUPPORTED_PLATFORM = 'unsupported_platform',
  ALREADY_ARCHIVED = 'already_archived',
  BROWSER_NOT_FOUND = 'BROWSER_NOT_FOUND',
}
