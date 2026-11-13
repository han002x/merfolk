// Slide deck logic: splitting, notes, export, links, sync, save migration.
// Run with: node --experimental-strip-types scripts/slides.ts
import { PRESETS, isAppearance } from '../src/appearance.ts';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
// DOMPurify binds to a window at import time
const dom = new JSDOM('', { url: 'http://localhost/' });
(globalThis as { window?: unknown }).window = dom.window;
(globalThis as { localStorage?: unknown }).localStorage = dom.window.localStorage;
const { renderPage } = await import('../src/wiki/render.ts');
const { parseRoute, deckHref } = await import('../src/route.ts');
const { useDiagram } = await import('../src/store.ts');
const { readSaved, write } = await import('../src/persist.ts');
import { dragged, dragMode } from '../src/slides/drag.ts';
import { restyleDeck, duplicateBox, setBoxContent, LAYOUTS, moveSlide, orderBox, addBox, boxCaret, removeBox, setBox, setDeckStyle, setSlideStyle, slideBoxes, BLOCKS, deckFileName, editSlides, insertBlock, slideAt, slideCaret, slideStarts, splitSlides, toMarkdown } from '../src/slides.ts';
import { embedNode, nodesOfPage, orphanPages } from '../src/pages.ts';
import { fromMermaid, toMermaid } from '../src/mermaid/io.ts';
import type { DiagramNode } from '../src/types.ts';

const node = (id: string, label: string, extra: Partial<DiagramNode> = {}): DiagramNode => ({
  id, label, shape: 'rect', parentId: null, collapsed: false, position: { x: 0, y: 0 }, ...extra,
});

// ---- splitting ----
{
  const one = splitSlides('');
  assert.deepEqual(one, { frontMatter: '', slides: [{ body: '', notes: [], look: { lead: false, invert: false } }] }, 'an empty deck is one empty slide');

  const deck = splitSlides('# One\n\n---\n\n## Two\n\ntext\n\n---\n\nThree');
  assert.deepEqual(deck.slides.map((s) => s.body), ['# One', '## Two\n\ntext', 'Three']);

  const front = splitSlides('---\nmarp: true\ntheme: gaia\n---\n\n# One\n\n---\n\nTwo');
  assert.equal(front.frontMatter, 'marp: true\ntheme: gaia');
  assert.deepEqual(front.slides.map((s) => s.body), ['# One', 'Two']);

  const fenced = splitSlides('```md\na\n\n---\n\nb\n```\n\n---\n\nnext');
  assert.equal(fenced.slides.length, 2, 'a divider inside a fence is code');
  assert.ok(fenced.slides[0].body.includes('---'));

  const setext = splitSlides('Heading\n---\n\nbody');
  assert.equal(setext.slides.length, 1, 'text over --- is a heading, as in Marp');

  assert.equal(splitSlides('a\n\n***\n\nb').slides.length, 1, 'only --- breaks slides');
  assert.equal(splitSlides('a\r\n\r\n---\r\n\r\nb').slides.length, 2, 'CRLF');
  assert.equal(splitSlides('a\n\n---\n').slides.length, 2, 'a trailing divider opens an empty slide');
}

// ---- notes ----
{
  const { slides } = splitSlides(
    '# One\n\n<!-- say hello -->\n\n<!-- _class: lead -->\n\n---\n\nTwo <!-- inline --> more\n\n<!--\nline a\nline b\n-->',
  );
  assert.deepEqual(slides[0].notes, ['say hello'], 'directives are not notes');
  assert.equal(slides[0].body, '# One');
  assert.deepEqual(slides[1].notes, ['line a\nline b']);
  assert.ok(slides[1].body.includes('inline'), 'an inline comment stays in the text');
  assert.ok(!renderPage(slides[1].body, { nodes: [], pages: [] }).includes('inline'), '...and never renders');
}

