import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { type ChainedCommands } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import Placeholder from '@tiptap/extension-placeholder';
import { DiagramEmbed, editorExtensions } from './extensions';
import Preview from './Preview';
import TableControls from './TableControls';
import { resolveLink } from '../pages';
import { useDiagram } from '../store';

interface Props {
  value: string;
  onChange: (value: string) => void;
  targets: () => string[];
  nodeId?: string;
  onPage: (id: string) => void;
  onNode?: (id: string) => void;
}
const EmbedContext = createContext<Pick<Props, 'nodeId' | 'onPage' | 'onNode'> | null>(null);
function DiagramView() {
  const context = useContext(EmbedContext);
  return <NodeViewWrapper contentEditable={false} className="wk-diagram-block">
    {context?.nodeId ? <Preview body="{{diagram}}" nodeId={context.nodeId} onPage={context.onPage} onNode={context.onNode} />
      : <span className="wk-empty-links">Link this page to a node to show its diagram.</span>}
  </NodeViewWrapper>;
}
const RichDiagram = DiagramEmbed.extend({
  addNodeView: () => ReactNodeViewRenderer(DiagramView),
});
const bubbleOptions = { placement: 'top', offset: 8, flip: true, shift: true } as const;
type Choice = { label: string; aliases: string; run: (chain: ChainedCommands) => ChainedCommands };
const commands: Choice[] = [
  { label: 'Text', aliases: 'paragraph', run: (e: ChainedCommands) => e.setParagraph() },
  ...([1, 2, 3] as const).map((level) => ({ label: `Heading ${level}`, aliases: `h${level} title`, run: (e: ChainedCommands) => e.setHeading({ level }) })),
  { label: 'Bullet list', aliases: 'ul unordered', run: (e: ChainedCommands) => e.toggleBulletList() },
  { label: 'Numbered list', aliases: 'ol ordered', run: (e: ChainedCommands) => e.toggleOrderedList() },
  { label: 'Checklist', aliases: 'todo task', run: (e: ChainedCommands) => e.toggleTaskList() },
  { label: 'Quote', aliases: 'blockquote', run: (e: ChainedCommands) => e.toggleBlockquote() },
  { label: 'Code block', aliases: 'pre snippet', run: (e: ChainedCommands) => e.toggleCodeBlock() },
  { label: 'Divider', aliases: 'horizontal rule hr', run: (e: ChainedCommands) => e.setHorizontalRule() },
  { label: 'Table', aliases: 'grid cells', run: (e: ChainedCommands) => e.insertTable({ rows: 3, cols: 3, withHeaderRow: true }) },
  { label: 'Diagram', aliases: 'embed canvas', run: (e: ChainedCommands) => e.insertContent({ type: 'diagramEmbed' }) },
];
type Suggestion = { from: number; to: number; query: string; kind: 'slash' | 'wiki'; x: number; y: number };

