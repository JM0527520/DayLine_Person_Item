import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T09:00:00+08:00'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await expect(page.getByText('正在打开工作空间…')).toHaveCount(0);
});

async function create(page: Page, title: string, fields: Record<string, string> = {}) {
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建任务' });
  await dialog.getByLabel('任务名称', { exact: true }).fill(title);
  for (const [label, value] of Object.entries(fields)) {
    const input = dialog.getByLabel(label, { exact: true });
    if (['优先级', '状态', '工作分类'].includes(label)) await input.selectOption({ label: value });
    else await input.fill(value);
  }
  await dialog.getByRole('button', { name: '保存任务', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function nav(page: Page, name: string) { await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: false }).click(); }
async function settings(page: Page) { await page.getByRole('button', { name: '设置', exact: true }).click(); }
const taskRow = (page: Page, title: string) => page.getByTestId('task-row').filter({ has: page.locator('.task-title', { hasText: title }) });

test('空白工作空间、五个页面和示例入口可用', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByText('今天，由你安排')).toBeVisible();
  for (const name of ['月度总览', '未来任务', '工作记录']) { await nav(page, name); await expect(page.getByRole('heading', { name, exact: true })).toBeVisible(); }
  await settings(page); await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('创建、刷新持久化、编辑备注和删除任务', async ({ page }) => {
  await create(page, '整理工作材料', { '备注': '准备参考资料' });
  await page.reload(); await expect(taskRow(page, '整理工作材料')).toBeVisible();
  await taskRow(page, '整理工作材料').getByRole('button').click();
  const dialog = page.getByRole('dialog', { name: '任务详情' });
  await expect(dialog.getByLabel('备注', { exact: true })).toHaveValue('准备参考资料');
  await dialog.getByLabel('任务名称', { exact: true }).fill('整理工作材料第二版');
  await dialog.getByRole('button', { name: '保存任务' }).click();
  await taskRow(page, '整理工作材料第二版').getByRole('button').click();
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这项任务？' }).getByRole('button', { name: '删除任务', exact: true }).click();
  await expect(taskRow(page, '整理工作材料第二版')).toHaveCount(0);
  await page.reload(); await expect(page.getByText('今天，由你安排')).toBeVisible();
});

test('定时任务同时进入当天清单和时间轴', async ({ page }) => {
  await create(page, '方案评审会议', { '开始时间': '10:00', '结束时间': '11:00', '优先级': '高优先级', '工作分类': '项目工作' });
  await expect(taskRow(page, '方案评审会议')).toContainText('10:00–11:00');
  await expect(page.locator('.agenda-item')).toContainText('方案评审会议');
  await expect(page.locator('.agenda-item')).toContainText('10:00');
  await expect(taskRow(page, '方案评审会议').getByLabel('高优先级', { exact: true })).toBeVisible();
});

test('无标题、时间倒置、缺少日期的表单均拒绝保存', async ({ page }) => {
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新建任务' });
  await dialog.getByRole('button', { name: '保存任务' }).click(); await expect(dialog.getByRole('alert')).toContainText('请填写任务名称');
  await dialog.getByLabel('任务名称', { exact: true }).fill('无效时间案例');
  await dialog.getByLabel('开始时间', { exact: true }).fill('11:00'); await dialog.getByLabel('结束时间', { exact: true }).fill('10:00');
  await dialog.getByRole('button', { name: '保存任务' }).click(); await expect(dialog.getByRole('alert')).toContainText('结束时间必须晚于开始时间');
  await dialog.getByLabel('开始日期', { exact: true }).fill('');
  await dialog.getByLabel('开始时间', { exact: true }).fill('09:00'); await dialog.getByLabel('结束时间', { exact: true }).fill('10:00');
  await dialog.getByRole('button', { name: '保存任务' }).click(); await expect(dialog.getByRole('alert')).toContainText('请先选择工作安排的开始日期');
});

test('过去计划的任务持续显示并保留原日期，与截止超期区分', async ({ page }) => {
  await create(page, '此前未完成的方案', { '开始日期': '2026-10-21', '交付截止日期': '2026-10-30' });
  const row = taskRow(page, '此前未完成的方案');
  await expect(page.locator('.carry-section')).toContainText('此前未完成的方案');
  await expect(row).toContainText('10月21日'); await expect(row).not.toContainText('已过截止');
  await row.locator('.task-open').click(); await expect(page.getByRole('dialog').getByLabel('开始日期', { exact: true })).toHaveValue('2026-10-21');
});

test('仅截止日期的事项进入截止提醒，完成后移出提醒', async ({ page }) => {
  await create(page, '明天必须交付', { '开始日期': '', '交付截止日期': '2026-10-24' });
  await expect(page.locator('.deadline-section')).toContainText('明天必须交付');
  await nav(page, '未来任务'); await taskRow(page, '明天必须交付').getByRole('checkbox').click();
  await nav(page, '今天'); await expect(page.locator('.deadline-section')).not.toContainText('明天必须交付');
});

test('完成任务保留完成时间，支持查询和重新打开', async ({ page }) => {
  await create(page, '完成历史案例'); await taskRow(page, '完成历史案例').getByRole('checkbox').check();
  await nav(page, '工作记录'); await page.getByRole('button', { name: '已完成', exact: true }).click();
  await expect(taskRow(page, '完成历史案例')).toBeVisible(); await expect(page.locator('.completion-time')).toContainText('2026年10月23日');
  await taskRow(page, '完成历史案例').getByRole('checkbox').click();
  await expect(taskRow(page, '完成历史案例')).toHaveCount(0);
  await page.getByRole('button', { name: '待办', exact: true }).click(); await expect(taskRow(page, '完成历史案例')).toBeVisible();
  await expect(page.locator('.completion-time')).toHaveCount(0);
});

test('优先级排序和进行中状态', async ({ page }) => {
  await create(page, '低优先级工作', { '优先级': '低优先级' });
  await create(page, '高优先级工作', { '优先级': '高优先级', '状态': '进行中' });
  await expect(page.getByTestId('task-row').first()).toContainText('高优先级工作');
  await expect(taskRow(page, '高优先级工作').locator('.status-dot')).toBeVisible();
  await nav(page, '工作记录'); await page.getByRole('button', { name: '进行中', exact: true }).click();
  await expect(page.getByTestId('task-row')).toHaveCount(1);
});

test('月历计划、截止提示可打开同一任务，修改后两处同步', async ({ page }) => {
  await create(page, '月底汇报材料', { '开始日期': '2026-10-26', '交付截止日期': '2026-10-30' });
  await nav(page, '月度总览');
  await expect(page.locator('[data-date="2026-10-26"] .calendar-event.plan')).toContainText('月底汇报材料');
  await expect(page.locator('[data-date="2026-10-30"] .calendar-event.due')).toContainText('截止 · 月底汇报材料');
  await page.locator('[data-date="2026-10-30"] .calendar-event.due').click();
  const dialog = page.getByRole('dialog', { name: '任务详情' });
  await expect(dialog.getByLabel('开始日期', { exact: true })).toHaveValue('2026-10-26');
  await dialog.getByLabel('任务名称', { exact: true }).fill('修改后的汇报材料'); await dialog.getByRole('button', { name: '保存任务' }).click();
  await expect(page.locator('[data-date="2026-10-26"] .calendar-event.plan')).toContainText('修改后的汇报材料');
  await expect(page.locator('[data-date="2026-10-30"] .calendar-event.due')).toContainText('修改后的汇报材料');
});

test('月历翻月、跨年和点击日期新增', async ({ page }) => {
  await nav(page, '月度总览');
  await page.getByRole('button', { name: '下个月', exact: true }).click();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2026年 11月');
  await page.getByRole('button', { name: '查看2026-11-12', exact: true }).click();
  await page.locator('.selected-day').getByRole('button', { name: '添加任务' }).click();
  await expect(page.getByRole('dialog').getByLabel('开始日期', { exact: true })).toHaveValue('2026-11-12');
  await page.getByRole('dialog').getByLabel('任务名称', { exact: true }).fill('选定日期任务'); await page.getByRole('button', { name: '保存任务' }).click();
  await expect(page.locator('[data-date="2026-11-12"]')).toContainText('选定日期任务');
  await page.getByRole('button', { name: '下个月', exact: true }).click(); await page.getByRole('button', { name: '下个月', exact: true }).click();
  await expect(page.locator('.calendar-toolbar h2')).toHaveText('2027年 1月');
  await page.getByRole('button', { name: '本月', exact: true }).click(); await expect(page.locator('.calendar-toolbar h2')).toHaveText('2026年 10月');
});

test('月历密集日期折叠后仍可查看全部项目', async ({ page }) => {
  for (let i = 1; i <= 5; i++) await create(page, `密集安排${i}`);
  await nav(page, '月度总览'); await expect(page.locator('[data-date="2026-10-23"] .more-events')).toHaveText('还有 2 项');
  await page.locator('[data-date="2026-10-23"] .more-events').click(); await expect(page.locator('.selected-day .day-detail-row')).toHaveCount(5);
});

test('未来任务区分已安排和未安排，支持分类筛选', async ({ page }) => {
  await create(page, '未来项目', { '开始日期': '2026-10-28', '工作分类': '项目工作' });
  await create(page, '暂存想法', { '开始日期': '', '工作分类': '个人成长' });
  await nav(page, '未来任务'); await expect(page.locator('.future-group')).toContainText('未来项目'); await expect(page.locator('.unscheduled-column')).toContainText('暂存想法');
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '项目工作' });
  await expect(taskRow(page, '暂存想法')).toHaveCount(0); await expect(taskRow(page, '未来项目')).toBeVisible();
});

