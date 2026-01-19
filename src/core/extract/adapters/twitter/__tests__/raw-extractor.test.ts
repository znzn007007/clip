import { describe, it, expect } from '@jest/globals';
import { TwitterRawExtractor } from '../raw-extractor.js';

describe('TwitterRawExtractor', () => {
  it('extracts from window state when available', async () => {
    const page = {
      evaluate: jest.fn().mockResolvedValue(JSON.stringify({
        tweet: {
          id: '1',
          text: 'hello',
          user: { name: 'n', screen_name: 'u', profile_image_url_https: 'a' },
          created_at: 'now',
        },
      })),
    } as any;

    const extractor = new TwitterRawExtractor();
    const result = await extractor.extract(page);

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(result?.metadata.extractedFrom).toBe('window_state');
    expect(result?.tweets).toHaveLength(1);
    expect(result?.tweets[0].id).toBe('1');
  });

  it('falls back to script tags when window/initial state are missing', async () => {
    const page = {
      evaluate: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({
          result: {
            tweet_id: '2',
            full_text: 'from script',
          },
        })),
    } as any;

    const extractor = new TwitterRawExtractor();
    const result = await extractor.extract(page);

    expect(page.evaluate).toHaveBeenCalledTimes(3);
    expect(result?.metadata.extractedFrom).toBe('script_tag');
    expect(result?.tweets[0].id).toBe('2');
  });

  it('falls back to initial state when window state throws', async () => {
    const page = {
      evaluate: jest.fn()
        .mockImplementationOnce(() => Promise.reject(new Error('boom')))
        .mockImplementationOnce(() => Promise.resolve(JSON.stringify({
          tweet: {
            id_str: '3',
            full_text: 'from initial',
            user: { name: 'n', screen_name: 'u', profile_image_url_https: 'a' },
            created_at: 'now',
          },
        }))),
    } as any;

    const extractor = new TwitterRawExtractor();
    const result = await extractor.extract(page);

    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(result?.metadata.extractedFrom).toBe('window_state');
    expect(result?.tweets[0].id).toBe('3');
  });

  it('returns undefined when state JSON is invalid', async () => {
    const page = {
      evaluate: jest.fn()
        .mockImplementationOnce(() => Promise.resolve('{invalid json'))
        .mockImplementationOnce(() => Promise.resolve(null))
        .mockImplementationOnce(() => Promise.resolve(null)),
    } as any;

    const extractor = new TwitterRawExtractor();
    const result = await extractor.extract(page);

    expect(result).toBeUndefined();
  });

  it('extracts media, hashtags, and urls from raw state', async () => {
    const page = {
      evaluate: jest.fn(() => Promise.resolve(JSON.stringify({
        tweet: {
          id: '4',
          text: 'media tweet',
          user: { name: 'n', screen_name: 'u', profile_image_url_https: 'a' },
          created_at: 'now',
          entities: {
            hashtags: [{ text: 'tag' }],
            urls: [{ url: 'http:example.com', display_url: 'example.com' }],
            media: [{ type: 'photo', media_url_https: 'https://pbs.twimg.com/media/1.jpg' }],
          },
          extended_entities: {
            media: [
              {
                type: 'video',
                media_url_https: 'https://pbs.twimg.com/media/video.jpg',
                video_info: { variants: [{ url: 'https://video.twimg.com/video.mp4' }] },
              },
            ],
          },
        },
      }))),
    } as any;

    const extractor = new TwitterRawExtractor();
    const result = await extractor.extract(page);

    expect(result?.tweets).toHaveLength(1);
    expect(result?.tweets[0].hashtags).toEqual(['tag']);
    expect(result?.tweets[0].urls).toEqual([{ url: 'http:example.com', displayUrl: 'example.com' }]);
    expect(result?.tweets[0].media).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'image', url: 'https://pbs.twimg.com/media/1.jpg' }),
        expect.objectContaining({ type: 'video', url: 'https://pbs.twimg.com/media/video.jpg' }),
      ])
    );
  });

  it('returns undefined when no sources provide tweets', async () => {
    const page = {
      evaluate: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
    } as any;

    const extractor = new TwitterRawExtractor();
    const result = await extractor.extract(page);

    expect(result).toBeUndefined();
  });
});
