// src/core/render/types.ts
import type { Platform } from '../types/index.js';

export interface RenderedPage {
  url: string;
  canonicalUrl?: string;
  title?: string;
  html: string;
  platform: Platform;
  screenshotPath?: string;
  debugHtmlPath?: string;
}

export interface RenderOptions {
  timeout?: number;
  waitForSelector?: string;
  debug?: boolean;
  maxScrolls?: number;
}