test('全局搜索标题及备注、清除搜索和分类过滤', async ({ page }) => {
  await create(page, '采购工作', { '备注': '核对打印机型号', '工作分类': '日常工作' }); await create(page, '设计任务', { '工作分类': '项目工作' });
  await page.getByRole('textbox', { name: '搜索任务' }).fill('打印机'); await expect(page.getByRole('heading', { name: '工作记录', exact: true })).toBeVisible();
  await expect(page.getByTestId('task-row')).toHaveCount(1); await expect(taskRow(page, '采购工作')).toBeVisible();
  await page.getByRole('button', { name: '清除搜索' }).click(); await expect(page.getByTestId('task-row')).toHaveCount(2);
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '项目工作' }); await expect(page.getByTestId('task-row')).toHaveCount(1);
  await page.getByRole('textbox', { name: '搜索任务' }).fill('不存在的名称'); await expect(page.getByText('没有找到匹配的任务')).toBeVisible();
});

test('分类增改删和颜色设置，删除后任务保留为未分类', async ({ page }) => {
  await settings(page); await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByLabel('分类名称', { exact: true }).fill('研发项目'); await page.getByRole('button', { name: '绿色', exact: true }).click(); await page.getByRole('button', { name: '保存分类', exact: true }).click();
  await nav(page, '今天'); await create(page, '分类关联任务', { '工作分类': '研发项目' });
  await settings(page); await page.getByRole('button', { name: '编辑分类：研发项目' }).click(); await page.getByLabel('分类名称', { exact: true }).fill('研发二期'); await page.getByRole('button', { name: '保存分类', exact: true }).click();
  await page.getByRole('button', { name: '删除分类：研发二期' }).click(); await page.getByRole('dialog', { name: '删除这个分类？' }).getByRole('button', { name: '删除分类', exact: true }).click();
  await nav(page, '今天'); await expect(taskRow(page, '分类关联任务')).toBeVisible(); await expect(taskRow(page, '分类关联任务')).not.toContainText('研发二期');
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '未分类' }); await expect(taskRow(page, '分类关联任务')).toBeVisible();
});

