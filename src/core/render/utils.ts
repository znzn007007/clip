// src/core/render/utils.ts
import type { Platform } from '../types/index.js';

export function detectPlatform(url: URL): Platform {
  const hostname = url.hostname.toLowerCase();

  if (hostname.includes('x.com') || hostname.includes('twitter.com')) {
    return 'twitter';
  }
  if (hostname.includes('zhihu.com')) {
    return 'zhihu';
  }
  if (hostname.includes('mp.weixin.qq.com')) {
    return 'wechat';
  }

  return 'unknown';
}

export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeUrl(urlString: string): string {
  const url = new URL(urlString);
  url.hash = '';
  return url.toString();
}
