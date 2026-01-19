// src/core/dedupe/__tests__/strategy.test.ts
import { describe, it, expect } from '@jest/globals';
import { getDedupeKey } from '../strategy.js';
import type { ClipDoc } from '../../types/index.js';

describe('getDedupeKey', () => {
  it('优先使用 canonicalUrl', () => {
    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://twitter.com/user/status/123',
      canonicalUrl: 'https://x.com/user/status/123',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };
    expect(getDedupeKey(doc)).toBe('https://x.com/user/status/123');
  });

  it('当没有 canonicalUrl 时使用 normalized sourceUrl', () => {
    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/user/status/123#hash',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };
    expect(getDedupeKey(doc)).toBe('https://x.com/user/status/123');
  });

  it('移除 URL hash', () => {
    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/user/status/123#m123',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };
    expect(getDedupeKey(doc)).toBe('https://x.com/user/status/123');
  });
});
