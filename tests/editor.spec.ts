import { test as base, expect, type Page } from '@playwright/test';
const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});
async function seed(page: Page, body = '', dock = false) {
  await page.addInitScript(({ body }) => {
    if (!localStorage.getItem('marmerlade.diagram')) localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 2, diagram: {
      nodes: [{ id: 'a', label: 'API', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, pageIds: ['p'] }], edges: [],
      pages: [{ id: 'p', title: 'Notes', body, updatedAt: 1 }, { id: 'other', title: 'Other', body: '', updatedAt: 1 }],
    } }));
  }, { body });
  await page.goto(dock ? '/#/node/a' : '/#/wiki/p?node=a');
  if (dock) await page.getByRole('button', { name: 'Open page', exact: true }).click();
  await expect(page.getByLabel('Page content')).toBeVisible();
}
async function savedBody(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram?.pages.find((p: { id: string }) => p.id === 'p')?.body);
}
for (const dock of [false, true]) {
  test(`slash commands and table editing ${dock ? 'in dock' : 'in wiki'}`, async ({ page }) => {
    await seed(page, '', dock);
    const content = page.getByLabel('Page content');
    await content.click();
    await page.keyboard.type('/ta');
    await expect(page.getByRole('option', { name: 'Table', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(content).toHaveText('/ta');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('/table');
    await page.keyboard.press('Enter');
    await expect(content.locator('tr')).toHaveCount(3);
    await page.keyboard.type('Name');
    await page.keyboard.press('Tab');
    await page.keyboard.type('Value');
    await page.getByRole('button', { name: 'Row options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Insert row below', exact: true }).click();
    await expect(content.locator('tr')).toHaveCount(4);
    await page.getByRole('button', { name: 'Column options', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Insert column right', exact: true }).click();
    await expect(content.locator('tr').first().locator('th,td')).toHaveCount(4);
    await expect.poll(() => savedBody(page)).toContain('Name');
    await page.reload();
    if (dock) await page.getByRole('button', { name: 'Open page', exact: true }).click();
    await expect(page.getByLabel('Page content').locator('tr')).toHaveCount(4);
    await page.getByRole('tab', { name: 'Read', exact: true }).click();
    await expect(page.locator('.wk-preview table')).toHaveCount(1);
    await expect(page.locator('.wk-preview')).toContainText('Value');
    await page.getByRole('tab', { name: 'Markdown', exact: true }).click();
    await expect(page.locator('.cm-content')).toContainText('|');
    await page.getByRole('tab', { name: 'Edit', exact: true }).click();
    await expect(content.locator('tr')).toHaveCount(4);
  });
}
test('formatting, undo, wikilinks and unchanged opening', async ({ page }) => {
  const original = 'A [[Other|reference]]\n\n{{diagram}}';
  await seed(page, original);
  await expect(page.locator('[data-wikilink="Other"]')).toHaveText('reference');
  await expect(page.locator('.wk-diagram-block svg')).toBeVisible();
  expect(await savedBody(page)).toBe(original);
  await page.getByLabel('Page content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('hello');
  await page.keyboard.press('ControlOrMeta+Shift+ArrowLeft');
  await expect(page.getByRole('toolbar', { name: 'Text formatting' })).toBeVisible();
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(page.locator('.tiptap strong')).toHaveText('hello');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.tiptap strong')).toHaveCount(0);
});
test('unsupported HTML stays intact in source mode', async ({ page }) => {
  const body = '<details><summary>Details</summary>Preserved</details>';
  await page.addInitScript((body) => localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 2, diagram: { nodes: [], edges: [], pages: [{ id: 'p', title: 'HTML', body, updatedAt: 1 }] } })), body);
  await page.goto('/#/wiki/p');
  await expect(page.getByRole('tab', { name: 'Edit', exact: true })).toBeDisabled();
  await expect(page.locator('.cm-content')).toContainText(body);
  await page.getByRole('tab', { name: 'Read', exact: true }).click();
  await expect(page.locator('.wk-preview summary')).toHaveText('Details');
  expect(await savedBody(page)).toBe(body);
});
test('remote changes do not echo or enter undo history', async ({ page, context }) => {
  await seed(page, 'Original');
  const other = await context.newPage();
  await other.goto('/#/wiki/p');
  await expect(other.getByLabel('Page content')).toHaveText('Original');
  await page.getByLabel('Page content').fill('Changed remotely');
  await expect(other.getByLabel('Page content')).toHaveText('Changed remotely');
  await other.getByLabel('Page content').click();
  await other.keyboard.press('ControlOrMeta+z');
  await expect(other.getByLabel('Page content')).toHaveText('Changed remotely');
});
test('narrow dark layout keeps commands inside viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await seed(page);
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.getByLabel('Page content').click();
  await page.keyboard.type('/');
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  const rect = await menu.boundingBox();
  expect(rect && rect.x >= 0 && rect.x + rect.width <= 375 && rect.y + rect.height <= 700).toBeTruthy();
  await page.screenshot({ path: '/tmp/marmerlade-editor-narrow.png' });
});
test('table keyboard navigation, line breaks and undo grouping', async ({ page }) => {
  await seed(page);
  const content = page.getByLabel('Page content');
  await content.click();
  await page.keyboard.type('/table');
  await page.keyboard.press('Enter');
  await expect(content.locator('table')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).toHaveText('/table');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(content.locator('table')).toHaveCount(1);
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Second');
  await expect(content.locator('th').first()).toContainText('Second');
  await expect(content.locator('th').first().locator('br')).toHaveCount(1);
  for (let i = 0; i < 9; i++) await page.keyboard.press('Tab');
  await expect(content.locator('tr')).toHaveCount(4);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.type('Last');
  await expect(content.locator('tr').nth(2).locator('td').last()).toHaveText('Last');
  await page.getByRole('button', { name: 'Row options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete row', exact: true }).click();
  await expect(content.locator('tr')).toHaveCount(3);
});
test('typed wikilinks, autocomplete and heading commands', async ({ page }) => {
  await seed(page);
  const content = page.getByLabel('Page content');
  await content.click();
  await page.keyboard.type('[[Other|alias]]');
  await expect(content.locator('[data-wikilink="Other"]')).toHaveText('alias');
  await expect(content).toHaveText('alias');
  await page.keyboard.press('Enter');
  await page.keyboard.type('[[Ot');
  await expect(page.getByRole('option', { name: 'Other', exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(content.locator('[data-wikilink="Other"]')).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.type('/h2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Section');
  await expect(content.locator('h2')).toHaveText('Section');
  await expect.poll(() => savedBody(page)).toContain('[[Other|alias]]');
});

test('table handles target the chosen row and column, clear preserves structure', async ({ page }) => {
  await seed(page, '| Name | Value |\n| --- | --- |\n| First | One |\n| Second | Two |');
  const content = page.getByLabel('Page content');
  await content.locator('td').first().click();
  await page.getByRole('button', { name: 'Row 3 options', exact: true }).click();
  await expect(content.locator('tr').nth(2).locator('.selectedCell')).toHaveCount(2);
  await expect(content.locator('tr').nth(1).locator('.selectedCell')).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Clear row', exact: true }).click();
  await expect(content.locator('tr')).toHaveCount(3);
  await expect(content).toContainText('First');
  await expect(content).not.toContainText('Second');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content).toContainText('Second');
  await page.getByRole('button', { name: 'Column 2 options', exact: true }).click();
  await expect(content.locator('.selectedCell')).toHaveCount(3);
  await page.getByRole('menuitem', { name: 'Insert column right', exact: true }).click();
  await expect(content.locator('tr').first().locator('th')).toHaveCount(3);
  await expect(content.locator('tr').nth(1).locator('td').nth(1)).toHaveText('One');
  await page.getByRole('button', { name: 'Column 2 options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete column', exact: true }).click();
  await expect(content).not.toContainText('One');
  await expect(content).toContainText('First');
});

test('edge buttons append rows and columns and table deletion is undoable', async ({ page }) => {
  await seed(page, '| A | B |\n| --- | --- |\n| One | Two |');
  const content = page.getByLabel('Page content');
  await content.locator('td').first().click();
  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  await expect(content.locator('tr')).toHaveCount(3);
  await page.getByRole('button', { name: 'Add column', exact: true }).click();
  await expect(content.locator('tr').first().locator('th')).toHaveCount(3);
  await expect(content.locator('tr').nth(1).locator('td').nth(1)).toHaveText('Two');
  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete table', exact: true }).click();
  await expect(content.locator('table')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Table controls' })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(content.locator('table')).toHaveCount(1);
});

test('table menus support keyboard navigation, Escape and dismiss outside', async ({ page }) => {
  await seed(page, '| A | B |\n| --- | --- |\n| One | Two |');
  await expect(page.getByRole('toolbar', { name: 'Table controls' })).toHaveCount(0);
  await page.getByLabel('Page content').locator('td').first().click();
  const handle = page.getByRole('button', { name: 'Row 2 options', exact: true });
  await handle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Insert row above', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Insert row below', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(handle).toBeFocused();
  await page.getByLabel('Page title').click();
  await expect(page.getByRole('toolbar', { name: 'Table controls' })).toHaveCount(0);
});

test('narrow table menus stay visible through horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await seed(page, '| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n| One | Two | Three | Four | Five |');
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.getByLabel('Page content').locator('td').first().click();
  await page.getByRole('button', { name: 'Column options', exact: true }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 375 && bounds.y >= 0 && bounds.y + bounds.height <= 700).toBeTruthy();
  await page.keyboard.press('Escape');
  const dimensions = await page.locator('.tableWrapper').evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return { scroll: element.scrollWidth, width: element.clientWidth, offset: element.scrollLeft };
  });
  expect(dimensions.scroll).toBeGreaterThan(dimensions.width);
  expect(dimensions.offset).toBeGreaterThan(0);
  const toolbar = await page.getByRole('toolbar', { name: 'Table controls' }).boundingBox();
  expect(toolbar && toolbar.x >= 0 && toolbar.x + toolbar.width <= 375).toBeTruthy();
  await page.screenshot({ path: '/tmp/marmerlade-confluence-narrow.png' });
});

test('page links are managed from the node menu and the dock title menu', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Linked to API', exact: true }).click();
  await page.getByRole('button', { name: 'Unlink from API', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Link to node', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'API', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Linked to API', exact: true })).toBeVisible();

  await page.goto('/#/node/a');
  await page.getByRole('button', { name: 'Open page', exact: true }).click();
  await page.getByRole('button', { name: 'Pages on this node', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Other', exact: true }).click();
  await expect(page.getByLabel('Page title')).toHaveValue('Other');
  await page.getByRole('button', { name: 'Pages on this node', exact: true }).click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Pages on this node', exact: true })).toBeFocused();
});
