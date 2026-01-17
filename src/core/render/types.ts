// src/core/render/types.ts
import type { Platform } from '../types/index.js';
import type { Page } from 'playwright';

export interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title?: string;
  html: string;
  platform: Platform;
  rawData?: string;
  screenshotPath?: string;
  debugHtmlPath?: string;
  debugDataPath?: string;  // Add debug data JSON path
  page?: Page;  // Add page reference for advanced extraction
}

export interface RenderOptions {
  timeout?: number;
  waitForSelector?: string;
  debug?: boolean;
  maxScrolls?: number;
}
