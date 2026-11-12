import { test, expect } from '@playwright/test';

for (const kind of ['sequence', 'ER', 'class'] as const) for (const annotated of [true, false]) {
  test(`${kind} ${annotated ? "generated" : "pasted"} source comments are no-ops and source edits undo together`, async ({ page }) => {
    await page.goto('/');
    await page.getByText('New diagram', { exact: true }).click();
    await page.getByRole('button', { name: kind === 'sequence' ? 'New sequence' : `New ${kind} diagram`, exact: true }).click();
    const editor = page.getByLabel(kind === 'sequence' ? 'Sequence Mermaid source' : 'Diagram Mermaid source', { exact: true });
    const historyLength = () => page.evaluate(async () => {
      const modulePath = '/src/store.ts';
      const { useDiagram } = await import(modulePath);
      return useDiagram.getState().history.length;
    });
    const initialHistory = await historyLength();
    if (!annotated) await editor.fill((await editor.inputValue()).split('\n').filter((line) => !line.includes('%% merfolk-id')).join('\n'));
    expect(await historyLength()).toBe(initialHistory);
    const original = await editor.inputValue();
    const before = await historyLength();
    await editor.fill(original + '\n%% first comment');
    await editor.fill(original + '\n%% second comment');
    expect(await historyLength()).toBe(before);
    const label = kind === 'sequence' ? 'Request' : kind === 'ER' ? 'places' : 'Animal';
    await editor.fill(original.replace(label, `${label}First`));
    await editor.fill(original.replace(label, `${label}Second`));
    await page.locator('button[aria-label="Undo"],button[title^="Undo"]').click();
    await expect(editor).toHaveValue(new RegExp(label));
    await expect(editor).not.toHaveValue(new RegExp(`${label}First|${label}Second`));
  });
}

test('wiki Canvas reveals a class through all folded namespace ancestors', async ({ page }) => {
  await page.goto('/');
  await page.getByText('New diagram', { exact: true }).click();
  await page.getByRole('button', { name: 'New class diagram', exact: true }).click();
  await page.getByLabel('Diagram Mermaid source').fill('classDiagram\nnamespace Outer {\nnamespace Inner {\nclass Animal\n}\n}');
  await page.getByRole('button', { name: 'Class Animal', exact: true }).locator('.st-card-head').click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Create page', exact: true }).click();
  const wiki = await popup;
  await expect(wiki.getByLabel('Page title')).toHaveValue('Animal');
  await page.getByRole('tab', { name: 'Outline', exact: true }).click();
  for (const label of ['Inner', 'Outer']) {
    await page.getByRole('button', { name: `▧ ${label}`, exact: true }).click();
    await page.getByRole('region', { name: 'Selected diagram element' }).getByRole('button', { name: 'Fold details', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: 'Class Animal', exact: true })).toHaveCount(0);
  await wiki.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Class Animal', exact: true })).toBeVisible();
  await expect(page.getByLabel('Class name', { exact: true })).toHaveValue('Animal');
  await page.getByRole('button', { name: '▧ Outer', exact: true }).click();
  await page.getByRole('region', { name: 'Selected diagram element' }).getByRole('button', { name: 'Fold details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Class Animal', exact: true })).toHaveCount(0);
  await wiki.getByRole('button', { name: 'Canvas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Class Animal', exact: true })).toBeVisible();
  await wiki.close();
});

test('inserting a flowchart edge keeps deleting connections independent', async ({ page }) => {
  await page.goto('/');
  await page.locator('.mf-canvas').waitFor();
  await page.evaluate(async () => {
    const storePath = '/src/store.ts'; const parserPath = '/src/mermaid/io.ts';
    const { useDiagram } = await import(storePath); const { parseMermaid } = await import(parserPath);
    useDiagram.getState().load(parseMermaid('flowchart TD\nA -->|old| B').diagram);
  });
  await page.getByLabel('Mermaid source', { exact: true }).fill('flowchart TD\nC -->|new| D\nA -->|old| B');
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Tree', exact: true }).click();
  await page.getByRole('button', { name: 'Select connection C → D', exact: true }).click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Select connection C → D', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Select connection A → B', exact: true })).toBeVisible();
});

test('remote wiki page linking preserves the selected node and page dock', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('merfolk.diagram', JSON.stringify({ version: 3, document: {
    diagram: { kind: 'flowchart', nodes: [
      { id: 'A', label: 'A', shape: 'rect', parentId: null, collapsed: false, position: { x: 40, y: 40 }, pageIds: ['p'] },
      { id: 'B', label: 'B', shape: 'rect', parentId: null, collapsed: false, position: { x: 250, y: 40 } },
    ], edges: [] }, pages: [{ id: 'p', title: 'Shared notes', body: 'Existing content', updatedAt: 1 }],
  } })));
  await page.goto('/#/node/A');
  await expect(page.locator('.react-flow__node[data-id="A"]')).toHaveClass(/selected/);
  await page.keyboard.press('w');
  await expect(page.getByLabel('Page title')).toHaveValue('Shared notes');
  const wiki = await context.newPage();
  await wiki.goto('/#/wiki/p?node=A');
  await wiki.getByLabel('Link to node', { exact: true }).selectOption('B');
  await expect.poll(() => page.evaluate(async () => {
    const modulePath = '/src/store.ts'; const { useDiagram } = await import(modulePath);
    return useDiagram.getState().diagram.nodes.find((n: { id: string }) => n.id === 'B')?.pageIds;
  })).toEqual(['p']);
  await expect(page.locator('.react-flow__node[data-id="A"]')).toHaveClass(/selected/);
  await expect(page.getByLabel('Page title')).toHaveValue('Shared notes');
  await wiki.close();
});
