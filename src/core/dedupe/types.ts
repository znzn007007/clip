// src/core/dedupe/types.ts
export interface ArchiveRecord {
  firstSeen: string;      // ISO 8601 timestamp
  lastUpdated: string;    // ISO 8601 timestamp
  path: string;           // 相对路径，如 "./twitter/2026/01/19/abc/"
  platform: string;       // 'twitter' | 'zhihu' | 'wechat'
}

export interface ArchiveDatabase {
  archived: Record<string, ArchiveRecord>;
  version: number;
}

export interface DedupeCheckResult {
  isArchived: boolean;
  record?: ArchiveRecord;
}
