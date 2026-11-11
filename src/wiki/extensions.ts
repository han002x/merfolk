import { Node, mergeAttributes, InputRule } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import { Marked } from 'marked';

export const WikiLink = Node.create({
  name: 'wikiLink', group: 'inline', inline: true, atom: true,
  addAttributes: () => ({ target: { default: '' }, alias: { default: null } }),
  addInputRules() {
    return [new InputRule({
      find: /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]$/,
      handler: ({ state, range, match }) => {
        state.tr.replaceWith(range.from, range.to, this.type.create({ target: match[1].trim(), alias: match[2]?.trim() ?? null }));
      },
    })];
  },
  parseHTML: () => [{ tag: 'span[data-wikilink]', getAttrs: (el) => ({ target: el.getAttribute('data-wikilink'), alias: el.getAttribute('data-alias') }) }],
  renderHTML: ({ node, HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-wikilink': node.attrs.target, 'data-alias': node.attrs.alias, class: 'wl' }), node.attrs.alias || node.attrs.target],
  markdownTokenizer: {
    name: 'wikiLink', level: 'inline', start: (src) => src.indexOf('[['),
    tokenize(src) {
      const m = /^\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/.exec(src);
      return m ? { type: 'wikiLink', raw: m[0], target: m[1].trim(), alias: m[2]?.trim() ?? null } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: 'wikiLink', attrs: { target: token.target, alias: token.alias } }),
  renderMarkdown: (node) => `[[${node.attrs?.target}${node.attrs?.alias ? `|${node.attrs.alias}` : ''}]]`,
});

export const DiagramEmbed = Node.create({
  name: 'diagramEmbed', group: 'block', atom: true,
  parseHTML: () => [{ tag: 'div[data-diagram]' }],
  renderHTML: () => ['div', { 'data-diagram': '', class: 'wk-diagram-block' }, 'Diagram'],
  markdownTokenizer: {
    name: 'diagramEmbed', level: 'block', start: (src) => src.indexOf('{{diagram}}'),
    tokenize(src) {
      const m = /^\{\{diagram\}\}[ \t]*(?:\n|$)/.exec(src);
      return m ? { type: 'diagramEmbed', raw: m[0] } : undefined;
    },
  },
  parseMarkdown: () => ({ type: 'diagramEmbed' }),
  renderMarkdown: () => '{{diagram}}',
});

export function editorExtensions(diagram: typeof DiagramEmbed = DiagramEmbed) {
  return [
    StarterKit.configure({ underline: false, link: { openOnClick: false } }),
    Markdown, WikiLink, diagram,
    Table.extend({
      addProseMirrorPlugins() {
        return [...(this.parent?.() ?? []), new Plugin({
          appendTransaction(transactions, _old, state) {
            if (!transactions.some((transaction) => transaction.docChanged)) return null;
            const tr = state.tr;
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'table') return;
              let offset = pos + 1;
              node.forEach((row, _rowOffset, rowIndex) => {
                row.forEach((cell, cellOffset) => {
                  const type = rowIndex === 0 ? state.schema.nodes.tableHeader : state.schema.nodes.tableCell;
                  if (cell.type !== type) tr.setNodeMarkup(offset + 1 + cellOffset, type, cell.attrs);
                });
                offset += row.nodeSize;
              });
            });
            return tr.docChanged ? tr : null;
          },
        })];
      },
    }).configure({ resizable: false, renderWrapper: true }), TableRow,
    TableCell.extend({ content: 'paragraph' }), TableHeader.extend({ content: 'paragraph' }),
    TaskList, TaskItem.configure({ nested: true }), Image,
  ];
}

const inspector = new Marked();
export function requiresSource(body: string): boolean {
  let unsupported = false;
  inspector.walkTokens(inspector.lexer(body), (token) => {
    if (token.type === 'html' && !/^<br\s*\/?\s*>$/i.test(token.raw.trim())) unsupported = true;
  });
  return unsupported;
}