export default function Editor(props: Props) {
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const last = useRef(props.value);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [activeChoice, setActiveChoice] = useState({ query: '', index: 0 });
  const selected = activeChoice.query === suggestion?.query ? activeChoice.index : 0;
  const [link, setLink] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const dismissed = useRef<string | null>(null);
  const actions = useRef({ key: (_event: KeyboardEvent): boolean => false });
  const editor = useEditor({
    extensions: [
      ...editorExtensions(RichDiagram),
      Placeholder.configure({ placeholder: 'Write, or type / for commands…' }),
    ],
    content: props.value, contentType: 'markdown',
    editorProps: {
      attributes: { class: 'wk-prose', 'aria-label': 'Page content', 'aria-expanded': String(!!suggestion), 'aria-controls': suggestion ? 'wk-suggestions' : '', 'aria-activedescendant': suggestion ? `wk-choice-${selected}` : '' },
      handleKeyDown(view, event) {
        if (event.isComposing) return false;
        if (actions.current.key(event)) return true;
        if (event.key === 'Enter' && (view.state.selection.$from.parent.type.name === 'paragraph') && editor?.isActive('table')) {
          editor.commands.setHardBreak(); return true;
        }
        return false;
      },
      handleClick(_view, _pos, event) {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-wikilink]') : null;
        if (!target) return false;
        const name = target.dataset.wikilink ?? '';
        if (event.ctrlKey || event.metaKey) {
          const st = useDiagram.getState();
          const resolved = resolveLink(name, st.nodes, st.pages);
          const id = resolved.kind === 'page' ? resolved.page.id : resolved.kind === 'node' ? st.openPage(resolved.node.id) : st.createPage(name);
          if (id) latest.current.onPage(id);
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: e }) {
      const value = e.getMarkdown(); last.current = value;
      latest.current.onChange(value);
    },
    onTransaction({ editor: e }) {
      redraw((n) => n + 1);
      if (e.view.composing || !e.state.selection.empty || !e.isFocused || e.isActive('codeBlock') || e.isActive('code')) { setSuggestion(null); return; }
      const { $from, from } = e.state.selection;
      const text = $from.parent.textBetween(0, $from.parentOffset, '\n', '\ufffc');
      const slash = /^\/([\w -]*)$/.exec(text);
      const wiki = /\[\[([^\]\n]*)$/.exec(text);
      const match = slash ?? wiki;
      const signature = `${from}:${text}`;
      if (!match || dismissed.current === signature) { setSuggestion(null); return; }
      const pos = e.view.coordsAtPos(from);
      const next: Suggestion = { from: from - match[0].length, to: from, query: match[1], kind: slash ? 'slash' : 'wiki', x: pos.left, y: pos.bottom };
      setSuggestion(next);
    },
  });
  const choices: Choice[] = suggestion?.kind === 'wiki'
    ? props.targets().filter((name) => name.toLowerCase().includes(suggestion.query.toLowerCase())).sort((a, b) => Number(b.toLowerCase().startsWith(suggestion.query.toLowerCase())) - Number(a.toLowerCase().startsWith(suggestion.query.toLowerCase())) || a.localeCompare(b)).map((name) => ({ label: name, aliases: '', run: (e: ChainedCommands) => e.insertContent({ type: 'wikiLink', attrs: { target: name } }) }))
    : commands.filter((c) => `${c.label} ${c.aliases}`.toLowerCase().includes(suggestion?.query.toLowerCase() ?? '') && (!editor?.isActive('table') || c.label === 'Text') && (!editor || !suggestion || c.run(editor.can().chain().deleteRange({ from: suggestion.from, to: suggestion.to })).run()));
  const apply = (index: number) => {
    const choice = choices[index];
    if (!editor || !suggestion || !choice) return;
    choice.run(editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; }).deleteRange({ from: suggestion.from, to: suggestion.to })).run();
    setSuggestion(null);
  };
  useLayoutEffect(() => { actions.current.key = (event) => {
    if (!suggestion) return false;
    if (event.key === 'Escape') {
      dismissed.current = `${editor?.state.selection.from}:${editor?.state.selection.$from.parent.textBetween(0, editor.state.selection.$from.parentOffset, '\n', '\ufffc')}`;
      setSuggestion(null); event.preventDefault(); return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { setActiveChoice({ query: suggestion.query, index: (selected + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % Math.max(1, choices.length) }); event.preventDefault(); return true; }
    if (event.key === 'Enter' && choices.length) { apply(Math.min(selected, choices.length - 1)); event.preventDefault(); return true; }
    return false;
  }; });
  useEffect(() => {
    if (!editor || props.value === last.current) return;
    last.current = props.value;
    const pos = Math.min(editor.state.selection.from, editor.state.doc.content.size);
    editor.commands.setContent(props.value, { contentType: 'markdown', emitUpdate: false });
    const doc = editor.state.doc;
    const state = EditorState.create({ schema: editor.schema, doc, plugins: editor.state.plugins });
    editor.view.updateState(state);
    editor.view.dispatch(state.tr.setSelection(TextSelection.near(doc.resolve(Math.min(pos, doc.content.size)))));
  }, [editor, props.value]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest('.wk-command-menu, .tiptap')) setSuggestion(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    if (suggestion) document.getElementById(`wk-choice-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [suggestion, selected]);
  if (!editor) return null;
  return <EmbedContext.Provider value={props}><div className="wk-rich-editor" onKeyDown={(e) => e.stopPropagation()}>
    <TableControls editor={editor} />
    <EditorContent editor={editor} />
    <BubbleMenu editor={editor} options={bubbleOptions}>
      <div className="wk-format" role="toolbar" aria-label="Text formatting">
        {[
          { label: 'Bold', text: 'B', active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
          { label: 'Italic', text: 'I', active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
          { label: 'Strikethrough', text: 'S', active: editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
          { label: 'Inline code', text: '<>', active: editor.isActive('code'), run: () => editor.chain().focus().toggleCode().run() },
        ].map(({ label, text, active, run }) => <button key={label} type="button" aria-label={label} aria-pressed={active} onMouseDown={(e) => e.preventDefault()} onClick={run}>{text}</button>)}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setLink(editor.getAttributes('link').href ?? '')}>Link</button>
        {link !== null && <form onSubmit={(e) => { e.preventDefault(); if (link.trim()) editor.chain().focus().setLink({ href: link.trim() }).run(); else editor.chain().focus().unsetLink().run(); setLink(null); }}>
          <input aria-label="Link URL" autoFocus value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
          <button type="submit">Apply</button><button type="button" onClick={() => setLink(null)}>Cancel</button>
        </form>}
      </div>
    </BubbleMenu>
    {suggestion && createPortal(<div id="wk-suggestions" className="wk-command-menu" role="listbox" aria-label={suggestion.kind === 'slash' ? 'Slash commands' : 'Wiki links'} style={{ left: Math.max(8, Math.min(suggestion.x, window.innerWidth - 272)), top: Math.max(8, Math.min(suggestion.y + 6, window.innerHeight - 310)) }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setSuggestion(null); editor.commands.focus(); } }}>
      {choices.length ? choices.map((c, i) => <button type="button" role="option" id={`wk-choice-${i}`} aria-selected={i === selected} key={c.label} onMouseDown={(e) => e.preventDefault()} onClick={() => apply(i)}>{c.label}</button>) : <span>No matches</span>}
    </div>, document.body)}
  </div></EmbedContext.Provider>;
}
