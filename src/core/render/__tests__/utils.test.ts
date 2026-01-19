import { describe, it, expect } from '@jest/globals';
import { detectPlatform, isValidUrl, normalizeUrl } from '../utils.js';

describe('render utils', () => {
  describe('detectPlatform', () => {
    it('detects twitter/x', () => {
      expect(detectPlatform(new URL('https://x.com/user/status/1'))).toBe('twitter');
      expect(detectPlatform(new URL('https://twitter.com/user/status/1'))).toBe('twitter');
    });

    it('detects zhihu', () => {
      expect(detectPlatform(new URL('https://www.zhihu.com/question/1'))).toBe('zhihu');
    });

    it('detects wechat', () => {
      expect(detectPlatform(new URL('https://mp.weixin.qq.com/s/abc'))).toBe('wechat');
    });

    it('returns unknown for other hosts', () => {
      expect(detectPlatform(new URL('https://example.com'))).toBe('unknown');
    });
  });

  describe('isValidUrl', () => {
    it('accepts http/https', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://example.com')).toBe(true);
    });

    it('rejects invalid or unsupported schemes', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('not-a-url')).toBe(false);
    });
  });

  describe('normalizeUrl', () => {
    it('removes hash fragments', () => {
      expect(normalizeUrl('https://example.com/path#section')).toBe('https://example.com/path');
    });
  });
});
