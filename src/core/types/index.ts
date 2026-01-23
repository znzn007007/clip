// src/core/types/index.ts
export type Platform = 'twitter' | 'zhihu' | 'wechat' | 'unknown';

export type BrowserType = 'chrome' | 'edge' | 'auto';

export interface BrowserConfig {
  channel: 'chrome' | 'msedge';
  name: string;
  sessionDir: string;
  cookiesPath: (platform: NodeJS.Platform) => string | null;
}

export interface ClipDoc {
  platform: Platform;
  sourceUrl: string;
  canonicalUrl?: string;
  title: string;
  author?: string;
  publishedAt?: string;
  fetchedAt: string;
  blocks: Block[];
  assets: {
    images: AssetImage[];
  };
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | QuoteBlock
  | CodeBlock
  | ListBlock
  | ImageBlock
  | LinkBlock
  | VideoBlock
  | TweetMetaBlock
  | HashtagBlock;

export interface ParagraphBlock {
  type: 'paragraph';
  content: string;
}

export interface HeadingBlock {
  type: 'heading';
  level: number;
  content: string;
}

export interface QuoteBlock {
  type: 'quote';
  content: string;
  author?: string;
  sourceUrl?: string;
}

export interface CodeBlock {
  type: 'code';
  content: string;
  language?: string;
}

export interface ListBlock {
  type: 'list';
  items: string[];
  ordered: boolean;
}

export interface ImageBlock {
  type: 'image';
  url: string;
  alt: string;
}

export interface LinkBlock {
  type: 'link';
  url: string;
  title: string;
}

export interface VideoBlock {
  type: 'video';
  url: string;
  thumbnail?: string;
}

export interface TweetMetaBlock {
  type: 'tweet_meta';
  likes: number;
  retweets: number;
  replies: number;
  views: number;
}

export interface HashtagBlock {
  type: 'hashtag';
  tag: string;
  url: string;
}

export interface AssetImage {
  url: string;
  alt: string;
  filenameHint?: string;
}
