import { test, expect, type Page } from '@playwright/test';

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
const row = (page: Page, title: string) => page.getByTestId('task-row').filter({ has: page.locator('.task-title', { hasText: title }) });
async function create(page: Page, title: string, fields: Record<string, string> = {}) {
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill(title);
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T09:00:00+08:00'));
  await page.goto('/');
  await expect(page.getByText('今天，由你安排')).toBeVisible();
});
const fields = { '结束日期': '2026-10-24', '开始时间': '17:05', '结束时间': '07:56', '交付截止日期': '2026-10-30' };

test('客户跨日案例保存、刷新，月历两天时间和独立交付正确', async ({ page }) => {
  await create(page, '跨日工作', fields);
  await expect(row(page, '跨日工作')).toContainText('2026年10月23日 17:05 – 2026年10月24日 07:56');
  await expect(page.locator('.agenda-date')).toContainText('415 分钟');
  await expect(page.locator('.agenda-time')).toContainText('24:00');
  await page.reload();
  await row(page, '跨日工作').locator('.task-open').click();
  await expect(page.getByLabel('结束日期', { exact: true })).toHaveValue('2026-10-24');
  await expect(page.getByLabel('交付截止日期', { exact: true })).toHaveValue('2026-10-30');
  await expect(page.locator('.schedule-summary')).toContainText('891 分钟');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await nav(page, '月度总览');
  await expect(page.locator('[data-date="2026-10-24"] .calendar-event.plan')).toContainText('至 07:56');
  await expect(page.locator('[data-date="2026-10-30"] .calendar-event.due')).toContainText('跨日工作');
  await page.getByRole('button', { name: '查看2026-10-24', exact: true }).click();
  await expect(page.locator('.day-workload')).toContainText('476 分钟');
  await expect(page.locator('.day-detail-row')).toContainText('00:00–07:56');
  await page.clock.setFixedTime(new Date('2026-10-24T09:00:00+08:00')); await page.reload();
  await nav(page, '今天');
  await expect(row(page, '跨日工作')).toBeVisible();
  await expect(page.locator('.carry-section')).not.toContainText('跨日工作');
  await expect(page.locator('.agenda-date')).toContainText('476 分钟');
});

test('同日倒置与缺少结束日期提示明确，改跨日后清除错误，截止不决定结束日期', async ({ page }) => {
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('校验案例');
  await page.getByLabel('开始时间', { exact: true }).fill('17:05');
  await page.getByLabel('结束时间', { exact: true }).fill('07:56');
  await page.getByLabel('交付截止日期', { exact: true }).fill('2026-10-30');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('同一天内');
  await page.getByLabel('结束日期', { exact: true }).fill('');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('请填写结束日期');
  await page.getByLabel('结束日期', { exact: true }).fill('2026-10-24');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('交付截止日期', { exact: true }).fill('2026-10-23');
  await expect(page.locator('.hint.warning')).toContainText('超出交付截止日期');
  await page.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(row(page, '校验案例')).toBeVisible();
});

test('跨日冲突能发现次日安排，相邻时段不警告', async ({ page }) => {
  await create(page, '次日会议', { '开始日期': '2026-10-24', '开始时间': '07:00', '结束时间': '08:00' });
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('跨日会议');
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  await expect(page.locator('.conflict-warning')).toContainText('次日会议（2026年10月24日 07:00–08:00）');
  await page.getByLabel('结束时间', { exact: true }).fill('07:00');
  await expect(page.locator('.conflict-warning')).toHaveCount(0);
});

test('跨日批量改期保留跨度，导出恢复与回收站恢复保留日期', async ({ page }) => {
  await create(page, '跨日遗留', { '开始日期': '2026-10-20', '结束日期': '2026-10-21', '开始时间': '17:05', '结束时间': '07:56', '交付截止日期': '2026-10-30' });
  await page.getByRole('button', { name: '全部安排到今天', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '全部安排到今天', exact: true }).click();
  await row(page, '跨日遗留').locator('.task-open').click();
  await expect(page.getByLabel('结束日期', { exact: true })).toHaveValue('2026-10-24');
  await expect(page.getByLabel('交付截止日期', { exact: true })).toHaveValue('2026-10-30');
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这项任务？' }).getByRole('button', { name: '删除任务', exact: true }).click();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '恢复任务', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  const fs = await import('node:fs/promises');
  const content = await fs.readFile((await (await downloaded).path())!, 'utf8');
  const backup = JSON.parse(content);
  expect(backup.version).toBe(2); expect(backup.tasks[0].plannedEndDate).toBe('2026-10-24');
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'cross-day.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await page.getByRole('dialog').getByRole('button', { name: '确认恢复', exact: true }).click();
  await nav(page, '今天'); await row(page, '跨日遗留').locator('.task-open').click();
  await expect(page.getByLabel('结束日期', { exact: true })).toHaveValue('2026-10-24');
});

test('全天跨月覆盖完整日期，午夜结束不额外占用次日', async ({ page }) => {
  await create(page, '月底全天工作', { '开始日期': '2026-10-31', '结束日期': '2026-11-02' });
  await create(page, '午夜结束工作', { ...fields, '结束时间': '00:00' });
  await nav(page, '月度总览');
  await expect(page.locator('[data-date="2026-10-24"] .calendar-event.plan')).toHaveCount(0);
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  await expect(page.locator('.calendar-toolbar')).toContainText('1 项计划');
  for (const date of ['2026-11-01', '2026-11-02']) await expect(page.locator(`[data-date="${date}"] .calendar-event.plan`)).toContainText('月底全天工作');
});

test('时间表单浅深色和窄屏可读且无溢出', async ({ page }) => {
  for (const theme of ['浅色', '深色']) {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('radio', { name: theme, exact: true }).check();
    await nav(page, '今天');
    for (const width of [1285, 390]) {
      await page.setViewportSize({ width, height: 884 });
      await page.getByRole('button', { name: '新建任务', exact: true }).click();
      for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
      const dialog = page.getByRole('dialog');
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const name of ['开始日期', '开始时间', '结束日期', '结束时间']) {
        const input = page.getByLabel(name, { exact: true });
        const box = (await input.boundingBox())!; const parent = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(parent.x); expect(box.x + box.width).toBeLessThanOrEqual(parent.x + parent.width);
      }
      await page.screenshot({ path: `output/playwright/cross-day-${theme}-${width}.png`, animations: 'disabled' });
      page.once('dialog', d => void d.accept());
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
    }
  }
});