// ---- slide tools: edits are edits to the Markdown ----
{
  const deck = '---\nmarp: true\n---\n\n# One\n\n<!-- n1 -->\n\n---\n\n## Two\n\n---\n\nThree';
  const bodies = (b: string) => splitSlides(b).slides.map((s) => s.body);
  assert.deepEqual(slideStarts(deck).map((at) => deck.slice(at).trim().split('\n')[0]), ['# One', '## Two', 'Three']);
  assert.equal(slideAt(deck, 0), 0, 'front matter belongs to the first slide');
  assert.equal(slideAt(deck, deck.indexOf('## Two') + 3), 1);
  assert.equal(slideAt(deck, deck.length), 2);
  assert.equal(deck.slice(slideCaret(deck, 1)).startsWith('## Two'), true);

  const added = editSlides(deck, 'add', 0);
  assert.deepEqual(bodies(added.body), ['# One', '', '## Two', 'Three']);
  assert.equal(added.at, 1);
  assert.equal(slideAt(added.body, added.caret), 1, 'the caret lands in the new slide');
  const typed = `${added.body.slice(0, added.caret)}## New${added.body.slice(added.caret)}`;
  assert.deepEqual(bodies(typed), ['# One', '## New', '## Two', 'Three'], 'typing there writes that slide');
  const tail = editSlides(deck, 'add', 2);
  assert.deepEqual(bodies(`${tail.body.slice(0, tail.caret)}End${tail.body.slice(tail.caret)}`), ['# One', '## Two', 'Three', 'End']);
  assert.ok(added.body.startsWith('---\nmarp: true\n---\n\n# One'), 'front matter stays on top');

  const copy = editSlides(deck, 'duplicate', 0);
  assert.deepEqual(bodies(copy.body), ['# One', '# One', '## Two', 'Three']);
  assert.deepEqual(splitSlides(copy.body).slides[1].notes, ['n1'], 'notes are copied with their slide');

  const down = editSlides(deck, 'down', 0);
  assert.deepEqual(bodies(down.body), ['## Two', '# One', 'Three']);
  assert.equal(down.at, 1);
  assert.equal(down.body.slice(down.caret).startsWith('# One'), true);
  assert.deepEqual(bodies(editSlides(deck, 'up', 2).body), ['# One', 'Three', '## Two']);
  assert.equal(editSlides(deck, 'up', 0).body, deck, 'the first slide cannot move up');
  assert.equal(editSlides(deck, 'down', 2).at, 2);

  const gone = editSlides(deck, 'remove', 2);
  assert.deepEqual(bodies(gone.body), ['# One', '## Two']);
  assert.equal(gone.at, 1);
  const last = editSlides('only', 'remove', 0);
  assert.deepEqual(bodies(last.body), [''], 'a deck keeps one slide');
  assert.deepEqual(bodies(editSlides('', 'add', 0).body), ['', '']);
  assert.deepEqual(bodies(editSlides('```\n---\n```', 'add', 0).body), ['```\n---\n```', ''], 'fences are not split');

  const put = insertBlock('# One\n\ntext here\n\n---\n\nTwo', 10, BLOCKS.Table);
  assert.equal(put.body, `# One\n\ntext here\n\n${BLOCKS.Table}\n\n---\n\nTwo`, 'a block goes after the caret line');
  assert.equal(put.body.slice(0, put.caret).endsWith(BLOCKS.Table), true);
  assert.equal(insertBlock('', 0, BLOCKS.Diagram).body, '{{diagram}}');
  assert.equal(insertBlock('a', 99, 'b').body, 'a\n\nb');
  for (const block of Object.values(BLOCKS)) assert.equal(splitSlides(block).slides.length, 1, block);
}

