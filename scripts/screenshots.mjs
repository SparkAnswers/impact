// Captures README screenshots from a running stack (`make up` / `docker compose up`). Writes to ./imgs.
// Usage: node scripts/screenshots.mjs [baseUrl]   (default http://localhost:3000)
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const shots = [
  { uid: 'impact-showcase', file: 'showcase.png', height: 1500 },
  { uid: 'impact-flow', file: 'flow-dashboard.png', height: 1200 },
  { uid: 'impact-gauge', file: 'gauge-dashboard.png', height: 1000 },
  { uid: 'impact-river', file: 'river-dashboard.png', height: 1450 },
  { uid: 'impact-bars', file: 'bars-dashboard.png', height: 1280 },
];
fs.mkdirSync('imgs', { recursive: true });
const browser = await chromium.launch();
for (const s of shots) {
  const page = await browser.newPage({ viewport: { width: 1600, height: s.height }, deviceScaleFactor: 1 });
  await page.goto(`${base}/d/${s.uid}?kiosk`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `imgs/${s.file}` });
  await page.close();
  console.log('wrote imgs/' + s.file);
}
await browser.close();
