// src/core/export/json.ts
import type { ExportResult, ExportPaths, ExportStats } from './types.js';
import type { ClipDoc } from '../types/index.js';
import type { DownloadError } from './assets.js';

export function buildExportResult(
  doc: ClipDoc,
  paths: ExportPaths,
  stats: ExportStats,
  assetFailures?: DownloadError[]
): ExportResult {
  // Build diagnostics object - always include with empty warnings array
  const diagnostics: ExportResult['diagnostics'] = {
    warnings: [],
  };

  if (assetFailures && assetFailures.length > 0) {
    diagnostics.assetFailures = assetFailures;
  }

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
    diagnostics,
  };
}

export function formatJsonOutput(result: ExportResult): string {
  return JSON.stringify(result, null, 2);
}