// ---- design: looks are Marp directives ----
{
  const deck = '---\nmarp: true\nbackgroundColor: "#fff8e7"\nfont: serif\nheadingFont: nope\n---\n\n# One\n\n---\n\n<!-- _class: lead invert -->\n<!-- _color: #c8442b -->\n\n## Two\n\n---\n\n<!-- backgroundColor: #111 -->\n\nThree\n\n---\n\nFour';
  const looks = splitSlides(deck).slides.map((s) => s.look);
  assert.deepEqual(looks[0], { lead: false, invert: false, background: '#fff8e7', font: 'serif', headingFont: undefined });
  assert.deepEqual([looks[1].lead, looks[1].invert, looks[1].color, looks[1].background], [true, true, '#c8442b', '#fff8e7']);
  assert.deepEqual([looks[2].lead, looks[2].color, looks[2].background], [false, undefined, '#111'], 'a _directive dresses one slide');
  assert.equal(looks[3].background, '#111', 'a plain directive carries on to later slides');
  assert.deepEqual(splitSlides(deck).slides.map((s) => s.notes.length), [0, 0, 0, 0], 'directives are not notes');

  const plain = '# One\n\n---\n\n## Two';
  const red = setSlideStyle(plain, 1, 'backgroundColor', '#f6d6cf');
  assert.equal(red, '# One\n\n---\n\n<!-- _backgroundColor: #f6d6cf -->\n\n## Two');
  assert.equal(setSlideStyle(red, 1, 'class', 'lead').split('---\n\n')[1], '<!-- _backgroundColor: #f6d6cf -->\n<!-- _class: lead -->\n\n## Two');
  assert.equal(splitSlides(red).slides[1].look.background, '#f6d6cf');
  assert.equal(splitSlides(red).slides[0].look.background, undefined);
  const blue = setSlideStyle(red, 1, 'backgroundColor', '#d4e2f0');
  assert.equal(blue.match(/_backgroundColor/g)?.length, 1, 'setting again replaces');
  assert.equal(setSlideStyle(setSlideStyle(blue, 1, 'class', 'lead'), 1, 'backgroundColor', null), '# One\n\n---\n\n<!-- _class: lead -->\n\n## Two');
  assert.equal(setSlideStyle(red, 1, 'backgroundColor', null), plain, 'clearing leaves no trace');

  const hand = setDeckStyle(plain, 'font', 'hand');
  assert.equal(hand, '---\nfont: hand\n---\n\n# One\n\n---\n\n## Two');
  assert.equal(splitSlides(hand).slides[1].look.font, 'hand');
  const both = setDeckStyle(setDeckStyle(hand, 'headingFont', 'mono'), 'font', 'serif');
  assert.equal(both.split('\n\n')[0], '---\nheadingFont: mono\nfont: serif\n---');
  assert.equal(setDeckStyle(setDeckStyle(both, 'font', null), 'headingFont', null), plain, 'an emptied front matter goes');
  assert.equal(setDeckStyle('---\nmarp: true\n---\n\nx', 'backgroundColor', '#fff').split('\n\n')[0], '---\nmarp: true\nbackgroundColor: "#fff"\n---');

  const out = toMarkdown({ id: 'd', title: '', body: both, updatedAt: 1 }, { nodes: [], edges: [] });
  assert.ok(out.includes('style: |\n  section { font-family: ui-serif, Georgia, serif; }\n  h1, h2, h3 { font-family: \'JetBrains Mono\''), out);
}

// ---- design: text boxes and shapes are HTML blocks ----
{
  const plain = '# One\n\n---\n\n## Two\n\n<!-- note -->';
  const added = addBox(plain, 1, 'round');
  assert.equal(added.body, '# One\n\n---\n\n## Two\n\n<!-- note -->\n\n<div class="box round" style="left:35%;top:35%;width:30%;height:30%">Shape</div>');
  assert.equal(added.box, 0);
  assert.deepEqual(slideBoxes(added.body, 0), []);
  assert.deepEqual(slideBoxes(added.body, 1), [{ shape: 'round', font: undefined, left: 35, top: 35, width: 30, height: 30,
    background: undefined, stroke: undefined, color: undefined, size: undefined, rotate: undefined }]);
  const two = addBox(added.body, 1);
  assert.equal(two.box, 1);
  assert.equal(slideBoxes(two.body, 1)[1].shape, undefined, 'no shape is a text box');
  assert.equal(splitSlides(two.body).slides.length, 2);
  assert.deepEqual(splitSlides(two.body).slides[1].notes, ['note']);
  assert.ok(renderPage(splitSlides(two.body).slides[1].body, { nodes: [], pages: [] })
    .includes('<div class="box round" style="left:35%;top:35%;width:30%;height:30%">Shape</div>'), 'boxes survive the sanitizer');

  const moved = setBox(two.body, 1, 0, { left: 12.345, top: -3, background: '#f6d6cf', stroke: '#c8442b', font: 'hand', size: 1.5 });
  assert.ok(moved.includes('<div class="box round hand" style="left:12.3%;top:-3%;width:30%;height:30%;background:#f6d6cf;border-color:#c8442b;font-size:1.5em">Shape</div>'), moved);
  assert.equal(slideBoxes(moved, 1)[1].left, 30, 'the other box is untouched');
  const cleared = setBox(moved, 1, 0, { background: undefined, font: undefined, shape: 'ellipse' });
  assert.ok(cleared.includes('<div class="box ellipse" style="left:12.3%;top:-3%;width:30%;height:30%;border-color:#c8442b;font-size:1.5em">'), cleared);
  const custom = '<div class="box mine rect" style="left:1%;top:2%;width:3%;height:4%;opacity:.5">A <b>b</b></div>';
  assert.equal(setBox(custom, 0, 0, { left: 9 }), '<div class="box rect mine" style="left:9%;top:2%;width:3%;height:4%;opacity:.5">A <b>b</b></div>', 'unknown classes and styles are kept');
  assert.equal(setBox(custom, 0, 3, { left: 9 }), custom);
  assert.deepEqual(slideBoxes('```html\n<div class="box" style="left:1%">x</div>\n```', 0), [], 'code is not an object');

  assert.equal(two.body.slice(boxCaret(two.body, 1, 1)!), 'Text</div>');
  assert.equal(removeBox(two.body, 1, 1), added.body);
  assert.equal(removeBox(added.body, 1, 0), plain);
  assert.equal(removeBox(addBox('', 0).body, 0, 0), '');

  const out = toMarkdown({ id: 'd', title: '', body: moved, updatedAt: 1 }, { nodes: [], edges: [] });
  assert.ok(out.includes('<div class="box round hand" style="position:absolute;box-sizing:border-box;display:grid;padding:.3em .6em;line-height:1.25;place-items:center;text-align:center;border:.09em solid #c8442b;border-radius:.6em;font-family:Kalam, \'Segoe Print\', cursive;left:12.3%;'), out);
  assert.equal(slideBoxes(out, 1).length, 2, 'an exported deck still opens with its objects');
}