test('同名分类和空分类名称被拒绝', async ({ page }) => {
  await settings(page); await page.getByRole('button', { name: '新增分类', exact: true }).click();
  await page.getByRole('button', { name: '保存分类', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('请填写分类名称');
  await page.getByLabel('分类名称', { exact: true }).fill('项目工作'); await page.getByRole('button', { name: '保存分类', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('已存在同名分类');
});

test('导出再恢复能还原任务、分类、状态和完成时间', async ({ page }) => {
  await create(page, '备份原始任务', { '工作分类': '项目工作', '备注': '需要保留的细节', '交付截止日期': '2026-10-27' });
  await taskRow(page, '备份原始任务').getByRole('checkbox').check(); await settings(page);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份', exact: true }).click(); const download = await downloadPromise;
  const content = await fs.readFile((await download.path())!, 'utf8'); const backup = JSON.parse(content);
  expect(backup.tasks[0].completedAt).toBeTruthy(); expect(backup.categories).toHaveLength(3);
  await expect(page.locator('.setting-row').filter({ has: page.getByRole('heading', { name: '上次导出', exact: true }) })).toContainText('2026年10月23日 09:00');
  await nav(page, '今天'); await create(page, '恢复时应被替换的任务'); await settings(page);
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(content) });
  await page.getByRole('dialog', { name: '从备份恢复？' }).getByRole('button', { name: '确认恢复', exact: true }).click();
  await nav(page, '工作记录'); await expect(taskRow(page, '恢复时应被替换的任务')).toHaveCount(0); await expect(taskRow(page, '备份原始任务').getByRole('checkbox')).toBeChecked();
  await taskRow(page, '备份原始任务').getByRole('button').click(); await expect(page.getByRole('dialog').getByLabel('备注', { exact: true })).toHaveValue('需要保留的细节');
});

test('损坏备份和无效时间备份不会修改已有数据', async ({ page }) => {
  await create(page, '必须保留的数据'); await settings(page);
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad json') }); await expect(page.getByRole('alert')).toContainText('有效的 JSON');
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'bad-version.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'dayline', version: 99, tasks: [] })) }); await expect(page.getByRole('alert')).toContainText('备份格式无效');
  await nav(page, '今天'); await expect(taskRow(page, '必须保留的数据')).toBeVisible();
});

test('示例和正式空间隔离，示例具有可编辑的真实任务', async ({ page }) => {
  await create(page, '我的正式任务');
  await page.goto('/?demo=1'); await expect(page.getByText('示例空间', { exact: true })).toBeVisible(); await expect(taskRow(page, '完成项目方案初稿')).toBeVisible(); await expect(taskRow(page, '我的正式任务')).toHaveCount(0);
  await taskRow(page, '完成项目方案初稿').getByRole('checkbox').check();
  await page.getByRole('link', { name: '进入我的日程' }).click(); await expect(taskRow(page, '我的正式任务')).toBeVisible(); await expect(taskRow(page, '完成项目方案初稿')).toHaveCount(0);
});

test('无外网依赖，本地服务下刷新和保存可用', async ({ page, context }) => {
  const external: string[] = [];
  await context.route('**/*', async route => { const url = new URL(route.request().url()); if (url.hostname !== '127.0.0.1') { external.push(url.href); await route.abort(); } else await route.continue(); });
  await page.reload(); await create(page, '断网工作案例'); await page.reload(); await expect(taskRow(page, '断网工作案例')).toBeVisible(); expect(external).toEqual([]);
});

test('任务文本以文本呈现，不作为 HTML 执行', async ({ page }) => {
  const title = '<img src=x onerror=alert(1)> 安全显示'; let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await create(page, title); await expect(taskRow(page, title)).toBeVisible(); await expect(page.locator('.task-title img')).toHaveCount(0); expect(dialogs).toBe(0);
});

test('多标签页新增任务会自动同步', async ({ page, context }) => {
  const second = await context.newPage(); await second.goto('/'); await expect(second.getByText('今天，由你安排')).toBeVisible();
  await create(page, '跨标签页任务'); await expect(taskRow(second, '跨标签页任务')).toBeVisible();
});

test('取消备份恢复保留原数据', async ({ page }) => {
  await create(page, '取消恢复仍保留'); await settings(page);
  const backup = { app: 'dayline', version: 1, exportedAt: new Date().toISOString(), tasks: [], categories: [] };
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('dialog', { name: '从备份恢复？' }).getByRole('button', { name: '取消', exact: true }).click();
  await nav(page, '今天'); await expect(taskRow(page, '取消恢复仍保留')).toBeVisible();
});

test('同日计划和截止保留两种标记，完成状态同步', async ({ page }) => {
  await create(page, '今天安排今天截止', { '交付截止日期': '2026-10-23' });
  await taskRow(page, '今天安排今天截止').getByRole('checkbox').check(); await nav(page, '月度总览');
  const cell = page.locator('[data-date="2026-10-23"]');
  await expect(cell.locator('.calendar-event.completed')).toHaveCount(2);
  await expect(cell.locator('.calendar-event.plan')).toHaveCount(1); await expect(cell.locator('.calendar-event.due')).toHaveCount(1);
});

test('未保存修改退出时确认，取消退出可继续编辑', async ({ page }) => {
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('尚未保存的任务');
  page.once('dialog', dialog => void dialog.dismiss()); await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByLabel('任务名称', { exact: true })).toHaveValue('尚未保存的任务');
  page.once('dialog', dialog => void dialog.accept()); await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByTestId('task-row')).toHaveCount(0);
});

