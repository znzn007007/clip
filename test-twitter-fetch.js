import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

async function testTwitterFetch() {
  const browser = await chromium.launch({
    headless: true,
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  });

  const page = await context.newPage();

  try {
    console.log('Navigating to Twitter...');
    await page.goto('https://x.com/thedankoe/status/2010042119121957316', {
      waitUntil: 'commit',
      timeout: 30000,
    });

    // Wait for tweet element
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 }).catch(() => {
      console.log('Tweet element not found with selector');
    });

    // Scroll a bit
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await page.waitForTimeout(2000);

    // Get HTML
    const html = await page.content();
    console.log(`HTML length: ${html.length}`);

    // Save HTML
    const outputPath = path.join(process.cwd(), 'test-twitter.html');
    await fs.writeFile(outputPath, html, 'utf-8');
    console.log(`HTML saved to: ${outputPath}`);

    // Check for tweet elements
    const tweetCount = await page.evaluate(() => {
      return document.querySelectorAll('article[data-testid="tweet"]').length;
    });
    console.log(`Tweet elements found: ${tweetCount}`);

    // Try other selectors
    const selectors = [
      'article[data-testid="tweet"]',
      '[data-testid="tweet"]',
      '[data-testid="tweetText"]',
      'article',
    ];

    for (const selector of selectors) {
      const count = await page.evaluate((sel) => {
        return document.querySelectorAll(sel).length;
      }, selector);
      console.log(`Selector "${selector}": ${count} elements`);
    }

    // Check rawData extraction
    const rawData = await page.evaluate(() => {
      const state = (window as any).__STATE__;
      if (state) return JSON.stringify(state).substring(0, 200);
      return 'No __STATE__ found';
    });
    console.log(`RawData check: ${rawData}`);

  } finally {
    await browser.close();
  }
}

testTwitterFetch().catch(console.error);
