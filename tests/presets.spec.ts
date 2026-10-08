import { expect, test } from './fixtures';

// Quick start presets: the editor writes a request, the panel applies it (options + field defaults).
test('gauge preset rewrites the panel from the editor', async ({ gotoPanelEditPage, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await gotoPanelEditPage({ dashboard: { uid: 'impact-showcase' }, id: '2' });
  await expect(page.getByRole('img', { name: /Gauge .*kW/ })).toBeVisible({ timeout: 15000 });

  const preset = page.getByRole('button', { name: /300° arc with thresholds/ });
  await preset.scrollIntoViewIfNeeded();
  await preset.click();

  await expect(preset).toHaveAttribute('aria-current', 'true');
  // The preset switches the unit to percent and the arc to thresholds: the gauge label changes with it.
  await expect(page.getByRole('img', { name: /Gauge .*%/ })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('bars preset keeps the table rendering', async ({ gotoPanelEditPage, page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await gotoPanelEditPage({ dashboard: { uid: 'impact-showcase' }, id: '5' });
  const table = page.locator('[data-viz-panel-key] table').first();
  await expect(table).toBeVisible({ timeout: 15000 });
  await expect(table.getByRole('checkbox').first()).toBeVisible();

  const preset = page.getByRole('button', { name: /Compact gradient/ });
  await preset.scrollIntoViewIfNeeded();
  await preset.click();

  await expect(preset).toHaveAttribute('aria-current', 'true');
  // Compact gradient turns the checkboxes off while the rows stay.
  await expect(table.getByRole('checkbox')).toHaveCount(0);
  await expect(table.getByRole('row').nth(1)).toBeVisible();
  expect(errors).toEqual([]);
});
