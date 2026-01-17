// src/core/config/constants.ts
export const DEFAULT_TIMEOUT = 30000; // 30 seconds
export const DEFAULT_MAX_SCROLLS = 50;
export const RETRY_COUNTS: Record<string, number> = {
  network_error: 0,
  timeout: 0,
  rate_limited: 0,
  asset_download_failed: 0,
};

export const BROWSER_CHANNELS = ['chrome', 'msedge', 'chromium'] as const;
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
