import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('', { url: 'https://merfolk.test' });
for (const key of ['window', 'document', 'navigator', 'Node', 'HTMLElement', 'Element', 'MutationObserver', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: Reflect.get(dom.window, key), configurable: true });
}
const { Editor } = await import('@tiptap/core');
const { editorExtensions, requiresSource } = await import('../src/wiki/extensions.ts');
const editor = new Editor({ extensions: editorExtensions(), contentType: 'markdown', content: '' });
const fixtures = [
  '# Title\n\n**bold** and *italic* and ~~gone~~ and `code`\n\n> Quote\n\n- One\n- Two',
  '[[API]] and [[Cache|the cache]]\n\n{{diagram}}\n\n{{diagram}}',
  '| Left | Right |\n| :--- | ---: |\n| a \\| b | **bold** |\n| x<br>y | [[Cache\\|alias]] |',
  '- [x] Done\n- [ ] Pending\n\n```ts\nconst x = 1;\n```\n\n![Alt](https://example.com/image.png)',
];
for (const source of fixtures) {
  editor.commands.setContent(source, { contentType: 'markdown' });
  const before = editor.getJSON();
  const markdown = editor.getMarkdown();
  editor.commands.setContent(markdown, { contentType: 'markdown' });
  assert.deepEqual(editor.getJSON(), before, markdown);
  assert.equal(requiresSource(markdown), false, markdown);
}
editor.commands.setContent('[[Cache|alias]]\n\n{{diagram}}', { contentType: 'markdown' });
assert.equal(editor.getJSON().content?.[0].content?.[0].attrs?.target, 'Cache');
assert.equal(editor.getJSON().content?.[0].content?.[0].attrs?.alias, 'alias');
assert.equal(editor.getJSON().content?.[1].type, 'diagramEmbed');
editor.commands.setContent('');
editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: true });
assert.equal(editor.getJSON().content?.[0].content?.length, 3);
editor.commands.addRowAfter();
assert.equal(editor.getJSON().content?.[0].content?.length, 4);
editor.commands.deleteRow();
assert.ok(editor.getJSON().content?.[0].content?.[0].content?.every((cell) => cell.type === 'tableHeader'));
editor.commands.addColumnAfter();
assert.equal(editor.getJSON().content?.[0].content?.[0].content?.length, 4);
editor.commands.deleteTable();
assert.equal(editor.getJSON().content?.[0].type, 'paragraph');
assert.equal(requiresSource('<details><summary>More</summary>Hidden</details>'), true);
assert.equal(requiresSource('<!-- preserve comment -->'), true);
assert.equal(requiresSource('```html\n<div>code</div>\n```'), false);
editor.destroy();
console.log('PASS: rich editor Markdown round trips and table operations');
