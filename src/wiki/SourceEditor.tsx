import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';

const theme = EditorView.theme({
  '&': { height: '100%', background: 'transparent', color: 'var(--mf-text)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mf-mono)', fontSize: '13px', lineHeight: '1.7', padding: '24px 0' },
  '.cm-content': { caretColor: 'var(--mf-accent)', padding: '0 28px' },
  '.cm-cursor': { borderLeftColor: 'var(--mf-accent)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--mf-accent) 28%, transparent)',
  },
  '.cm-tooltip': {
    background: 'var(--mf-panel)',
    border: '1px solid var(--mf-border)',
    borderRadius: '8px',
    color: 'var(--mf-text)',
    fontFamily: 'var(--mf-sans)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'color-mix(in srgb, var(--mf-accent) 22%, transparent)',
    color: 'var(--mf-text)',
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', color: 'var(--mf-text)' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.link, tags.url], color: 'var(--mf-accent)' },
  { tag: [tags.monospace, tags.quote], color: 'var(--mf-muted)' },
  { tag: [tags.processingInstruction, tags.contentSeparator], color: 'var(--mf-muted)' },
]);

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** page titles and node labels offered after `[[` */
  targets: () => string[];
}

/** Raw Markdown editor. Remote changes replace the text and keep the caret. */
export default function Editor({ value, onChange, targets }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ onChange, targets });
  latest.current = { onChange, targets };

  useEffect(() => {
    const complete = (c: CompletionContext) => {
      const m = c.matchBefore(/\[\[[^\]\n]*/);
      if (!m) return null;
      return {
        from: m.from + 2,
        options: latest.current.targets().map((label) => ({ label, apply: `${label}]]` })),
        filter: true,
      };
    };
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          autocompletion({ override: [complete], icons: false }),
          placeholder('Write…'),
          EditorView.lineWrapping,
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => v.destroy();
    // one editor per mount; the parent keys it by page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v || v.state.doc.toString() === value) return;
    const at = Math.min(v.state.selection.main.head, value.length);
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, selection: { anchor: at } });
  }, [value]);

  return <div className="wk-editor" ref={host} />;
}