// ---- more objects: lines, arrows, images, turning, layering ----
{
  const line = addBox('# A', 0, 'line').body;
  assert.ok(line.endsWith('<div class="box line" style="left:30%;top:50%;width:40%;height:0.8%"></div>'), line);
  const arrow = addBox(line, 0, 'arrow');
  assert.equal(arrow.box, 1);
  const image = addBox(arrow.body, 0, 'image', 'https://x.test/a.png?b=1&c="2"');
  assert.ok(image.body.endsWith('<div class="box image" style="left:30%;top:25%;width:40%;height:50%"><img src="https://x.test/a.png?b=1&amp;c=&quot;2&quot;" alt="" style="width:100%;height:100%;object-fit:contain"></div>'), image.body);
  assert.deepEqual(slideBoxes(image.body, 0).map((b) => b.shape), ['line', 'arrow', 'image']);
  assert.ok(renderPage(image.body, { nodes: [], pages: [] }).includes('<img src="https://x.test/a.png?b=1&amp;c=&quot;2&quot;" alt="" style="width:100%;height:100%;object-fit:contain">'), 'the picture survives the sanitizer');

  const turned = setBox(image.body, 0, 1, { rotate: 45.04 });
  assert.ok(turned.includes('width:40%;height:6%;transform:rotate(45deg)">'), turned);
  assert.equal(slideBoxes(turned, 0)[1].rotate, 45);
  assert.equal(slideBoxes(setBox(turned, 0, 1, { rotate: undefined }), 0)[1].rotate, undefined);
  assert.ok(!setBox(turned, 0, 1, { rotate: 0 }).includes('transform'));

  // paint order is source order
  const front = orderBox(image.body, 0, 0, 'front');
  assert.deepEqual(slideBoxes(front.body, 0).map((b) => b.shape), ['arrow', 'image', 'line']);
  assert.equal(front.box, 2);
  assert.ok(front.body.startsWith('# A\n\n<div class="box arrow"'), 'content around the objects stays put');
  const back = orderBox(front.body, 0, 2, 'back');
  assert.equal(back.body, image.body);
  assert.equal(back.box, 0);
  assert.equal(orderBox(image.body, 0, 9, 'front').body, image.body);
  const mixed = '<div class="box rect" style="left:1%">A</div>\n\ntext between\n\n<div class="box" style="left:2%">B</div>';
  assert.equal(orderBox(mixed, 0, 0, 'front').body, '<div class="box" style="left:2%">B</div>\n\ntext between\n\n<div class="box rect" style="left:1%">A</div>');

  const out = toMarkdown({ id: 'd', title: '', body: turned, updatedAt: 1 }, { nodes: [], edges: [] });
  assert.ok(out.includes('<div class="box line" style="position:absolute;box-sizing:border-box;background:currentColor;left:30%;'), out);
  assert.ok(out.includes('clip-path:polygon(0 33%,') && out.includes('transform:rotate(45deg)'), out);
  assert.ok(out.includes('<div class="box image" style="position:absolute;box-sizing:border-box;left:30%;'), out);
}

