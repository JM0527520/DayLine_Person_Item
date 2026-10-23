import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
const settings = (page: Page) => page.getByRole('button', { name: '设置', exact: true }).click();
const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ has: page.locator('.task-title', { hasText: title }) });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T09:00:00+08:00'));
  await page.goto('/?demo=1');
  await expect(row(page, '完成项目方案初稿')).toBeVisible();
});

async function chooseMonth(page: Page, year: string, month: string, source = '选择侧栏年月') {
  await page.getByRole('button', { name: source, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '选择年月' });
  await dialog.getByLabel('年份', { exact: true }).fill(year);
  await dialog.getByLabel('月份', { exact: true }).selectOption(month);
  await dialog.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

test('侧栏与月历均可选择年月，支持闰日、跨年和取消', async ({ page }) => {
  await chooseMonth(page, '2028', '02');
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2028年 2月');
  await expect(page.getByRole('button', { name: '选择侧栏年月' })).toContainText('2028年 2月');
  await page.getByRole('button', { name: '查看2028-02-29', exact: true }).click();
  await page.getByRole('button', { name: '添加任务', exact: true }).click();
  await expect(page.getByLabel('开始日期', { exact: true })).toHaveValue('2028-02-29');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await chooseMonth(page, '2030', '12', '选择月历年月');
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2031年 1月');
  const trigger = page.getByRole('button', { name: '选择月历年月' });
  await trigger.click(); await page.getByLabel('年份', { exact: true }).fill('2040');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2031年 1月');
  await page.getByRole('button', { name: '本月', exact: true }).click();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2026年 10月');
});

test('年月选择拒绝空值与越界年份，数字输入规范化后不会损坏日历', async ({ page }) => {
  await page.getByRole('button', { name: '选择侧栏年月' }).click();
  const dialog = page.getByRole('dialog', { name: '选择年月' });
  for (const invalid of ['', '0', '10000', '2026.5']) {
    await dialog.getByLabel('年份', { exact: true }).fill(invalid);
    await dialog.getByRole('button', { name: '跳转' }).click();
    await expect(dialog).toBeVisible();
    expect(await dialog.getByLabel('年份', { exact: true }).evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(false);
  }
  await dialog.getByLabel('年份', { exact: true }).fill('1e3');
  await dialog.getByRole('button', { name: '跳转' }).click();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('1000年 10月');
  await page.reload(); await expect(page.locator('.calendar-toolbar h2')).toHaveText('1000年 10月');
});

test('年月浮层紧邻入口且不遮罩页面，浅深色下可点外部关闭并继续操作', async ({ page }) => {
  await page.setViewportSize({ width: 1285, height: 884 });
  for (const mode of ['浅色', '深色']) {
    await settings(page); await page.getByRole('radio', { name: mode, exact: true }).check();
    await nav(page, '今天');
    const trigger = page.getByRole('button', { name: '选择侧栏年月' });
    await trigger.click();
    const popup = page.getByRole('dialog', { name: '选择年月' });
    await expect(popup).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const box = (await popup.boundingBox())!;
    const anchor = (await trigger.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(260); expect(box.height).toBeLessThanOrEqual(150);
    expect(box.x).toBe(anchor.x);
    expect(Math.min(Math.abs(box.y - anchor.y - anchor.height - 8), Math.abs(box.y + box.height + 8 - anchor.y))).toBeLessThanOrEqual(1);
    expect(await popup.evaluate(element => getComputedStyle(element, '::backdrop').backdropFilter)).toBe('none');
    expect(await page.locator('dialog:modal').count()).toBe(0);
    await page.screenshot({ path: `output/playwright/month-popover-sidebar-${mode}.png`, animations: 'disabled' });
    await page.getByRole('textbox', { name: '搜索任务' }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '搜索任务' })).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click(); await page.getByRole('button', { name: '关闭年月选择' }).click();
    await expect(popup).toHaveCount(0); await expect(trigger).toBeFocused();

    await nav(page, '月度总览');
    const main = page.getByRole('button', { name: '选择月历年月' });
    await main.click();
    const mainBox = (await popup.boundingBox())!;
    const mainAnchor = (await main.boundingBox())!;
    expect(mainBox.x).toBe(mainAnchor.x);
    expect(mainBox.y).toBe(mainAnchor.y + mainAnchor.height + 8);
    await page.screenshot({ path: `output/playwright/month-popover-calendar-${mode}.png`, animations: 'disabled' });
    await page.getByRole('button', { name: '下个月', exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(page.locator('.calendar-toolbar h2')).toHaveText(mode === '浅色' ? '2026年 11月' : '2026年 12月');
  }
});

test('年月浮层窄屏与调整窗口后不越界，入口滚出可视区域时收起', async ({ page }) => {
  await nav(page, '月度总览');
  await page.setViewportSize({ width: 390, height: 650 });
  await page.getByRole('button', { name: '选择月历年月' }).click();
  const popup = page.getByRole('dialog', { name: '选择年月' });
  for (const width of [390, 320, 1285]) {
    await page.setViewportSize({ width, height: 650 });
    await expect.poll(async () => {
      const box = (await popup.boundingBox())!;
      return box.x >= 8 && box.y >= 8 && box.x + box.width <= width - 8 && box.y + box.height <= 642;
    }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 650 });
  await page.screenshot({ path: 'output/playwright/month-popover-narrow.png', animations: 'disabled' });
  await page.getByLabel('年份', { exact: true }).fill('2028');
  await page.getByLabel('月份', { exact: true }).selectOption('02');
  await page.getByRole('button', { name: '跳转', exact: true }).click();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2028年 2月');
  await page.getByRole('button', { name: '选择月历年月' }).click();
  await page.mouse.move(350, 500); await page.mouse.wheel(0, 700);
  await expect(popup).toHaveCount(0);
  await page.setViewportSize({ width: 1285, height: 650 });
  await page.getByRole('button', { name: '选择侧栏年月' }).click();
  await expect(popup).toBeVisible();
  await page.setViewportSize({ width: 390, height: 650 });
  await expect(popup).toHaveCount(0);
});

test('已完成使用对勾，待办和进行中保留优先级旗标，重新打开恢复原优先级', async ({ page }) => {
  for (const mode of ['浅色', '深色']) {
    await settings(page); await page.getByRole('radio', { name: mode, exact: true }).check();
    await nav(page, '今天');
    const task = row(page, '设计评审');
    await expect(task.locator('.priority-indicator.high')).toBeVisible();
    await task.getByRole('checkbox').check();
    await expect(task.locator('.priority-indicator')).toHaveCount(0);
    await expect(task.locator('.completion-indicator')).toHaveAttribute('aria-label', '已完成');
    await page.reload();
    await expect(task.locator('.completion-indicator')).toBeVisible();
    await task.getByRole('checkbox').uncheck();
    await expect(task.locator('.completion-indicator')).toHaveCount(0);
    await expect(task.locator('.priority-indicator.high')).toBeVisible();
    await task.locator('.task-open').click();
    await expect(page.getByLabel('优先级', { exact: true })).toHaveValue('high');
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  }
});

test('到期摘要默认折叠，清单保留截止信息，未安排的紧急事项仍直接呈现', async ({ page }) => {
  const details = page.locator('.urgent-overview');
  await expect(details).not.toHaveAttribute('open', '');
  await expect(details.locator('summary')).toContainText('2 项到期待办');
  await expect(details.getByRole('button', { name: /整理客户反馈与待办/ })).not.toBeVisible();
  await expect(row(page, '整理客户反馈与待办')).toContainText('交付截止 2026年10月23日');
  await expect(page.locator('.deadline-section')).not.toContainText('整理客户反馈与待办');
  await details.locator('summary').click();
  await details.getByRole('button', { name: /整理客户反馈与待办/ }).click();
  await page.getByLabel('开始日期', { exact: true }).fill('');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(page.locator('.urgent-section > .urgent-list')).toContainText('整理客户反馈与待办');
  await page.locator('.urgent-section > .urgent-list').getByRole('button').click();
  await page.getByLabel('状态', { exact: true }).selectOption('done');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(page.locator('.urgent-section')).not.toContainText('整理客户反馈与待办');
});

test('显示密度改变间距而不缩小字号，刷新与多标签页保留选择', async ({ page, context }) => {
  const measure = () => row(page, '设计评审').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    font: getComputedStyle(element.querySelector('.task-title')!).fontSize,
  }));
  const comfortable = await measure();
  await settings(page); await page.getByRole('radio', { name: '标准', exact: true }).check();
  await nav(page, '今天'); const standard = await measure();
  expect(standard.height).toBeLessThan(comfortable.height); expect(standard.font).toBe(comfortable.font);
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-density', 'standard');
  const other = await context.newPage(); await other.goto('/?demo=1');
  await expect(other.locator('html')).toHaveAttribute('data-density', 'standard');
  await settings(other); await other.getByRole('radio', { name: '舒适', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'comfortable');
  await other.close();
});

test('刷新保留页面、年月、选中日期、分类及记录筛选，两个空间独立记忆', async ({ page }) => {
  await chooseMonth(page, '2028', '02');
  await page.getByRole('button', { name: '查看2028-02-29', exact: true }).click();
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '项目工作' });
  await page.reload();
  await expect(page.getByRole('heading', { name: '月度总览', exact: true })).toBeVisible();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2028年 2月');
  await expect(page.getByRole('button', { name: '查看2028-02-29', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('工作分类筛选', { exact: true })).toHaveValue(await page.getByLabel('工作分类筛选', { exact: true }).locator('option', { hasText: '项目工作' }).getAttribute('value'));
  await nav(page, '工作记录');
  await page.getByRole('button', { name: '进行中', exact: true }).click();
  await page.getByLabel('记录开始日期').fill('2026-10-01');
  await page.getByLabel('记录结束日期').fill('2026-10-31');
  await page.getByRole('textbox', { name: '搜索任务' }).fill('方案');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '搜索任务' })).toHaveValue('方案');
  await expect(page.getByRole('button', { name: '进行中', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('记录开始日期')).toHaveValue('2026-10-01');
  await expect(page.getByLabel('记录结束日期')).toHaveValue('2026-10-31');
  await expect(row(page, '完成项目方案初稿')).toBeVisible();
  await page.goto('/'); await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await nav(page, '未来任务');
  await page.goto('/?demo=1'); await expect(page.getByRole('heading', { name: '工作记录', exact: true })).toBeVisible();
  await page.goto('/'); await expect(page.getByRole('heading', { name: '未来任务', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '日序首页' }).click();
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
});

test('偏好损坏或保存受限仍可使用，已删除的分类不会留下隐藏筛选', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('dayline-navigation-demo', '{broken'));
  await page.reload(); await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '项目工作' });
  await settings(page); await page.getByRole('button', { name: '删除分类：项目工作' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除分类', exact: true }).click();
  await nav(page, '今天'); await page.reload();
  await expect(page.getByLabel('工作分类筛选', { exact: true })).toHaveValue('all');
  await expect(row(page, '完成项目方案初稿')).toBeVisible();
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Unavailable', 'SecurityError'); }; });
  await page.reload(); await settings(page); await page.getByRole('radio', { name: '标准', exact: true }).check();
  await expect(page.getByRole('alert')).toContainText('显示密度已调整');
  await nav(page, '今天'); await page.getByLabel('快速添加任务').fill('偏好无法保存时仍可工作');
  await page.getByLabel('快速添加任务').press('Enter');
  await expect(row(page, '偏好无法保存时仍可工作')).toBeVisible();
});

