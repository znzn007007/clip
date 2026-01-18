// src/core/export/path.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import type { ClipDoc } from '../types/index.js';

export async function generateOutputPaths(
  doc: ClipDoc,
  outputDir: string
): Promise<{ markdownPath: string; assetsDir: string }> {
  const date = new Date(doc.fetchedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Generate slug from title
  const slug = generateSlug(doc.title);

  const platformDir = path.join(outputDir, doc.platform);
  const dateDir = path.join(platformDir, String(year), month + day);
  const contentDir = path.join(dateDir, slug);
  const assetsDir = path.join(contentDir, 'assets');
  const markdownPath = path.join(contentDir, 'content.md');

  // Create directories
  await fs.mkdir(assetsDir, { recursive: true });

  return { markdownPath, assetsDir };
}

function generateSlug(title: string): string {
  // Remove invalid characters and generate short hash
  const cleaned = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Add short hash for uniqueness
  const hash = Buffer.from(title).toString('base64').substring(0, 8);
  return `${cleaned}-${hash}`;
}

export function buildFrontMatter(doc: ClipDoc): string {
  const canonicalUrl = doc.canonicalUrl || doc.sourceUrl;
  const frontMatter: Record<string, unknown> = {
    title: doc.title,
    source_url: doc.sourceUrl,
    canonical_url: canonicalUrl,
    platform: doc.platform,
    fetched_at: doc.fetchedAt,
    tags: [],
  };

  if (doc.author) {
    frontMatter.author = doc.author;
  }
  if (doc.publishedAt) {
    frontMatter.published_at = doc.publishedAt;
  }

  const yaml = Object.entries(frontMatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}: []`;
      }
      if (typeof value === 'string') {
        return `${key}: "${value}"`;
      }
      return `${key}: ${value}`;
    })
    .join('\n');

  return `---\n${yaml}\n---\n`;
}