test('分类筛选下首页统计与任务范围一致', async ({ page }) => {
  await create(page, '项目已完成', { '工作分类': '项目工作' }); await taskRow(page, '项目已完成').getByRole('checkbox').check();
  await create(page, '日常已完成', { '工作分类': '日常工作' }); await taskRow(page, '日常已完成').getByRole('checkbox').check();
  await create(page, '项目重要待办', { '工作分类': '项目工作', '优先级': '高优先级' });
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '项目工作' });
  await expect(page.locator('.day-summary > div').nth(0).locator('strong')).toHaveText('1项');
  await expect(page.locator('.day-summary > div').nth(1).locator('strong')).toHaveText('1项');
  await expect(page.locator('.day-summary > div').nth(2).locator('strong')).toHaveText('1项');
});

test('跨日打开自动显示之前未完成且保留原日期', async ({ page }) => {
  await create(page, '跨日工作');
  await page.clock.setFixedTime(new Date('2026-10-24T09:00:00+08:00')); await page.reload();
  await expect(page.locator('.carry-section')).toContainText('跨日工作');
  await taskRow(page, '跨日工作').locator('.task-open').click();
  await expect(page.getByRole('dialog').getByLabel('开始日期', { exact: true })).toHaveValue('2026-10-23');
});

test('未安排日期的高优先级到期任务计入首页统计与重点区', async ({ page }) => {
  await create(page, '无计划的紧急工作', { '开始日期': '', '交付截止日期': '2026-10-23', '优先级': '高优先级' });
  await expect(page.locator('.day-summary > div').nth(0).locator('strong')).toHaveText('1项');
  await expect(page.locator('.day-summary > div').nth(2).locator('strong')).toHaveText('1项');
  await expect(page.locator('.urgent-section')).toContainText('无计划的紧急工作');
  await create(page, '计划和截止同一天', { '交付截止日期': '2026-10-23' });
  await expect(page.locator('.day-summary > div').nth(0).locator('strong')).toHaveText('2项');
});

