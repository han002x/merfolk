import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { CellSelection, TableMap, cellAround, findTable } from '@tiptap/pm/tables';
import type { Transaction } from '@tiptap/pm/state';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

type Axis = 'row' | 'column';
type MenuState = { kind: Axis | 'table'; anchor: HTMLElement };
type Handle = { position: number; center: number; size: number };
type Geometry = {
  left: number; right: number; top: number; bottom: number; width: number;
  clip: { left: number; right: number; top: number; bottom: number };
  rows: Handle[]; columns: Handle[]; row: number; column: number;
};

function measure(editor: Editor): Geometry | null {
  if (editor.isDestroyed || !editor.isInitialized) return null;
  const { selection } = editor.state;
  const table = findTable(selection.$from);
  if (!table) return null;
  const dom = editor.view.nodeDOM(table.pos);
  const element = dom instanceof HTMLTableElement ? dom : dom instanceof Element ? dom.querySelector('table') : null;
  const root = editor.view.dom.closest('.wk-page-content') ?? editor.view.dom.closest('.wk-rich-editor');
  if (!element || !root) return null;
  const rect = element.getBoundingClientRect();
  const bounds = root.getBoundingClientRect();
  const clip = { left: Math.max(8, bounds.left), right: Math.min(innerWidth - 8, bounds.right), top: Math.max(8, bounds.top), bottom: Math.min(innerHeight - 8, bounds.bottom) };
  if (rect.bottom < clip.top || rect.top > clip.bottom) return null;
  const map = TableMap.get(table.node);
  const cell = selection instanceof CellSelection ? selection.$anchorCell : cellAround(selection.$from);
  if (!cell) return null;
  const active = map.findCell(cell.pos - table.start);
  const rows = Array.from(element.rows).map((row, i) => {
    const r = row.getBoundingClientRect();
    return { position: table.start + map.map[i * map.width], center: r.top + r.height / 2, size: r.height };
  });
  const columns = Array.from(element.rows[0]?.cells ?? []).map((cell, i) => {
    const r = cell.getBoundingClientRect();
    return { position: table.start + map.map[i], center: r.left + r.width / 2, size: r.width };
  });
  return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, clip, rows, columns, row: active.top, column: active.left };
}

function TableMenu({ menu, close, editor }: { menu: MenuState; close: () => void; editor: Editor }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const stop = autoUpdate(menu.anchor, element, () => {
      void computePosition(menu.anchor, element, { placement: 'bottom-start', strategy: 'fixed', middleware: [offset(6), flip(), shift({ padding: 8 })] }).then(({ x, y }) => {
        element.style.left = `${x}px`; element.style.top = `${y}px`;
      });
    });
    element.querySelector('button')?.focus();
    return stop;
  }, [menu]);
  const run = (command: () => void) => { command(); close(); editor.commands.focus(); };
  const clear = () => {
    const selection = editor.state.selection;
    if (!(selection instanceof CellSelection)) return;
    const tr = editor.state.tr;
    selection.forEachCell((cell, pos) => {
      tr.replaceWith(tr.mapping.map(pos + 1), tr.mapping.map(pos + cell.nodeSize - 1), editor.schema.nodes.paragraph.create());
    });
    editor.view.dispatch(tr);
  };
  const items = menu.kind === 'row' ? [
    { label: 'Insert row above', action: () => { editor.commands.addRowBefore(); } },
    { label: 'Insert row below', action: () => { editor.commands.addRowAfter(); } },
    { label: 'Clear row', action: clear },
    { label: 'Delete row', action: () => { editor.commands.deleteRow(); }, danger: true },
  ] : menu.kind === 'column' ? [
    { label: 'Insert column left', action: () => { editor.commands.addColumnBefore(); } },
    { label: 'Insert column right', action: () => { editor.commands.addColumnAfter(); } },
    { label: 'Clear column', action: clear },
    { label: 'Delete column', action: () => { editor.commands.deleteColumn(); }, danger: true },
  ] : [
    { label: 'Select table', action: () => {
      const table = findTable(editor.state.selection.$from);
      if (!table) return;
      const map = TableMap.get(table.node);
      editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, table.start + map.map[0], table.start + map.map[map.map.length - 1])));
    } },
    { label: 'Delete table', action: () => { editor.commands.deleteTable(); }, danger: true },
  ];
  return <div ref={host} className="wk-table-menu" role="menu" aria-label={`${menu.kind === 'table' ? 'Table' : menu.kind === 'row' ? 'Row' : 'Column'} actions`} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); menu.anchor.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const buttons = Array.from(host.current?.querySelectorAll('button') ?? []);
      const current = buttons.findIndex((button) => button === document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }
  }}>
    {items.map((item) => <button key={item.label} type="button" role="menuitem" className={item.danger ? 'danger' : ''} onClick={() => run(item.action)}>{item.label}</button>)}
  </div>;
}

