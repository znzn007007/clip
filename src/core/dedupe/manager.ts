// src/core/dedupe/manager.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import type { ClipDoc } from '../types/index.js';
import type { ArchiveRecord, ArchiveDatabase, DedupeCheckResult } from './types.js';
import { getDedupeKey, getDedupeKeyFromUrl } from './strategy.js';

export class DedupeManager {
  private archivePath: string;
  private database: ArchiveDatabase;
  private loaded: boolean = false;

  constructor(outputDir: string) {
    this.archivePath = path.join(outputDir, '.archived.json');
    this.database = {
      version: 1,
      archived: {},
    };
  }

  async load(): Promise<void> {
    if (this.loaded) return;

    if (!existsSync(this.archivePath)) {
      // 首次运行，创建空数据库
      this.loaded = true;
      return;
    }

    try {
      const content = await fs.readFile(this.archivePath, 'utf-8');
      this.database = JSON.parse(content) as ArchiveDatabase;
      this.loaded = true;
    } catch (error) {
      // 文件损坏，备份并重建
      await this.backupAndRecover();
      this.loaded = true;
    }
  }

  async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.archivePath), { recursive: true });
    await fs.writeFile(this.archivePath, JSON.stringify(this.database, null, 2));
  }

  getDatabase(): ArchiveDatabase {
    return this.database;
  }

  async checkByUrl(url: string): Promise<DedupeCheckResult> {
    await this.ensureLoaded();

    const key = getDedupeKeyFromUrl(url);
    const record = this.database.archived[key];

    if (!record) {
      return { isArchived: false };
    }

    return { isArchived: true, record };
  }

  async checkByDoc(doc: ClipDoc): Promise<DedupeCheckResult> {
    await this.ensureLoaded();

    const key = getDedupeKey(doc);
    const record = this.database.archived[key];

    if (!record) {
      return { isArchived: false };
    }

    return { isArchived: true, record };
  }

  async addRecord(doc: ClipDoc, outputPath: string): Promise<void> {
    await this.ensureLoaded();

    const key = getDedupeKey(doc);
    const now = new Date().toISOString();

    const record: ArchiveRecord = {
      firstSeen: now,
      lastUpdated: now,
      path: outputPath,
      platform: doc.platform,
    };

    this.database.archived[key] = record;
    await this.save();
  }

  async addRecordByUrl(url: string, record: ArchiveRecord): Promise<void> {
    await this.ensureLoaded();

    const key = getDedupeKeyFromUrl(url);
    this.database.archived[key] = record;
    await this.save();
  }

  async removeRecord(url: string): Promise<void> {
    await this.ensureLoaded();

    const key = getDedupeKeyFromUrl(url);
    delete this.database.archived[key];
    await this.save();
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
  }

  private async backupAndRecover(): Promise<void> {
    const backupPath = this.archivePath + '.bak';

    try {
      await fs.rename(this.archivePath, backupPath);
    } catch {
      // 忽略备份失败
    }

    this.database = {
      version: 1,
      archived: {},
    };
  }
}