// ---- placing by hand: modes, snapping, turning ----
{
  const frame = { w: 1000, h: 500 };
  const box = { left: 20, top: 20, width: 20, height: 20 };
  assert.equal(dragMode(box, frame, { x: 395, y: 195 }, false), 'move', 'handles belong to a selected box');
  assert.equal(dragMode(box, frame, { x: 395, y: 195 }, true), 'resize');
  assert.equal(dragMode(box, frame, { x: 300, y: 150 }, true), 'move');
  assert.equal(dragMode(box, frame, { x: 300, y: 80 }, true), 'rotate');
  // turned a quarter, the corner that was bottom-right is now bottom-left
  assert.equal(dragMode({ ...box, rotate: 90 }, frame, { x: 255, y: 245 }, true), 'resize');

  const free = dragged('move', box, [], frame, { x: 0, y: 0 }, { x: 37, y: 20 });
  assert.deepEqual(free, { to: { left: 23.7, top: 24 }, guides: {} });
  // its centre comes within reach of the slide's centre: both axes snap
  const mid = dragged('move', box, [], frame, { x: 0, y: 0 }, { x: 195, y: 98 });
  assert.deepEqual(mid, { to: { left: 40, top: 40 }, guides: { x: 50, y: 50 } });
  // another object's left edge
  const other = dragged('move', box, [{ left: 60.5, top: 70, width: 10, height: 10 }], frame, { x: 0, y: 0 }, { x: 400, y: 0 });
  assert.equal(other.to.left, 60.5);
  assert.equal(other.guides.x, 60.5);
  assert.deepEqual(dragged('move', box, [], frame, { x: 0, y: 0 }, { x: 195, y: 98 }, true).guides, {}, 'Shift moves freely');

  assert.deepEqual(dragged('resize', box, [], frame, { x: 0, y: 0 }, { x: 100, y: 50 }).to, { width: 30, height: 30 });
  assert.deepEqual(dragged('resize', { ...box, shape: 'line' }, [], frame, { x: 0, y: 0 }, { x: 100, y: 50 }).to, { width: 30 });
  assert.equal(dragged('resize', box, [], frame, { x: 0, y: 0 }, { x: -900, y: 0 }).to.width, 1);
  const quarter = dragged('resize', { ...box, rotate: 90 }, [], frame, { x: 0, y: 0 }, { x: 0, y: 100 }).to;
  assert.ok(Math.abs(quarter.width! - 30) < 1e-9 && Math.abs(quarter.height! - 20) < 1e-9, 'a turned box grows along its own width');

  // the centre is at (300, 150): pull the knob round to the right, then down
  assert.equal(dragged('rotate', box, [], frame, { x: 300, y: 80 }, { x: 400, y: 150 }).to.rotate, 90);
  assert.equal(dragged('rotate', box, [], frame, { x: 300, y: 80 }, { x: 302, y: 80 }).to.rotate, undefined, 'near upright is upright');
  assert.equal(dragged('rotate', box, [], frame, { x: 300, y: 80 }, { x: 340, y: 60 }).to.rotate, 24);
  assert.equal(dragged('rotate', box, [], frame, { x: 300, y: 80 }, { x: 340, y: 60 }, true).to.rotate, 30, 'Shift turns in 15° steps');
}

