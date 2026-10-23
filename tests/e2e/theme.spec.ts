import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T09:00:00+08:00'));
  await page.goto('/');
  await expect(page.getByText('正在打开工作空间…')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
});

const settings = (page: Page) => page.getByRole('button', { name: '设置', exact: true }).click();
const theme = (page: Page) => page.locator('html');
const navigate = (page: Page, name: string) => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();

test('浅深色的辅助文字与模块标题保持可读对比度', async ({ page }) => {
  await page.goto('/?demo=1');
  for (const mode of ['浅色', '深色']) {
    await settings(page);
    await page.getByRole('radio', { name: mode, exact: true }).check();
    await navigate(page, '今天');
    await expect(page.locator('.task-meta').first()).toBeVisible();
    const measurements = await page.evaluate(() => {
      const rgb = (value: string) => {
        const parts = value.match(/[\d.]+/g)!.map(Number);
        return [parts[0], parts[1], parts[2], parts[3] ?? 1];
      };
      const background = (element: Element | null): number[] => {
        if (!element) return [255, 255, 255, 1];
        const own = rgb(getComputedStyle(element).backgroundColor);
        const underneath = own[3] < 1 ? background(element.parentElement) : own;
        return own.slice(0, 3).map((value, index) => value * own[3] + underneath[index] * (1 - own[3]));
      };
      const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, value, index) => {
        const channel = value / 255;
        return sum + (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
      }, 0);
      const contrast = (a: number[], b: number[]) => {
        const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const text = Array.from(document.querySelectorAll('.task-meta, .workspace .section-title h2')).map(element => ({
        label: element.textContent,
        ratio: contrast(rgb(getComputedStyle(element).color), background(element)),
      }));
      return { text };
    });
    for (const item of measurements.text) expect(item.ratio, `${mode}: ${item.label}`).toBeGreaterThanOrEqual(4.5);
    for (const view of ['未来任务', '工作记录', '设置']) {
      if (view === '设置') await settings(page);
      else await navigate(page, view);
      await expect(page.getByRole('heading', { name: view, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `output/playwright/refined-${mode}-${view}.png`, fullPage: true, animations: 'disabled' });
    }
  }
});

test('默认跟随系统即时切换，固定外观不受系统变化影响且支持键盘选择', async ({ page }) => {
  await settings(page);
  await expect(page.getByRole('radio', { name: '跟随系统', exact: true })).toBeChecked();
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' }); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' }); await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: '浅色', exact: true }).check();
  await page.emulateMedia({ colorScheme: 'dark' }); await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: '浅色', exact: true }).focus();
  await page.getByRole('radio', { name: '浅色', exact: true }).press('ArrowRight');
  await expect(page.getByRole('radio', { name: '深色', exact: true })).toBeChecked();
  await page.emulateMedia({ colorScheme: 'light' }); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: '跟随系统', exact: true }).check(); await expect(theme(page)).toHaveAttribute('data-theme', 'light');
});

test('深色选择刷新后保留，任务仍可编辑完成，示例空间共用外观偏好', async ({ page }) => {
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('深色中继续工作');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await settings(page); await page.getByRole('radio', { name: '深色', exact: true }).check();
  await page.reload(); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await navigate(page, '今天');
  const row = page.getByTestId('task-row').filter({ hasText: '深色中继续工作' });
  await row.locator('.task-open').click(); await page.getByLabel('备注', { exact: true }).fill('深色模式下保存的备注');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await row.getByRole('checkbox').check(); await expect(row.getByRole('checkbox')).toBeChecked();
  await page.reload(); await row.locator('.task-open').click();
  await expect(page.getByLabel('备注', { exact: true })).toHaveValue('深色模式下保存的备注');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.goto('/?demo=1'); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await settings(page); await expect(page.getByRole('radio', { name: '深色', exact: true })).toBeChecked();
  await page.goto('/'); await expect(page.getByTestId('task-row').filter({ hasText: '深色中继续工作' })).toBeVisible();
});

test('多个标签页同步主题选择，清除主题偏好后恢复跟随系统', async ({ page, context }) => {
  await settings(page);
  const other = await context.newPage(); await other.goto('/'); await settings(other);
  await page.getByRole('radio', { name: '深色', exact: true }).check();
  await expect(theme(other)).toHaveAttribute('data-theme', 'dark');
  await expect(other.getByRole('radio', { name: '深色', exact: true })).toBeChecked();
  await other.getByRole('radio', { name: '浅色', exact: true }).check();
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('radio', { name: '浅色', exact: true })).toBeChecked();
  await other.evaluate(() => localStorage.removeItem('dayline-theme'));
  await expect(page.getByRole('radio', { name: '跟随系统', exact: true })).toBeChecked();
  await other.close();
});

test('无效偏好回退到系统，保存受限时当前切换仍可用并说明无法记住', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => localStorage.setItem('dayline-theme', 'unknown'));
  await page.reload(); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await settings(page); await expect(page.getByRole('radio', { name: '跟随系统', exact: true })).toBeChecked();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Storage is unavailable', 'SecurityError'); };
  });
  await page.reload(); await settings(page);
  await page.getByRole('radio', { name: '浅色', exact: true }).check();
  await expect(theme(page)).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('alert')).toContainText('浏览器未能保存');
  await page.reload(); await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
});

test('主应用脚本未启动时也能预先恢复深色外观', async ({ page }) => {
  await settings(page); await page.getByRole('radio', { name: '深色', exact: true }).check();
  await page.route('**/assets/*.js', route => route.abort());
  await page.reload();
  await expect(theme(page)).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#root')).toBeEmpty();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(24, 25, 28)');
});

test('深色今天、月历、设置、冲突提示和窄屏表单正常呈现', async ({ page }) => {
  await page.goto('/?demo=1'); await settings(page);
  await page.getByRole('radio', { name: '深色', exact: true }).check();
  await page.screenshot({ path: 'output/playwright/settings-dark.png', fullPage: true, animations: 'disabled' });
  await navigate(page, '今天'); await page.screenshot({ path: 'output/playwright/today-dark.png', fullPage: true, animations: 'disabled' });
  await navigate(page, '月度总览'); await page.screenshot({ path: 'output/playwright/month-dark.png', fullPage: true, animations: 'disabled' });
  for (const width of [1920, 1366, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: 'output/playwright/month-dark-narrow.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('深色会议');
  await page.getByLabel('开始时间', { exact: true }).fill('10:00');
  await page.getByLabel('结束时间', { exact: true }).fill('11:00');
  await expect(page.locator('.conflict-warning')).toContainText('产品进度同步');
  await page.screenshot({ path: 'output/playwright/editor-dark-narrow.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(page.locator('.selected-day')).toContainText('深色会议');
  await settings(page); await expect(page.getByRole('radio', { name: '深色', exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'output/playwright/settings-dark-narrow.png', fullPage: true, animations: 'disabled' });
});
