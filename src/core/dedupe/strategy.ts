// src/core/dedupe/strategy.ts
import type { ClipDoc } from '../types/index.js';
import { normalizeUrl } from '../render/utils.js';

export function getDedupeKey(doc: ClipDoc): string {
  // 优先级：canonicalUrl > normalized(sourceUrl)
  return doc.canonicalUrl || normalizeUrl(doc.sourceUrl);
}

export function getDedupeKeyFromUrl(url: string): string {
  return normalizeUrl(url);
}