// ---- slides: layouts, reordering, transitions ----
{
  const deck = '# One\n\n---\n\n## Two\n\n---\n\nThree';
  const bodies = (b: string) => splitSlides(b).slides.map((s) => s.body);
  assert.deepEqual(bodies(moveSlide(deck, 0, 2).body), ['## Two', 'Three', '# One']);
  assert.deepEqual(bodies(moveSlide(deck, 2, 0).body), ['Three', '# One', '## Two']);
  assert.equal(moveSlide(deck, 2, 0).at, 0);
  assert.equal(moveSlide(deck, 1, 1).body, deck);
  assert.equal(moveSlide(deck, 0, 9).at, 2);

  for (const [name, content] of Object.entries(LAYOUTS)) {
    const added = editSlides(deck, 'add', 0, content);
    assert.equal(splitSlides(added.body).slides.length, 4, name);
    assert.equal(added.body.slice(added.caret), `${content}\n\n---\n\n## Two\n\n---\n\nThree`, name);
  }
  const section = splitSlides(editSlides(deck, 'add', 0, LAYOUTS.Section).body).slides[1];
  assert.deepEqual([section.look.lead, section.look.invert, section.body], [true, true, '# Section']);
  assert.equal(slideBoxes(editSlides(deck, 'add', 0, LAYOUTS['Two columns']).body, 1).length, 2);

  const fade = setDeckStyle(deck, 'transition', 'fade');
  assert.ok(fade.startsWith('---\ntransition: fade\n---\n\n# One'));
  assert.deepEqual(splitSlides(fade).slides.map((s) => s.look.transition), ['fade', 'fade', 'fade']);
  assert.equal(splitSlides('---\ntransition: spin\n---\n\nx').slides[0].look.transition, undefined);
  assert.equal(setDeckStyle(fade, 'transition', null), deck);
  assert.deepEqual(parseRoute(deckHref('d', 'a', 2, true)), { kind: 'slides', id: 'd', nodeId: 'a', slide: 2, presenter: true });
}

// ---- canvas content and anchored resizing ----
{
  const source = '<div class="box rect hand custom" style="left:20%;top:20%;width:20%;height:20%;opacity:.5">A <b>bold</b> idea</div>';
  const edited = setBoxContent(source, 0, 0, 'New &amp; ready<br>Next');
  assert.ok(edited.endsWith('>New &amp; ready<br>Next</div>'));
  assert.ok(edited.includes('rect hand custom'), 'editing keeps the object style');
  const copy = duplicateBox(source, 0, 0);
  assert.equal(copy.box, 1);
  assert.deepEqual(slideBoxes(copy.body, 0).map((b) => [b.left, b.top]), [[20, 20], [22, 22]]);
  assert.equal(copy.body.match(/A <b>bold<\/b> idea/g)?.length, 2, 'duplicate preserves inline formatting');
  assert.equal(duplicateBox(source, 0, 3).body, source);
  const image = addBox('', 0, 'image', 'https://example.com/image.png').body;
  assert.equal(setBoxContent(image, 0, 0, 'text'), image, 'image content cannot be replaced with text');
  const aligned = setBox(source, 0, 0, { align: 'right' });
  assert.equal(slideBoxes(aligned, 0)[0].align, 'right');
  assert.ok(toMarkdown({ id: 'd', title: '', body: aligned, updatedAt: 1 }, { nodes: [], edges: [] }).includes('text-align:right'));

  const frame = { w: 1000, h: 500 };
  const box = { left: 20, top: 20, width: 20, height: 20 };
  assert.deepEqual(dragged('nw', box, [], frame, { x: 0, y: 0 }, { x: -100, y: -50 }).to,
    { width: 30, height: 30, left: 10, top: 10 }, 'the opposite corner stays anchored');
  assert.deepEqual(dragged('e', box, [], frame, { x: 0, y: 0 }, { x: 100, y: 80 }).to,
    { width: 30, height: 20 }, 'an edge handle changes only its own dimension');
  assert.deepEqual(dragged('se', box, [], frame, { x: 0, y: 0 }, { x: 100, y: 5 }, true).to,
    { width: 30, height: 30 }, 'Shift keeps the original aspect ratio');
  assert.deepEqual(dragged('se', box, [], frame, { x: 0, y: 0 }, { x: -100, y: 0 }, true).to,
    { width: 10, height: 10 }, 'Shift also supports shrinking along one axis');
  const rotated = dragged('se', { ...box, rotate: 90 }, [], frame, { x: 0, y: 0 }, { x: 0, y: 100 }).to;
  assert.equal(rotated.width, 30);
  assert.equal(rotated.left, 15);
  assert.equal(rotated.top, 30, 'rotated resizing keeps the opposite corner in place');
  const clamped = dragged('nw', box, [], frame, { x: 0, y: 0 }, { x: 900, y: 900 }).to;
  assert.deepEqual(clamped, { width: 1, height: 1, left: 39, top: 39 }, 'minimum size preserves the anchor');
}