test('分类筛选下新增任务继承分类，跨页筛选可一键清除', async ({ page }) => {
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '项目工作' });
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('工作分类', { exact: true })).toHaveValue(await page.getByLabel('工作分类筛选').inputValue());
  await page.getByLabel('任务名称', { exact: true }).fill('继承分类的任务'); await page.getByRole('button', { name: '保存任务' }).click();
  await expect(taskRow(page, '继承分类的任务')).toBeVisible();
  await nav(page, '未来任务'); await expect(page.locator('.active-filter')).toContainText('项目工作');
  await page.getByRole('button', { name: '清除筛选', exact: true }).click(); await expect(page.locator('.active-filter')).toHaveCount(0);
});

test('快捷输入回车新增，继承分类并清空输入', async ({ page }) => {
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '日常工作' });
  await page.getByRole('textbox', { name: '快速添加任务' }).fill('用回车快速记录');
  await page.getByRole('textbox', { name: '快速添加任务' }).press('Enter');
  await expect(taskRow(page, '用回车快速记录')).toContainText('日常工作');
  await expect(page.getByRole('textbox', { name: '快速添加任务' })).toHaveValue('');
  await page.reload(); await expect(taskRow(page, '用回车快速记录')).toBeVisible();
});

test('遗留任务快捷改期不改变截止和定时时间', async ({ page }) => {
  await create(page, '需要改期的工作', { '开始日期': '2026-10-21', '交付截止日期': '2026-10-30', '开始时间': '10:00', '结束时间': '11:00' });
  await page.getByRole('button', { name: '安排到今天：需要改期的工作', exact: true }).click();
  await expect(page.locator('.carry-section')).not.toContainText('需要改期的工作');
  await taskRow(page, '需要改期的工作').getByRole('button').first().click();
  const dialog = page.getByRole('dialog'); await expect(dialog.getByLabel('开始日期', { exact: true })).toHaveValue('2026-10-23');
  await expect(dialog.getByLabel('交付截止日期', { exact: true })).toHaveValue('2026-10-30'); await expect(dialog.getByLabel('开始时间', { exact: true })).toHaveValue('10:00');
});

test('批量安排仅处理当前分类的遗留任务', async ({ page }) => {
  await create(page, '项目遗留', { '开始日期': '2026-10-21', '工作分类': '项目工作' });
  await create(page, '日常遗留', { '开始日期': '2026-10-21', '工作分类': '日常工作' });
  await page.getByLabel('工作分类筛选', { exact: true }).selectOption({ label: '项目工作' });
  await page.getByRole('button', { name: '全部安排到今天', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '全部安排到今天', exact: true }).click();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page.locator('.carry-section')).toContainText('日常遗留'); await expect(page.locator('.carry-section')).not.toContainText('项目遗留');
});

