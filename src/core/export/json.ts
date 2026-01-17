// src/core/export/json.ts
import type { ExportResult, ExportPaths, ExportStats } from './types.js';
import type { ClipDoc } from '../types/index.js';

export function buildExportResult(
  doc: ClipDoc,
  paths: ExportPaths,
  stats: ExportStats
): ExportResult {
  return {
    status: 'success',
    platform: doc.platform,
    canonicalUrl: doc.canonicalUrl,
    title: doc.title,
    paths,
    meta: {
      author: doc.author,
      publishedAt: doc.publishedAt,
      fetchedAt: doc.fetchedAt,
    },
    stats,
    diagnostics: {
      warnings: [],
    },
  };
}

export function formatJsonOutput(result: ExportResult): string {
  return JSON.stringify(result, null, 2);
}
