import { test as base, expect } from '@playwright/test';
const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});
async function start(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByText('New diagram', { exact: true }).click();
  await page.getByRole('button', { name: 'New sequence', exact: true }).click();
  await expect(page.getByLabel('Sequence Mermaid source')).toBeVisible();
}
test('native sequence edits, folds, source validation and reload', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Participant API', exact: true }).click();
  await page.getByLabel('Participant name').fill('Gateway');
  await expect(page.getByLabel('Sequence Mermaid source')).toHaveValue(/participant API as Gateway/);
  await page.getByRole('button', { name: '+ Message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Message Message', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Message Query', exact: true }).click();
  await page.getByLabel('Message text').fill('Fetch records');
  await expect(page.getByRole('button', { name: 'Message Fetch records', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fold alt', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Message Response', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Sequence Mermaid source')).toHaveValue(/Response/);
  const valid = await page.getByLabel('Sequence Mermaid source').inputValue();
  await page.getByLabel('Sequence Mermaid source').fill('sequenceDiagram\nunsupported nonsense');
  await expect(page.getByRole('alert')).toContainText('Line 2');
  await expect(page.getByRole('button', { name: 'Message Fetch records', exact: true })).toBeVisible();
  await page.getByLabel('Sequence Mermaid source').fill(valid);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('merfolk.diagram') ?? '{}').document?.diagram?.participants[1]?.label)).toBe('Gateway');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('merfolk.diagram') ?? '{}').document?.diagram?.events.find((e: { kind: string }) => e.kind === 'fragment')?.collapsed)).toBe(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Participant Gateway', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unfold alt', exact: true })).toBeVisible();
});
test('unannotated source maps repeated messages and native nested insertion once', async ({ page }) => {
  await start(page);
  await page.getByLabel('Sequence Mermaid source').fill('sequenceDiagram\nparticipant A\nparticipant B\nA->>B: First\nA->>B: Second\nopt One\nA->>A: Self\nend\nopt Two\nB-->>A: Return\nend');
  await page.getByRole('button', { name: 'Message Second', exact: true }).click();
  await expect(page.getByLabel('Message text')).toHaveValue('Second');
  await page.getByLabel('Message text').fill('Changed');
  await expect(page.getByRole('button', { name: 'Message First', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Message Self', exact: true }).click();
  await page.getByRole('button', { name: '+ Message', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Message Message', exact: true })).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('participant wiki pages sync, embed and navigate to canvas', async ({ page, context }) => {
  await start(page);
  await page.getByRole('button', { name: 'Participant API', exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Create page', exact: true }).click();
  const wiki = await popup;
  await expect(wiki.getByLabel('Page title')).toHaveValue('API');
  await wiki.getByRole('tab', { name: 'Markdown', exact: true }).click();
  await wiki.locator('.cm-content').fill('{{diagram}}');
  await wiki.getByRole('tab', { name: 'Read', exact: true }).click();
  await expect(wiki.locator('.wk-preview .sq-drawing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open page', exact: true })).toBeVisible();
  await wiki.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.getByLabel('Participant name')).toHaveValue('API');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Participant API', exact: true })).toBeVisible();
  await wiki.close();
});
test('changing source switches document kinds and narrow dark sequence stays usable', async ({ page }) => {
  await start(page);
  await page.getByLabel('Sequence Mermaid source').fill('flowchart TD\nA[Start]\nA --> B[End]');
  await expect(page.locator('.mf-canvas')).toBeVisible();
  await page.getByText('New diagram', { exact: true }).click();
  await page.getByRole('button', { name: 'New sequence', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
  await expect(page.getByLabel('Sequence Mermaid source')).toBeVisible();
  await page.screenshot({ path: '/tmp/merfolk-sequence-narrow.png' });
});