export default function TableControls({ editor }: { editor: Editor }) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setGeometry(measure(editor)));
    };
    const transaction = ({ transaction }: { transaction: Transaction }) => {
      if (editor.isFocused) setVisible(true);
      if (transaction.docChanged) setMenu(null);
      update();
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('.wk-table-ui, .wk-table-menu')) return;
      setMenu(null);
      setVisible(!!event.target.closest('.tiptap table'));
    };
    editor.on('transaction', transaction);
    editor.on('create', update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    document.addEventListener('pointerdown', outside);
    const observer = new ResizeObserver(update);
    const root = editor.options.element;
    if (root instanceof HTMLElement) observer.observe(root);
    update();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      editor.off('transaction', transaction); editor.off('create', update);
      window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update);
      document.removeEventListener('pointerdown', outside);
    };
  }, [editor]);
  if (!geometry || !visible) return null;
  const g = geometry;
  const select = (axis: Axis, position: number) => {
    const $cell = editor.state.doc.resolve(position);
    editor.view.dispatch(editor.state.tr.setSelection(axis === 'row' ? CellSelection.rowSelection($cell) : CellSelection.colSelection($cell)));
  };
  const open = (kind: Axis | 'table', anchor: HTMLElement, position?: number) => {
    if (kind !== 'table') {
      const at = position ?? (kind === 'row' ? g.rows[g.row]?.position : g.columns[g.column]?.position);
      if (at === undefined) return;
      select(kind, at);
    }
    setMenu({ kind, anchor });
  };
  const append = (axis: Axis) => {
    const last = axis === 'row' ? g.rows.at(-1) : g.columns.at(-1);
    if (!last) return;
    editor.commands.setTextSelection(last.position + 2);
    if (axis === 'row') editor.chain().focus().addRowAfter().run();
    else editor.chain().focus().addColumnAfter().run();
  };
  const toolbarLeft = Math.max(g.clip.left, Math.min(g.left, g.clip.right - 250));
  const toolbarTop = Math.max(g.clip.top, Math.min(g.bottom + 32, g.clip.bottom - 38));
  return createPortal(<>
    <div className="wk-table-ui" onKeyDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.preventDefault()}>
      {g.top - 20 >= g.clip.top && g.columns.map((column, i) => column.center >= g.clip.left && column.center <= g.clip.right && <button type="button" className="wk-table-grip column" key={`c${i}`} aria-label={`Column ${i + 1} options`} aria-haspopup="menu" aria-expanded={menu?.kind === 'column' && menu.anchor.getAttribute('aria-label') === `Column ${i + 1} options`} title={`Column ${i + 1}`} style={{ left: column.center - Math.min(column.size - 4, 40) / 2, top: g.top - 18, width: Math.min(column.size - 4, 40) }} onClick={(event) => open('column', event.currentTarget, column.position)}>•••</button>)}
      {g.rows.map((row, i) => row.center >= g.clip.top && row.center <= g.clip.bottom && <button type="button" className="wk-table-grip row" key={`r${i}`} aria-label={`Row ${i + 1} options`} aria-haspopup="menu" aria-expanded={menu?.kind === 'row' && menu.anchor.getAttribute('aria-label') === `Row ${i + 1} options`} title={`Row ${i + 1}`} style={{ left: Math.max(g.clip.left, g.left - 20), top: row.center - 14 }} onClick={(event) => open('row', event.currentTarget, row.position)}>⋮</button>)}
      {g.bottom + 24 < g.clip.bottom && <button type="button" className="wk-table-add row" aria-label="Add row" title="Add row" style={{ top: g.bottom + 3, left: Math.max(g.left, g.clip.left), width: Math.min(g.right, g.clip.right) - Math.max(g.left, g.clip.left) }} onClick={() => append('row')}>+</button>}
      {g.right + 24 < g.clip.right && <button type="button" className="wk-table-add column" aria-label="Add column" title="Add column" style={{ top: Math.max(g.top, g.clip.top), left: g.right + 3, height: Math.min(g.bottom, g.clip.bottom) - Math.max(g.top, g.clip.top) }} onClick={() => append('column')}>+</button>}
      <div className="wk-table-toolbar" role="toolbar" aria-label="Table controls" style={{ left: toolbarLeft, top: toolbarTop }}>
        <button type="button" aria-label="Table options" aria-haspopup="menu" onClick={(event) => open('table', event.currentTarget)}><span aria-hidden="true">▦</span><span className="wk-table-caret">⌄</span></button>
        <span className="wk-table-toolbar-divider" />
        <button type="button" aria-label="Row options" aria-haspopup="menu" aria-expanded={menu?.kind === 'row'} onClick={(event) => open('row', event.currentTarget)}>Rows <span className="wk-table-caret">⌄</span></button>
        <button type="button" aria-label="Column options" aria-haspopup="menu" aria-expanded={menu?.kind === 'column'} onClick={(event) => open('column', event.currentTarget)}>Columns <span className="wk-table-caret">⌄</span></button>
      </div>
    </div>
    {menu && <TableMenu menu={menu} close={() => setMenu(null)} editor={editor} />}
  </>, document.body);
}
