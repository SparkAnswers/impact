import { expect, test } from './fixtures';

const DASHBOARDS = [
  { uid: 'impact-showcase' },
  { uid: 'impact-flow' },
  { uid: 'impact-gauge' },
  { uid: 'impact-river' },
  { uid: 'impact-bars' },
];

test('gallery page lists the four panels', async ({ gotoPage, page }) => {
  await gotoPage();
  for (const name of ['Flow Designer', 'Power Gauge', 'Flow River', 'Status Bars']) {
    await expect(page.getByText(`Impact ${name}`)).toBeVisible();
  }
});

for (const d of DASHBOARDS) {
  test(`demo dashboard ${d.uid} renders without errors`, async ({ gotoDashboardPage, page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoDashboardPage({ uid: d.uid });
    await expect(page.locator('[data-viz-panel-key]').first()).toBeVisible();
    const rendered = page.locator(
      '[data-viz-panel-key] canvas, [data-viz-panel-key] table, [data-viz-panel-key] svg:not([aria-hidden])'
    );
    await expect(rendered.first()).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
}