test('遗留任务可改到明天并在未来任务中继续编辑', async ({ page }) => {
  await create(page, '明天继续处理', { '开始日期': '2026-10-21', '交付截止日期': '2026-10-25', '开始时间': '10:00', '结束时间': '11:00' });
  await page.getByRole('button', { name: '改到明天：明天继续处理', exact: true }).click();
  await expect(page.locator('.carry-section')).not.toContainText('明天继续处理');
  await nav(page, '未来任务'); await taskRow(page, '明天继续处理').locator('.task-open').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('开始日期', { exact: true })).toHaveValue('2026-10-24');
  await expect(dialog.getByLabel('交付截止日期', { exact: true })).toHaveValue('2026-10-25');
  await expect(dialog.getByLabel('开始时间', { exact: true })).toHaveValue('10:00');
  await expect(dialog.getByLabel('结束时间', { exact: true })).toHaveValue('11:00');
});

test('时间冲突可见但允许保存，调整到不重叠时提示消失', async ({ page }) => {
  await create(page, '已有会议', { '开始时间': '10:00', '结束时间': '11:00' });
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务名称', { exact: true }).fill('重叠会议');
  await page.getByLabel('开始时间', { exact: true }).fill('10:30'); await page.getByLabel('结束时间', { exact: true }).fill('11:30');
  await expect(page.locator('.conflict-warning')).toContainText('已有会议');
  await page.getByLabel('开始时间', { exact: true }).fill('11:00'); await expect(page.locator('.conflict-warning')).toHaveCount(0);
  await page.getByLabel('开始时间', { exact: true }).fill('10:30'); await page.getByRole('button', { name: '保存任务' }).click();
  await expect(taskRow(page, '重叠会议')).toBeVisible();
});

test('删除到回收站后刷新可恢复，分类失效时恢复为未分类', async ({ page }) => {
  await create(page, '误删后恢复', { '工作分类': '项目工作' });
  await taskRow(page, '误删后恢复').getByRole('button').click(); await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这项任务？' }).getByRole('button', { name: '删除任务', exact: true }).click();
  await page.reload(); await settings(page); await expect(page.locator('.trash-row')).toContainText('误删后恢复');
  await page.getByRole('button', { name: '删除分类：项目工作', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '删除分类', exact: true }).click();
  await page.getByRole('button', { name: '恢复任务', exact: true }).click();
  await nav(page, '今天'); await expect(taskRow(page, '误删后恢复')).toBeVisible(); await expect(taskRow(page, '误删后恢复')).not.toContainText('项目工作');
});

