import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.getByRole('button', { name: 'More actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Appearance' })).toBeVisible();
}
async function seed(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('marmerlade.diagram')) return;
    localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram: {
      nodes: [{ id: 'a', label: 'API', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, style: { stroke: '#ff0000', fontFamily: 'serif', sloppiness: 2, strokeWidth: 4 }, pageIds: ['p'], deckIds: ['d'] }], edges: [],
      pages: [{ id: 'p', title: 'Notes', body: '# Heading\n\n{{diagram}}', updatedAt: 1 }],
      decks: [{ id: 'd', title: 'Deck', body: '---\ncolor: red\nfont: serif\n---\n\n# Launch\n\n<!-- _backgroundColor: pink -->\n\n<!-- keep this note -->\n\n<div class="box rect mono" style="left:12.345%;top:20%;width:30%;height:40%;color:red">Box</div>', updatedAt: 1 }],
    } }));
  });
  await page.goto('/');
}

test('presets restyle existing content, local overrides work and survive reload', async ({ page }) => {
  await seed(page);
  await open(page);
  for (const name of ['Paper', 'Night Paper', 'Clean', 'Blueprint', 'Terminal', 'Sepia', 'Classic', 'Halloween']) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Clean', exact: true }).click();
  await page.getByRole('button', { name: 'Close appearance' }).click();
  const node = page.locator('.mf-node').first();
  await expect(node).toHaveCSS('font-family', /Inter/);
  await node.click();
  await page.getByRole('button', { name: 'Stroke #c8442b', exact: true }).click();
  await expect(page.locator('.mf-outline-ink').first()).toHaveCSS('stroke', 'rgb(200, 68, 43)');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('marmerlade.diagram'))).toContain('#c8442b');
  await page.reload();
  await expect(page.locator('.mf-outline-ink').first()).toHaveCSS('stroke', 'rgb(200, 68, 43)');
  await open(page);
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Close appearance' }).click();
  await expect(page.locator('.mf-outline-ink').first()).toHaveCSS('stroke', 'rgb(159, 214, 173)');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram);
  expect(saved.nodes[0].style.strokeWidth).toBe(4);
  expect(saved.decks[0].body).toContain('left:12.345%');
  expect(saved.decks[0].body).toContain('<!-- keep this note -->');
  expect(saved.decks[0].body).not.toContain('color:red');
});

test('custom edits persist across presets and synchronize to wiki and slides', async ({ page, context }) => {
  await seed(page); await open(page);
  await page.getByRole('button', { name: 'Blueprint', exact: true }).click();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('Content font', { exact: true }).selectOption('serif');
  await page.getByLabel('Canvas', { exact: true }).fill('#172030');
  await page.getByRole('combobox', { name: 'Wiki icon symbol', exact: true }).selectOption('notebook');
  await page.getByLabel('Wiki icon color', { exact: true }).fill('#45d7be');
  await page.getByRole('combobox', { name: 'Slides icon symbol', exact: true }).selectOption('film');
  await page.getByLabel('Slides icon color', { exact: true }).fill('#ee77aa');
  const wiki = await context.newPage(); await wiki.goto('/#/wiki/p?node=a');
  await expect(wiki.locator('html')).toHaveAttribute('data-appearance', 'custom');
  const wikiIcon = wiki.getByRole('navigation', { name: 'Wiki pages' }).locator('[data-document-icon="wiki"]');
  await expect(wikiIcon).toHaveAttribute('data-icon', 'notebook');
  await expect(wikiIcon).toHaveCSS('color', 'rgb(69, 215, 190)');
  const slides = await context.newPage(); await slides.goto('/#/slides/d');
  const slidesIcon = slides.getByRole('navigation', { name: 'Slide decks' }).locator('[data-document-icon="slides"]');
  await expect(slidesIcon).toHaveAttribute('data-icon', 'film');
  await expect(slidesIcon).toHaveCSS('color', 'rgb(238, 119, 170)');
  await wiki.getByRole('tab', { name: 'Read', exact: true }).click();
  await expect(wiki.locator('[data-embed] svg')).toBeVisible();
  const old = await wiki.locator('[data-embed]').getAttribute('data-shown');
  await page.getByRole('button', { name: 'Terminal', exact: true }).click();
  await expect(wiki.locator('html')).toHaveAttribute('data-appearance', 'terminal');
  await expect(wiki.locator('[data-embed]')).not.toHaveAttribute('data-shown', old ?? '');
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await expect(page.getByLabel('Canvas', { exact: true })).toHaveValue('#172030');
  await expect(page.getByLabel('Content font', { exact: true })).toHaveValue('serif');

  await page.reload(); await open(page);
  await expect(page.getByRole('combobox', { name: 'Wiki icon symbol', exact: true })).toHaveValue('notebook');
  await expect(page.getByLabel('Slides icon color', { exact: true })).toHaveValue('#ee77aa');
  await page.getByLabel('Reset custom from preset').selectOption('sepia');
  await expect(page.getByLabel('Canvas', { exact: true })).toHaveValue('#f5efdf');
  await page.reload(); await open(page);
  await expect(page.getByLabel('Canvas', { exact: true })).toHaveValue('#f5efdf');
  await expect(slidesIcon).toHaveAttribute('data-icon', 'deck');
  await expect(wikiIcon).toHaveAttribute('data-icon', 'page');
  await expect(slides.locator('.sl-slide').first()).toHaveCSS('background-color', 'rgb(245, 239, 223)');
  await expect(slides.locator('.sl-slide .wk-preview').first()).toHaveCSS('font-family', /Georgia/);
});

test('legacy preference migration, narrow dialog and keyboard focus', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('marmerlade.theme', 'dark'));
  await seed(page);
  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'night-paper');
  await page.setViewportSize({ width: 375, height: 700 });
  await open(page);
  const dialog = page.getByRole('dialog');
  const rect = await dialog.boundingBox();
  expect(rect && rect.x >= 0 && rect.x + rect.width <= 375).toBeTruthy();
  await page.getByRole('button', { name: 'Custom', exact: true }).click();
  await page.getByLabel('Texture', { exact: true }).selectOption('grid');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'More actions', exact: true })).toBeFocused();
  await page.keyboard.press('t');
  await expect(dialog).toBeVisible();
});
