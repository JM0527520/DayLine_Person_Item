import { test, expect, type Locator } from '@playwright/test';

const thumb = (element: Locator) => element.evaluate(node => getComputedStyle(node).getPropertyValue('--scroll-thumb-color').trim());
const hidden = (element: Locator) => expect.poll(() => thumb(element)).toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
const visible = (element: Locator) => expect.poll(() => thumb(element)).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);

for (const mode of ['浅色', '深色']) {
  test(`${mode}侧栏与页面滚动条滚动时出现，闲置淡出且布局稳定`, async ({ page }) => {
    await page.setViewportSize({ width: 1285, height: 884 });
    await page.clock.setFixedTime(new Date('2026-10-23T09:00:00+08:00'));
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('radio', { name: mode, exact: true }).check();
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '今天', exact: true }).click();
    const root = page.locator('html');
    const sidebar = page.locator('.sidebar-scroll');
    await sidebar.evaluate(node => { node.scrollTop = 0; });
    await page.mouse.move(600, 300);
    await hidden(root); await hidden(sidebar);
    const before = await page.locator('.today-columns').boundingBox();
    await page.screenshot({ path: `output/playwright/refined-${mode}-idle.png`, fullPage: false, animations: 'disabled' });

    await page.mouse.wheel(0, 220);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    await visible(root); await hidden(sidebar);
    await page.screenshot({ path: `output/playwright/refined-${mode}-scrolling.png`, animations: 'disabled' });
    await hidden(root);
    const after = await page.locator('.today-columns').boundingBox();
    expect(after!.x).toBe(before!.x); expect(after!.width).toBe(before!.width);

    // Visiting settings can scroll its sidebar button into view; start this check at the top.
    await sidebar.evaluate(node => { node.scrollTop = 0; });
    await hidden(sidebar);
    await sidebar.hover();
    await page.mouse.wheel(0, 180);
    await expect.poll(() => sidebar.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await visible(sidebar); await hidden(root);
    await hidden(sidebar);
    await page.mouse.move(1283, 300);
    await visible(root);
    await page.mouse.move(600, 300); await hidden(root);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('键盘和窄屏表单仍能滚动，高对比度模式保留系统滚动条', async ({ page }) => {
  await page.setViewportSize({ width: 1285, height: 700 });
  await page.goto('/?demo=1');
  await page.getByRole('heading', { name: '今天', exact: true }).click();
  await page.keyboard.press('End');
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await visible(page.locator('html'));
  await hidden(page.locator('html'));
  await page.setViewportSize({ width: 390, height: 650 });
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.hover(); await page.mouse.wheel(0, 300);
  await expect.poll(() => dialog.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await visible(dialog); await hidden(dialog);
  await page.getByLabel('任务名称', { exact: true }).fill('滚动后仍可保存');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('html')).toHaveCSS('scrollbar-color', 'auto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
