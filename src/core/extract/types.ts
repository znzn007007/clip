// src/core/extract/types.ts
import type { ClipDoc } from '../types/index.js';
import type { RenderedPage } from '../render/types.js';

export interface ExtractResult {
  doc: ClipDoc;
  warnings: string[];
}

export interface Adapter {
  readonly platform: string;
  readonly domains: string[];

  canHandle(url: string): boolean;
  extract(page: RenderedPage): Promise<ExtractResult>;
}

export interface AdapterContext {
  debug?: boolean;
  maxThreadDepth?: number;
}