test('备份恢复前保留快照，可以撤销最近一次恢复', async ({ page }) => {
  await create(page, '导入前的原始记录'); await settings(page);
  const backup = { app: 'dayline', version: 1, exportedAt: new Date().toISOString(), tasks: [], categories: [] };
  await page.getByLabel('选择备份文件', { exact: true }).setInputFiles({ name: 'empty.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.getByRole('dialog').getByRole('button', { name: '确认恢复', exact: true }).click();
  await page.getByRole('button', { name: '返回恢复前', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '返回恢复前', exact: true }).click();
  await nav(page, '今天'); await expect(taskRow(page, '导入前的原始记录')).toBeVisible();
});

test('工作记录支持日期范围筛选和日期分组', async ({ page }) => {
  await create(page, '前天的工作', { '开始日期': '2026-10-21' }); await create(page, '今天的工作');
  await nav(page, '工作记录'); await expect(page.locator('.record-date-group')).toHaveCount(2);
  await page.getByLabel('记录开始日期', { exact: true }).fill('2026-10-23');
  await expect(taskRow(page, '前天的工作')).toHaveCount(0); await expect(taskRow(page, '今天的工作')).toBeVisible();
  await page.getByRole('button', { name: '清除日期筛选', exact: true }).click(); await expect(taskRow(page, '前天的工作')).toBeVisible();
});

test('月历日期详情显示任务数量与总时长', async ({ page }) => {
  await create(page, '45分钟事项', { '开始时间': '09:30', '结束时间': '10:15' }); await create(page, '60分钟事项', { '开始时间': '14:00', '结束时间': '15:00' });
  await nav(page, '月度总览'); await expect(page.locator('.day-workload')).toContainText('105 分钟');
  await expect(page.locator('.day-workload')).toContainText('2 项计划');
});

test('从旧版数据库升级保留任务与分类并增加回收站', async ({ page }) => {
  await page.evaluate(async () => {
    const request = indexedDB.open('dayline-demo-v1', 10);
    request.onupgradeneeded = () => {
      const database = request.result;
      const tasks = database.createObjectStore('tasks', { keyPath: 'id' });
      for (const name of ['plannedDate', 'dueDate', 'status', 'categoryId']) tasks.createIndex(name, name);
      const categories = database.createObjectStore('categories', { keyPath: 'id' }); categories.createIndex('name', 'name');
      database.createObjectStore('meta', { keyPath: 'key' });
    };
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result; const transaction = database.transaction(['tasks', 'categories', 'meta'], 'readwrite');
        const categoryId = crypto.randomUUID(); const now = new Date().toISOString();
        transaction.objectStore('categories').put({ id: categoryId, name: '旧版分类', color: '#007aff' });
        transaction.objectStore('meta').put({ key: 'initialized', value: '1' });
        transaction.objectStore('tasks').put({ id: crypto.randomUUID(), title: '旧版遗留任务', notes: '升级时保留备注', categoryId, priority: 'high', status: 'todo', plannedDate: '2026-10-23', dueDate: '', startTime: '', endTime: '', createdAt: now, updatedAt: now, completedAt: null });
        transaction.onerror = () => reject(transaction.error); transaction.oncomplete = () => { database.close(); resolve(); };
      };
    });
  });
  await page.goto('/?demo=1'); await expect(taskRow(page, '旧版遗留任务')).toContainText('旧版分类');
  await taskRow(page, '旧版遗留任务').locator('.task-open').click();
  await expect(page.getByLabel('备注', { exact: true })).toHaveValue('升级时保留备注');
  await page.getByRole('button', { name: '删除任务', exact: true }).click();
  await page.getByRole('dialog', { name: '删除这项任务？' }).getByRole('button', { name: '删除任务', exact: true }).click();
  await settings(page); await expect(page.locator('.trash-row')).toContainText('旧版遗留任务');
});

test('六周月份和长任务名称在常见桌面尺寸中不溢出', async ({ page }) => {
  await create(page, '较长任务标题'.repeat(25), { '工作分类': '项目工作', '备注': '完整记录保留在详情中。' });
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['今天', '未来任务', '工作记录']) {
      await nav(page, name);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await nav(page, '月度总览'); await page.getByRole('button', { name: '本月', exact: true }).click();
    await page.getByRole('button', { name: '下个月', exact: true }).click();
    await expect(page.locator('.calendar-cell')).toHaveCount(42);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const calendar = await page.locator('.month-calendar').boundingBox();
    const inspector = await page.locator('.selected-day').boundingBox();
    expect(calendar).not.toBeNull(); expect(inspector).not.toBeNull();
    expect(inspector!.x).toBeGreaterThanOrEqual(calendar!.x + calendar!.width);
    await page.screenshot({ path: `output/playwright/month-six-weeks-${width}.png`, fullPage: true });
    await settings(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('独立设计预览可切换视图、勾选任务和选择日期', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('design-preview.html')).href);
  await page.getByRole('checkbox').first().check();
  await expect(page.locator('#pending')).toHaveText('2'); await expect(page.locator('#done')).toHaveText('1');
  await page.getByRole('button', { name: '月度总览', exact: true }).click();
  await expect(page.locator('#month')).toBeVisible();
  await page.getByRole('button', { name: '查看10月24日', exact: true }).click();
  await expect(page.locator('#day')).toHaveText('24'); await expect(page.locator('#workload')).toHaveText('0 项计划');
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.getByRole('checkbox').first()).toBeChecked();
});

test('桌面与窄屏截图，布局无横向溢出', async ({ page }) => {
  await page.goto('/?demo=1'); await expect(taskRow(page, '完成项目方案初稿')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/today-desktop.png', fullPage: true });
  await nav(page, '月度总览'); await page.screenshot({ path: 'output/playwright/month-desktop.png', fullPage: true });
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: 'output/playwright/month-narrow.png', fullPage: true });
  }
  await nav(page, '今天'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '新建任务', exact: true }).click(); await expect(page.getByRole('dialog')).toBeInViewport();
  await page.screenshot({ path: 'output/playwright/editor-narrow.png', fullPage: true });
});
