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
const BODY = '# Launch\n\n<!-- open warmly -->\n\n---\n\n## System\n\n{{diagram}}\n\n---\n\n```mermaid\nflowchart TD\n  x --> y\n```';
async function seed(page: Page, hash = '/#/slides/d?node=a') {
  await page.addInitScript(({ body }) => {
    if (!localStorage.getItem('marmerlade.diagram')) localStorage.setItem('marmerlade.diagram', JSON.stringify({ version: 3, diagram: {
      nodes: [
        { id: 'a', label: 'API', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, deckIds: ['d'] },
        { id: 'b', label: 'DB', shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 200 } },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
      pages: [], decks: [{ id: 'd', title: 'Launch', body, updatedAt: 1 }],
    } }));
  }, { body: BODY });
  await page.goto(hash);
  if (/\/#\/slides\/[^?]+/.test(hash) && !hash.includes('slide=')) await page.getByRole('tab', { name: 'Source', exact: true }).click();
}
const savedBody = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('marmerlade.diagram') ?? '{}').diagram?.decks.find((d: { id: string }) => d.id === 'd')?.body);

test('edit a deck as Markdown beside its slides', async ({ page }) => {
  await seed(page);
  const strip = page.getByRole('list', { name: 'Slides' });
  await expect(page.getByLabel('Deck title')).toHaveValue('Launch');
  await expect(strip.locator('.sl-slide')).toHaveCount(3);
  await expect(strip.locator('.sl-slide').nth(0)).toContainText('Launch');
  await expect(strip.locator('.sl-slide').nth(0)).not.toContainText('open warmly');
  // the linked node's live diagram, and a Mermaid fence
  await expect(strip.locator('.sl-slide').nth(1).locator('[data-embed] svg')).toContainText('DB');
  await expect(strip.locator('.sl-slide').nth(2).locator('[data-mermaid] svg')).toBeVisible();

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n\n---\n\nThanks');
  await expect(strip.locator('.sl-slide')).toHaveCount(4);
  await expect(strip.locator('.sl-slide').nth(3)).toContainText('Thanks');
  await expect.poll(() => savedBody(page)).toContain('Thanks');
  await page.reload();
  await expect(page.getByRole('list', { name: 'Slides' }).locator('.sl-slide')).toHaveCount(4);
  await expect(page.getByRole('navigation', { name: 'Slide decks' }).getByRole('link', { name: 'Launch' })).toHaveAttribute('aria-current', 'page');
});

test('present a deck with the keyboard', async ({ page }) => {
  await seed(page);
  await page.getByRole('link', { name: 'Present', exact: true }).click();
  await expect(page).toHaveURL(/#\/slides\/d\?node=a&slide=1$/);
  const stage = page.locator('.sl-stage');
  await expect(stage).toContainText('Launch');
  const box = (await stage.locator('.sl-slide').boundingBox())!;
  expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.01);

  await page.keyboard.press('n');
  await expect(page.locator('.sl-notes-text')).toHaveText('open warmly');
  await expect(page.locator('.sl-next .sl-slide')).toContainText('System');
  await expect(page.getByLabel('Elapsed time')).toHaveText(/^00:0\d$/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/slide=2$/);
  await expect(stage).toContainText('System');
  await expect(stage.locator('[data-embed] svg')).toContainText('API');
  await expect(page.locator('.sl-notes-text')).toHaveText('');
  await page.keyboard.press('End');
  await expect(page.getByLabel('Slide number')).toHaveText('3 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/slide=3$/);
  await page.keyboard.press('Home');
  await expect(page.getByLabel('Slide number')).toHaveText('1 / 3');
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/slide=2$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/slides\/d\?node=a$/);
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await expect(page.locator('.cm-content')).toBeVisible();

  // a slide's number presents from that slide
  await page.getByRole('link', { name: 'Present from slide 3', exact: true }).click();
  await expect(page.getByLabel('Slide number')).toHaveText('3 / 3');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.sl-print .sl-slide')).toHaveCount(3);
  await expect(page.locator('.sl-stage')).toBeHidden();
});