// ---- rendering ----
{
  const nodes = [node('a', 'API'), node('g', 'Gateway')];
  const html = renderPage('{{diagram}}\n\n{{diagram:Gateway}}\n\n```mermaid\nflowchart TD\nx-->y\n```\n\n```js\n1\n```', { nodes, pages: [] });
  assert.ok(html.includes('data-embed=""'), html);
  assert.ok(html.includes('data-embed="Gateway"'), html);
  assert.ok(html.includes(`data-mermaid="${encodeURIComponent('flowchart TD\nx-->y')}"`), html);
  assert.ok(html.includes('<pre><code class="language-js">'), 'other fences stay code');
  assert.equal(embedNode('', nodes, 'a'), 'a');
  assert.equal(embedNode('gateway', nodes, 'a'), 'g', 'by label, any case');
  assert.equal(embedNode('g', nodes, 'a'), 'g', 'by id');
  assert.equal(embedNode('nope', nodes, 'a'), undefined, 'an unknown target draws nothing');
}

// ---- export ----
{
  const nodes = [node('a', 'API'), node('b', 'DB'), node('c', 'Cache')];
  const edges = [{ id: 'e1', source: 'a', target: 'b' }];
  const deck = { id: 'd', title: 'Launch "plan"', updatedAt: 1,
    body: '# [[API|The API]]\n\n{{diagram}}\n\n---\n\n{{diagram:Cache}}\n\n```\n{{diagram}} [[x]]\n```\n\n<!-- note -->' };
  const out = toMarkdown(deck, { nodes, edges }, 'a');
  assert.ok(out.startsWith('---\nmarp: true\ntitle: "Launch \\"plan\\""\n---\n\n# The API\n'), out);
  assert.ok(out.includes('```mermaid\nflowchart'), out);
  assert.ok(out.includes('a["API"]') && out.includes('a --> b'), out);
  assert.ok(out.includes('c["Cache"]'), out);
  assert.ok(out.includes('```\n{{diagram}} [[x]]\n```'), 'code is left alone');
  assert.ok(out.includes('<!-- note -->'), 'notes travel as comments');
  assert.equal(splitSlides(out).slides.length, 2, 'the export is still a two-slide deck');
  assert.ok(!out.includes('merfolk-'), 'no merfolk comments in exported diagrams');

  const kept = toMarkdown({ ...deck, body: '---\nmarp: true\ntitle: Mine\ntheme: gaia\n---\n\n# A' }, { nodes, edges });
  assert.ok(kept.startsWith('---\nmarp: true\ntitle: Mine\ntheme: gaia\n---\n\n# A'), kept);
  assert.equal(toMarkdown({ ...deck, body: '{{diagram:Nope}}\n\nx' }, { nodes, edges }).split('---\n\n')[1], 'x\n');
  assert.equal(deckFileName(deck), 'launch-plan.md');
  assert.equal(deckFileName({ ...deck, title: ' ' }), 'deck.md');
}

// ---- routes ----
{
  assert.deepEqual(parseRoute('#/slides'), { kind: 'slides', id: null });
  assert.deepEqual(parseRoute(deckHref('d 1', 'a', 3)), { kind: 'slides', id: 'd 1', nodeId: 'a', slide: 3 });
  assert.deepEqual(parseRoute(deckHref('d')), { kind: 'slides', id: 'd' });
  assert.deepEqual(parseRoute('#/slides/d?slide=0'), { kind: 'slides', id: 'd' });
  assert.deepEqual(parseRoute('#/wiki/p?slide=2'), { kind: 'wiki', id: 'p' }, 'pages have no slides');
}

