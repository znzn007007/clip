/**
 * Unified raw data format from all extraction sources
 */
export interface TwitterRawData {
  tweets: RawTweet[];
  metadata: RawDataMetadata;
}

export interface RawDataMetadata {
  extractedFrom: 'window_state' | 'script_tag' | 'dom_extraction';
  timestamp: string;
  sourceDescription?: string;
}

export interface RawTweet {
  id: string;
  text?: string;
  author?: {
    name?: string;
    screenName?: string;
    avatarUrl?: string;
  };
  createdAt?: string;
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
    views?: number;
  };
  media?: RawMedia[];
  hashtags?: string[];
  urls?: Array<{ url: string; displayUrl: string }>;
  quotedTweet?: RawTweet;
}

export interface RawMedia {
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  alt?: string;
}