test('slide tools edit the Markdown', async ({ page }) => {
  await seed(page);
  const strip = page.getByRole('list', { name: 'Slides' });
  const slides = strip.locator('.sl-slide');
  const current = strip.locator('> li[aria-current]');
  const action = async (slide: number, name: string) => {
    await page.getByRole('button', { name: `Slide ${slide} actions`, exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  await expect(current.locator('.sl-number')).toHaveText('1');

  // clicking a slide takes the caret to its source
  await slides.nth(1).click({ position: { x: 5, y: 5 } });
  await expect(current.locator('.sl-number')).toHaveText('2');
  await page.keyboard.type('Intro\n\n');
  await expect(slides.nth(1)).toContainText('Intro');

  await action(2, 'Duplicate');
  await expect(slides).toHaveCount(4);
  await expect(slides.nth(2)).toContainText('Intro');
  await expect(current.locator('.sl-number')).toHaveText('3');
  await action(3, 'Move up');
  await action(2, 'Move up');
  await expect(slides.nth(0)).toContainText('Intro');
  await expect(slides.nth(1)).toContainText('Launch');
  await expect(page.getByRole('button', { name: 'Slide 1 actions', exact: true })).toBeVisible();
  await action(1, 'Delete slide');
  await expect(slides).toHaveCount(3);
  await expect(slides.nth(0)).toContainText('Launch');

  // a new slide after the first, written straight away
  await action(1, 'Add slide after');
  await expect(slides).toHaveCount(4);
  await page.keyboard.type('## Agenda');
  await expect(slides.nth(1)).toHaveText('Agenda');
  await page.getByRole('toolbar', { name: 'Slide tools' }).getByRole('button', { name: 'Table', exact: true }).click();
  await expect(slides.nth(1).locator('table')).toHaveCount(1);
  await page.getByRole('button', { name: 'New slide', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Blank', exact: true }).click();
  await expect(slides).toHaveCount(5);
  await expect(current.locator('.sl-number')).toHaveText('3');

  // edits are editor changes: undo takes the new slide back
  await page.keyboard.press('ControlOrMeta+z');
  await expect(slides).toHaveCount(4);
  await expect.poll(() => savedBody(page)).toContain('## Agenda\n\n| Column | Column |');
  // Present starts from the slide being written
  await expect(page.getByRole('link', { name: 'Present', exact: true })).toHaveAttribute('href', /slide=2$/);
});

test('design tools: shapes, text boxes, style and fonts', async ({ page }) => {
  await seed(page);
  const strip = page.getByRole('list', { name: 'Slides' });
  const first = strip.locator('.sl-slide').nth(0);
  const insert = async (name: string) => {
    await page.getByRole('toolbar', { name: 'Slide tools' }).getByRole('button', { name, exact: true }).click();
  };
  const pick = async (menu: string, name: string) => {
    if (menu === 'Style') {
      await page.getByRole('tab', { name: 'Style', exact: true }).click();
      await page.getByRole('region', { name: 'Slide style' }).getByRole('button', { name, exact: true }).click();
      return;
    }
    await page.getByRole('button', { name: menu, exact: true }).click();
    const items = page.getByRole('menu', { name: menu });
    await items.getByLabel(name, { exact: true }).or(items.getByText(name, { exact: true })).click();
  };

  // a shape lands selected, with its style bar
  await insert('Rounded rectangle');
  const shape = first.locator('.box.round');
  await expect(shape).toHaveText('Shape');
  await expect(shape).toHaveClass(/selected/);
  await expect(page.getByRole('toolbar', { name: 'Shape' })).toBeVisible();
  await expect.poll(() => savedBody(page)).toContain('<div class="box round" style="left:35%;top:35%;width:30%;height:30%">Shape</div>');

  // drag to move, drag the corner to resize: the Markdown follows
  const frame = (await first.boundingBox())!;
  let at = (await shape.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 - frame.width * 0.2, at.y + at.height / 2 - frame.height * 0.1, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => savedBody(page)).toMatch(/left:15(\.\d)?%;top:25(\.\d)?%;width:30%;height:30%/);
  at = (await shape.boundingBox())!;
  await page.mouse.move(at.x + at.width - 3, at.y + at.height - 3);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width - 3 + frame.width * 0.1, at.y + at.height - 3 + frame.height * 0.1, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => savedBody(page)).toMatch(/width:40(\.\d)?%;height:40(\.\d)?%/);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => savedBody(page)).toMatch(/left:16(\.\d)?%/);

  await pick('Object style', 'Fill: #f6d6cf');
  await pick('Object style', 'Border: #c8442b');
  await pick('Object style', 'Font: hand');
  await pick('Object style', 'Size: L');
  await expect(shape).toHaveClass(/hand/);
  await expect(shape).toHaveCSS('background-color', 'rgb(246, 214, 207)');
  await expect(shape).toHaveCSS('border-top-color', 'rgb(200, 68, 43)');
  await expect.poll(() => savedBody(page)).toContain('background:#f6d6cf;border-color:#c8442b;font-size:1.5em">Shape');

  // its text is written in the source
  await page.getByRole('button', { name: 'Edit text', exact: true }).click();
  await page.keyboard.type('Core ');
  await expect(shape).toHaveText('Core Shape');

  await insert('Text box');
  await expect(page.getByRole('toolbar', { name: 'Text box' })).toBeVisible();
  await expect(first.locator('.box')).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(first.locator('.box')).toHaveCount(1);
  await expect(page.getByRole('toolbar', { name: 'Text box', exact: true })).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Slide tools' })).toBeVisible();

  // slide style and deck fonts are directives in the Markdown
  await pick('Style', 'Slide background: #d4e2f0');
  await pick('Style', 'Centered');
  await pick('Style', 'Deck heading font: serif');
  await pick('Style', 'Deck text font: mono');
  await expect(first).toHaveCSS('background-color', 'rgb(212, 226, 240)');
  await expect(first).toHaveClass(/lead/);
  await expect(first).toHaveClass(/font-mono/);
  await expect(strip.locator('.sl-slide').nth(1)).toHaveClass(/head-serif/);
  await expect(strip.locator('.sl-slide').nth(1)).not.toHaveCSS('background-color', 'rgb(212, 226, 240)');
  await expect.poll(() => savedBody(page)).toMatch(/^---\nheadingFont: serif\nfont: mono\n---\n\n<!-- _backgroundColor: #d4e2f0 -->\n<!-- _class: lead -->\n\n# Launch/);

  // presenting shows the same slide, objects in place and not editable
  await page.getByRole('link', { name: 'Present', exact: true }).click();
  const shown = page.locator('.sl-stage .box.round');
  await expect(shown).toHaveText('Core Shape');
  await expect(shown).not.toHaveClass(/selected/);
  const stage = (await page.locator('.sl-stage > .sl-slide').boundingBox())!;
  const placed = (await shown.boundingBox())!;
  expect(Math.abs((placed.x - stage.x) / stage.width - 0.16)).toBeLessThan(0.01);
  expect(Math.abs(placed.width / stage.width - 0.4)).toBeLessThan(0.01);
});

test('objects: lines, images, turning, layering, guides, any colour', async ({ page }) => {
  await seed(page);
  const strip = page.getByRole('list', { name: 'Slides' });
  const first = strip.locator('.sl-slide').nth(0);
  const insert = async (name: string) => {
    await page.getByRole('toolbar', { name: 'Slide tools' }).getByRole('button', { name, exact: true }).click();
  };
  const order = async (name: string) => {
    await page.getByRole('button', { name: 'Object style', exact: true }).click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };

  // a rectangle dragged near the middle snaps to it, with guides showing the way
  await insert('Rectangle');
  const rect = first.locator('.box.rect');
  const frame = (await first.boundingBox())!;
  let at = (await rect.boundingBox())!;
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2 + frame.width * 0.2, at.y + at.height / 2, { steps: 3 });
  await expect(first.locator('.sl-guide')).toHaveCount(2);
  await page.mouse.move(frame.x + frame.width * 0.505, frame.y + frame.height * 0.495, { steps: 3 });
  await expect(first.locator('.sl-guide.v')).toBeVisible();
  await expect(first.locator('.sl-guide.h')).toBeVisible();
  await page.mouse.up();
  await expect(first.locator('.sl-guide')).toHaveCount(0);
  await expect.poll(() => savedBody(page)).toContain('<div class="box rect" style="left:35%;top:35%;width:30%;height:30%">');

  // the knob above turns it; Shift keeps to 15° steps
  at = (await rect.boundingBox())!;
  const centre = { x: at.x + at.width / 2, y: at.y + at.height / 2 };
  await page.mouse.move(centre.x, at.y - 18);
  await page.mouse.down();
  await page.keyboard.down('Shift');
  await page.mouse.move(centre.x + 60, centre.y - 34, { steps: 4 });
  await page.keyboard.up('Shift');
  await page.mouse.up();
  await expect.poll(() => savedBody(page)).toContain('height:30%;transform:rotate(60deg)">Shape');
  await order('Straighten');
  await expect.poll(() => savedBody(page)).not.toContain('rotate');

  // any colour, not only the swatches
  await page.getByRole('button', { name: 'Object style', exact: true }).click();
  await page.getByLabel('Fill: custom').fill('#12ab34');
  await expect(rect).toHaveCSS('background-color', 'rgb(18, 171, 52)');
  await page.keyboard.press('Escape');

  // lines and arrows carry no text; an arrow is drawn over the rectangle until sent back
  await insert('Arrow');
  await expect(page.getByRole('toolbar', { name: 'Shape' }).getByRole('button', { name: 'Edit text' })).toHaveCount(0);
  await insert('Line');
  await expect(first.locator('.box')).toHaveCount(3);
  await order('Send to back');
  await expect(first.locator('.box').nth(0)).toHaveClass(/line/);
  await expect(first.locator('.box.line')).toHaveClass(/selected/);
  await order('Bring to front');
  await expect(first.locator('.box').nth(2)).toHaveClass(/line/);
  await expect.poll(() => savedBody(page)).toMatch(/box rect[^\n]*\n\n<div class="box arrow"[^\n]*\n\n<div class="box line"/);

  page.once('dialog', (dialog) => void dialog.accept('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 4 2%22/%3E'));
  await insert('Image from link');
  await expect(page.getByRole('toolbar', { name: 'Image' })).toBeVisible();
  await expect(first.locator('.box.image img')).toHaveCount(1);
  const picture = (await first.locator('.box.image').boundingBox())!;
  expect(Math.abs(picture.width / frame.width - 0.4)).toBeLessThan(0.01);
});

test('slides: layouts, drag to reorder, themes and transitions', async ({ page }) => {
  // Keep all three slides visible during the native drag between them.
  await page.setViewportSize({ width: 1280, height: 1200 });
  await seed(page);
  const strip = page.getByRole('list', { name: 'Slides' });
  const slides = strip.locator('.sl-slide');
  await page.getByRole('button', { name: 'New slide', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Two columns', exact: true }).click();
  await expect(slides).toHaveCount(4);
  await expect(slides.nth(1).locator('.box')).toHaveText(['Left', 'Right']);
  await page.getByRole('button', { name: 'New slide', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Section', exact: true }).click();
  await expect(slides.nth(2)).toHaveClass(/lead/);
  await expect(slides.nth(2)).toHaveClass(/invert/);

  // drag a slide by its number
  await strip.locator('.sl-tools').nth(2).dragTo(strip.locator('> li').nth(0));
  await expect(slides.nth(0)).toHaveText('Section');
  await expect(slides.nth(1)).toContainText('Launch');
  await expect(strip.locator('> li[aria-current] .sl-number')).toHaveText('1');
  await expect.poll(() => savedBody(page)).toMatch(/^<!-- _class: lead invert -->\n\n# Section\n\n---\n\n# Launch/);

  const style = async (name: string) => {
    await page.getByRole('tab', { name: 'Style', exact: true }).click();
    await page.getByRole('region', { name: 'Slide style' }).getByRole('button', { name, exact: true }).click();
  };
  await style('Deck theme: Night');
  await expect(slides.nth(1)).toHaveCSS('background-color', 'rgb(31, 29, 26)');
  await expect(slides.nth(1)).toHaveCSS('color', 'rgb(242, 239, 233)');
  await style('Transition: slide');
  await expect.poll(() => savedBody(page)).toMatch(/^---\nbackgroundColor: "#1f1d1a"\ncolor: "#f2efe9"\ntransition: slide\n---\n\n/);

  await page.getByRole('link', { name: 'Present', exact: true }).click();
  await expect(page.locator('.sl-stage')).toHaveClass(/t-slide/);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Slide number')).toHaveText('2 / 5');
  await expect(page.locator('.sl-stage')).not.toHaveClass(/back/);
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.sl-stage')).toHaveClass(/back/);
});

test('a presenter window follows and drives the presentation', async ({ page, context }) => {
  await seed(page, '/#/slides/d?node=a&slide=1');
  await expect(page.getByLabel('Slide number')).toHaveText('1 / 3');
  const opened = context.waitForEvent('page');
  await page.keyboard.press('p');
  const speaker = await opened;
  await expect(speaker).toHaveURL(/slide=1&presenter=1$/);
  await expect(speaker.locator('.sl-notes-text')).toHaveText('open warmly');
  await expect(speaker.getByRole('button', { name: 'Presenter window' })).toHaveCount(0);

  await speaker.keyboard.press('ArrowRight');
  await expect(speaker).toHaveURL(/slide=2&presenter=1$/);
  await expect(page.getByLabel('Slide number')).toHaveText('2 / 3');
  await page.keyboard.press('End');
  await expect(speaker.getByLabel('Slide number')).toHaveText('3 / 3');
  await expect(page).toHaveURL(/node=a&slide=3$/);
});

test('presenter tools: overview, jump, blank, pointer', async ({ page }) => {
  await seed(page, '/#/slides/d?node=a&slide=1');
  const number = page.getByLabel('Slide number');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Next slide', exact: true }).click();
  await expect(number).toHaveText('2 / 3');

  await page.keyboard.press('o');
  const overview = page.getByRole('list', { name: 'All slides' });
  await expect(overview.locator('.sl-slide')).toHaveCount(3);
  await expect(overview.getByRole('button', { name: 'Go to slide 2', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/slide=2$/);
  await overview.getByRole('button', { name: 'Go to slide 3', exact: true }).click();
  await expect(overview).toHaveCount(0);
  await expect(number).toHaveText('3 / 3');
  await page.keyboard.press('o');
  await page.keyboard.press('Escape');
  await expect(overview).toHaveCount(0);
  await expect(page).toHaveURL(/slide=3$/);

  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await expect(number).toHaveText('1 / 3');
  await page.keyboard.press('Enter');
  await expect(number).toHaveText('2 / 3');
  await page.keyboard.press('Backspace');
  await expect(number).toHaveText('1 / 3');

  await page.keyboard.press('b');
  await expect(page.getByRole('button', { name: 'Show slide', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Show slide', exact: true })).toHaveCount(0);
  await expect(number).toHaveText('1 / 3');

  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Pointer', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('.sl-stage').evaluate((el) => getComputedStyle(el).cursor)).toContain('url(');
  await page.getByRole('button', { name: 'Exit presentation', exact: true }).click();
  await expect(page).toHaveURL(/#\/slides\/d\?node=a$/);
});

test('decks: create, link to a node, export, delete', async ({ page }) => {
  await seed(page, '/#/slides');
  await expect(page.getByRole('heading', { name: 'Decks' })).toBeVisible();
  await page.getByRole('button', { name: 'New deck', exact: true }).first().click();
  await page.getByLabel('Deck title').fill('Roadmap');
  await page.getByRole('button', { name: 'Link to node', exact: true }).click();
  await page.getByRole('menuitem', { name: 'DB', exact: true }).click();
  await expect(page).toHaveURL(/node=b$/);
  await expect(page.getByRole('button', { name: 'Linked to DB', exact: true })).toBeVisible();

  await page.goto('/#/slides/d?node=a');
  await page.getByRole('button', { name: 'Deck actions', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export Markdown', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('launch.md');
  const text = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
  expect(text).toContain('marp: true');
  expect(text).toContain('a --> b');
  expect(text).not.toContain('{{diagram}}');

  page.on('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Deck actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete deck', exact: true }).click();
  await expect(page).toHaveURL(/#\/slides$/);
  await expect(page.getByRole('main').getByRole('link', { name: /Launch/ })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: /Roadmap/ })).toBeVisible();
});

test('the canvas shows a node\'s deck in the Slides tab', async ({ page, context }) => {
  await seed(page, '/');
  const panel = page.getByRole('tabpanel', { name: 'Slides' });
  // nothing selected: the toolbar opens the tab on the list of decks
  await page.getByRole('button', { name: 'Slides', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Slides', exact: true })).toHaveAttribute('aria-selected', 'true');
  await panel.getByRole('link', { name: 'Launch' }).click();
  await expect(panel.getByLabel('Deck title')).toHaveValue('Launch');
  await expect(page.locator('.react-flow__node.selected')).toContainText('API');
  await expect(panel.locator('.sl-slide')).toHaveCount(3);
  await expect(panel.locator('.sl-slide').nth(1).locator('[data-embed] svg')).toContainText('DB');

  // a node's own button creates its deck the first time
  const db = page.locator('.react-flow__node', { hasText: 'DB' });
  await db.hover();
  await db.getByRole('button', { name: 'Open slides', exact: true }).click();
  await expect(panel.getByLabel('Deck title')).toHaveValue('DB');
  await expect(db.getByRole('button', { name: 'Open slides', exact: true })).toHaveClass(/has-page/);
  await expect(db.getByRole('button', { name: 'Open page', exact: true })).not.toHaveClass(/has-page/);

  // written as Markdown here, shown as slides
  await panel.getByRole('tab', { name: 'Markdown', exact: true }).click();
  await panel.locator('.cm-content').click();
  await page.keyboard.type('# Storage\n\n---\n\nReplicas');
  await panel.getByRole('tab', { name: 'Slides', exact: true }).click();
  await expect(panel.locator('.sl-slide')).toHaveText(['Storage', 'Replicas']);

  // decks on a node: link another, switch, unlink
  await panel.getByRole('button', { name: 'Decks on this node', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Launch', exact: true }).click();
  await expect(panel.getByLabel('Deck title')).toHaveValue('Launch');
  await panel.getByRole('button', { name: 'Decks on this node', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Unlink from DB', exact: true }).click();
  await expect(panel.getByLabel('Deck title')).toHaveValue('DB');

  // K does the same from the keyboard; the tree lists the deck
  await page.locator('.react-flow__node', { hasText: 'API' }).click();
  await page.keyboard.press('k');
  await expect(panel.getByLabel('Deck title')).toHaveValue('Launch');
  await page.getByRole('tab', { name: 'Tree', exact: true }).click();
  await page.locator('.mf-tree-page', { hasText: 'DB' }).click();
  await expect(panel.getByLabel('Deck title')).toHaveValue('DB');

  // the full editor and the presentation are one click away, in the slides window
  let opened = context.waitForEvent('page');
  await panel.getByRole('button', { name: 'Open in slides', exact: true }).click();
  const slides = await opened;
  await expect(slides).toHaveURL(/#\/slides\/deck\w+\?node=b$/);
  await expect(slides.locator('.cm-content')).toContainText('Replicas');
  await panel.getByRole('link', { name: 'Present from slide 2', exact: true }).click();
  await expect(slides).toHaveURL(/node=b&slide=2$/);
  await expect(slides.locator('.sl-stage')).toContainText('Replicas');
});

test('canvas text edits stay in place, preserve line breaks and survive reload', async ({ page }) => {
  await seed(page);
  await page.getByRole('tab', { name: 'Style', exact: true }).click();
  await page.getByRole('toolbar', { name: 'Slide tools' }).getByRole('button', { name: 'Text box', exact: true }).click();
  const box = page.locator('.sl-sheet .box');
  await box.dblclick();
  const text = page.getByRole('textbox', { name: 'Object text' });
  await expect(text).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Style', exact: true })).toHaveAttribute('aria-selected', 'true');
  await text.fill('<Launch> & learn\nSecond line');
  await page.keyboard.press('Escape');
  await expect(text).toHaveCount(0);
  await expect(box).toContainText('<Launch> & learn');
  await expect(box.locator('br')).toHaveCount(1);
  await expect.poll(() => savedBody(page)).toContain('&lt;Launch&gt; &amp; learn<br>Second line</div>');
  await page.keyboard.press('Control+z');
  await expect(box).toHaveText('Text');
  await page.keyboard.press('Control+Shift+z');
  await expect(box).toContainText('<Launch> & learn');
  await page.reload();
  await expect(page.locator('.sl-sheet .box')).toContainText('Second line');
  await expect(page.locator('.sl-sheet .box br')).toHaveCount(1);
});

test('canvas duplicate and history keep object content and styles', async ({ page }) => {
  await seed(page);
  const tools = page.getByRole('toolbar', { name: 'Slide tools' });
  await tools.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await page.getByRole('combobox', { name: 'Object font', exact: true }).selectOption('serif');
  await page.getByRole('combobox', { name: 'Object font size', exact: true }).selectOption('1.5');
  await page.getByRole('button', { name: 'Align text right', exact: true }).click();
  await page.locator('.sl-sheet').first().focus();
  await page.keyboard.press('Control+d');
  const boxes = page.locator('.sl-sheet .box');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.last()).toHaveText('Shape');
  await expect(boxes.last()).toHaveClass(/serif/);
  await expect(boxes.last()).toHaveCSS('text-align', 'right');
  const textPosition = await boxes.last().evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const text = range.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return (text.left - box.left) / box.width;
  });
  expect(textPosition).toBeGreaterThan(0.5);
  await expect.poll(() => savedBody(page)).toContain('left:37%;top:37%;width:30%;height:30%;font-size:1.5em;text-align:right');
  await tools.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(boxes).toHaveCount(1);
  await tools.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(boxes).toHaveCount(2);
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' appended');
  await tools.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.cm-content')).not.toContainText('appended');
  await expect(boxes).toHaveCount(2);
});

test('canvas edge and corner handles resize with fixed anchors and Shift proportions', async ({ page }) => {
  await seed(page);
  await page.getByRole('toolbar', { name: 'Slide tools' }).getByRole('button', { name: 'Rectangle', exact: true }).click();
  await expect(page.locator('.sl-handle')).toHaveCount(8);
  const stage = (await page.locator('.sl-sheet .sl-slide').first().boundingBox())!;
  const pullHandle = async (name: string, dx: number, dy: number) => {
    const at = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + dx, at.y + at.height / 2 + dy, { steps: 4 });
    await page.mouse.up();
  };
  await pullHandle('Resize left', -stage.width * 0.1, 0);
  await expect.poll(() => savedBody(page)).toContain('left:25%;top:35%;width:40%;height:30%');
  await page.keyboard.down('Shift');
  await pullHandle('Resize top left', -stage.width * 0.1, -stage.height * 0.075);
  await page.keyboard.up('Shift');
  await expect.poll(() => savedBody(page)).toContain('left:15%;top:27.5%;width:50%;height:37.5%');
  await page.keyboard.press('Control+z');
  await expect.poll(() => savedBody(page)).toContain('left:25%;top:35%;width:40%;height:30%');
});

test('canvas keyboard selection cycles objects and text editing protects Delete', async ({ page }) => {
  await seed(page);
  const tools = page.getByRole('toolbar', { name: 'Slide tools' });
  await tools.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await tools.getByRole('button', { name: 'Text box', exact: true }).click();
  const boxes = page.locator('.sl-sheet .box');
  await page.keyboard.press('Tab');
  await expect(boxes.first()).toHaveClass(/selected/);
  await page.keyboard.press('Shift+Tab');
  await expect(boxes.last()).toHaveClass(/selected/);
  await page.keyboard.press('Enter');
  const text = page.getByRole('textbox', { name: 'Object text' });
  await expect(text).toBeFocused();
  await page.keyboard.press('Delete');
  await page.keyboard.type('New ');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Line ');
  await expect(boxes).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(boxes.last()).toContainText('New');
  await expect(boxes.last().locator('br')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.sl-selection')).toHaveCount(0);
  await page.keyboard.press('Delete');
  await expect(boxes).toHaveCount(2);
});

test('editing objects on a later slide keeps the active slide and saves there', async ({ page }) => {
  await seed(page);
  await page.locator('.sl-sheet').nth(1).click({ position: { x: 30, y: 30 } });
  await page.getByRole('toolbar', { name: 'Slide tools' }).getByRole('button', { name: 'Text box', exact: true }).click();
  const second = page.locator('.sl-sheet').nth(1);
  await expect(second.locator('.box')).toHaveClass(/selected/);
  await second.locator('.box').dblclick();
  await page.getByRole('textbox', { name: 'Object text' }).fill('Second slide text');
  await page.keyboard.press('Escape');
  await expect(second.locator('.box')).toHaveText('Second slide text');
  await expect(page.locator('.sl-strip > li').nth(1)).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Control+d');
  await expect(second.locator('.box')).toHaveCount(2);
  await expect(page.locator('.sl-sheet').first().locator('.box')).toHaveCount(0);
});

test('canceling a canvas drag restores geometry without adding a history entry', async ({ page }) => {
  await seed(page);
  const tools = page.getByRole('toolbar', { name: 'Slide tools' });
  await tools.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const box = page.locator('.sl-sheet .box');
  const before = (await box.boundingBox())!;
  await expect.poll(() => savedBody(page)).toContain('left:35%;top:35%;width:30%;height:30%');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 50, before.y + before.height / 2 + 30, { steps: 4 });
  await page.locator('.sl-sheet').first().dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  const after = (await box.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y);
  await expect(page.locator('.sl-guide')).toHaveCount(0);
  await tools.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(box).toHaveCount(0);
});