// ---- store: decks link like pages, apart from them ----
{
  const st = () => useDiagram.getState();
  st().load({ nodes: [node('a', 'API'), node('b', 'DB')], edges: [] });
  const id = st().openDeck('a')!;
  assert.ok(id.startsWith('deck'));
  assert.equal(st().openDeck('a'), id, 'opening again creates nothing');
  assert.equal(st().decks[0].title, 'API');
  assert.deepEqual(st().nodes[0].deckIds, [id]);
  assert.equal(st().nodes[0].pageIds, undefined, 'a deck is not a page');
  assert.equal(st().pages.length, 0);

  st().linkDeck(id, 'b');
  assert.deepEqual(nodesOfPage(st().nodes, id, 'deckIds').map((n) => n.id), ['a', 'b']);
  const second = st().createDeckForNode('a')!;
  st().makeDefaultDeck(second, 'a');
  assert.deepEqual(st().nodes[0].deckIds, [second, id]);
  st().unlinkDeck(second, 'a');
  assert.deepEqual(orphanPages(st().nodes, st().decks, 'deckIds').map((d) => d.id), [second]);
  st().updateDeck(id, { body: '# Hi' });
  assert.equal(st().decks.find((d) => d.id === id)!.body, '# Hi');

  const page = st().openPage('a')!;
  st().deleteDeck(id);
  assert.ok(st().nodes.every((n) => !n.deckIds?.includes(id)));
  assert.deepEqual(st().nodes[0].pageIds, [page], 'deleting a deck leaves pages alone');
  assert.deepEqual(st().decks.map((d) => d.id), [second]);

  // another window's save: newer deck wins, node links follow
  st().applyRemote({
    nodes: [node('a', 'API', { deckIds: [second], pageIds: [page] }), node('b', 'DB')], edges: [],
    pages: st().pages,
    decks: [{ ...st().decks[0], body: 'remote', updatedAt: Date.now() + 1000 }],
  });
  assert.equal(st().decks[0].body, 'remote');
  assert.deepEqual(st().nodes[0].deckIds, [second]);
}

// ---- save: version 2 files load, version 3 keeps decks ----
{
  localStorage.setItem('merfolk.diagram', JSON.stringify({ version: 2, diagram: { nodes: [node('a', 'API')], edges: [], pages: [] } }));
  assert.deepEqual(readSaved()?.decks, [], 'a wiki-era save has no decks');
  write({ nodes: [node('a', 'API', { deckIds: ['d', 'd'] })], edges: [], decks: [{ id: 'd', title: 'D', body: 'x', updatedAt: 1 }] });
  assert.equal(JSON.parse(localStorage.getItem('merfolk.diagram')!).version, 3);
  const saved = readSaved()!;
  assert.deepEqual(saved.nodes[0].deckIds, ['d'], 'duplicate links collapse');
  assert.equal(saved.decks?.[0].body, 'x');
}

// ---- mermaid: deck links ride in a comment ----
{
  const text = toMermaid({ nodes: [node('a', 'API', { deckIds: ['d1', 'd2'], pageIds: ['p'] }), node('b', 'DB')], edges: [] });
  assert.ok(text.includes('%% merfolk-decks a ["d1","d2"]'), text);
  assert.ok(!/click a href .*d1/.test(text), 'the click link stays the wiki page');
  const back = fromMermaid(text);
  assert.deepEqual(back.nodes.find((n) => n.id === 'a')?.deckIds, ['d1', 'd2']);
  assert.deepEqual(back.nodes.find((n) => n.id === 'a')?.pageIds, ['p']);
  assert.equal(back.nodes.find((n) => n.id === 'b')?.deckIds, undefined);
}

// App appearance resets supported styling without editing examples or geometry.
{
  const body = '---\nfont: mono\ncolor: red\ntransition: fade\n---\n\n# Launch\n\n<!-- _class: lead invert -->\n\n<!-- remember this -->\n\n<div class="box rect hand" style="left:12.345%;top:20%;width:30%;height:40%;color:red;transform:rotate(12.5deg)">Text</div>\n\n```html\n<div class="box mono" style="color:red">Example</div>\n```';
  const reset = restyleDeck(body);
  assert.equal(splitSlides(reset).slides[0].look.lead, true);
  assert.equal(splitSlides(reset).slides[0].look.invert, false);
  assert.deepEqual(splitSlides(reset).slides[0].notes, ['remember this']);
  assert.ok(reset.includes('left:12.345%'));
  assert.ok(reset.includes('transform:rotate(12.5deg)'));
  assert.ok(reset.includes('```html\n<div class="box mono" style="color:red">Example</div>\n```'));
  assert.equal(restyleDeck(reset), reset);
  const exported = toMarkdown({ id: 'd', title: 'Launch', body: '# Hello', updatedAt: 1 }, { nodes: [], edges: [] }, undefined, PRESETS[2].style);
  assert.ok(exported.includes('backgroundColor: "#f7f8fa"'));
  assert.ok(exported.includes('section { font-family: Inter, system-ui, sans-serif; }'));
  assert.equal(isAppearance(PRESETS[0].style), true);
  assert.equal(isAppearance({ ...PRESETS[0].style, uiFont: ['sans'] }), false);
  assert.equal(isAppearance({ ...PRESETS[0].style, colors: { bg: '#fff' } }), false);
}

console.log('slides: ok');