test('侧栏导航和设置固定，分类日历独立滚动；浅深色两种密度均无溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1285, height: 700 });
  const brand = await page.locator('.brand').boundingBox();
  const fixedTop = await page.locator('.sidebar-top').boundingBox();
  await expect(page.locator('.sidebar-top')).toHaveCSS('border-bottom-width', '1px');
  const setting = await page.getByRole('button', { name: '设置', exact: true }).boundingBox();
  expect(setting!.y + setting!.height).toBeLessThanOrEqual(700);
  const middle = page.getByRole('region', { name: '分类与日历' });
  await middle.hover(); await page.mouse.wheel(0, 350);
  await expect.poll(() => middle.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  expect((await page.locator('.brand').boundingBox())!.y).toBe(brand!.y);
  expect((await page.locator('.sidebar-top').boundingBox())!.y + (await page.locator('.sidebar-top').boundingBox())!.height).toBe(fixedTop!.y + fixedTop!.height);
  await expect(page.locator('.sidebar-top')).toHaveCSS('border-bottom-width', '1px');
  expect((await page.getByRole('button', { name: '设置', exact: true }).boundingBox())!.y).toBe(setting!.y);
  for (const mode of ['浅色', '深色']) {
    for (const density of ['标准', '舒适']) {
      await settings(page); await page.getByRole('radio', { name: mode, exact: true }).check();
      await page.getByRole('radio', { name: density, exact: true }).check();
      await nav(page, '今天');
      for (const width of [1285, 390]) {
        await page.setViewportSize({ width, height: 884 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `output/playwright/workspace-${mode}-${density}-${width}.png`, fullPage: true, animations: 'disabled' });
      }
      await page.setViewportSize({ width: 1285, height: 700 });
    }
  }
});
