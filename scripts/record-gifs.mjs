// Records short clips of the demo dashboards for the README GIFs. Writes .webm files to ./imgs/video and
// prints the offset (seconds) at which each panel became visible, for trimming with ffmpeg, e.g.:
//   ffmpeg -ss <offset> -i imgs/video/river.webm -t 5 -vf "fps=12,scale=800:-1" imgs/river.gif
// Usage: node scripts/record-gifs.mjs [baseUrl]
import { chromium } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const outDir = 'imgs/video';
fs.rmSync(outDir, { recursive: true, force: true });
const browser = await chromium.launch();

async function record(name, url, size, readySelector, action) {
  const ctx = await browser.newContext({ viewport: size, recordVideo: { dir: outDir, size } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator(readySelector).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const offset = (Date.now() - t0) / 1000;
  if (action) await action(page);
  await page.waitForTimeout(5000);
  const video = page.video();
  await ctx.close();
  const path = await video.path();
  fs.renameSync(path, `${outDir}/${name}.webm`);
  console.log(`${name}: visible after ${offset.toFixed(1)}s -> ${outDir}/${name}.webm`);
}

await record('river', `${base}/d/impact-river?kiosk&viewPanel=panel-1`, { width: 1100, height: 560 }, 'canvas');
await record('flow-design-mode', `${base}/d/impact-flow?kiosk&viewPanel=panel-5`, { width: 1100, height: 620 }, 'text=DESIGN MODE', async (page) => {
  const box = await page.getByText('Generator', { exact: true }).first().boundingBox();
  if (!box) return;
  const sx = box.x + box.width / 2;
  const sy = box.y + box.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(sx + i * 5, sy + i * 1.5);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
});
await browser.close();
