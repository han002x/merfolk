import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import type { Box } from '../slides';
import { RESIZE_HANDLES } from './drag';

const LABELS = { nw: 'top left', n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left' };

/** Selection controls stay outside the slide, so edge handles are never clipped. */
export default function ObjectSelection({ box, index, editing, onCommit }: {
  box: Box;
  index: number;
  editing: boolean;
  onCommit: (html: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const commit = useRef(onCommit);
  const finished = useRef(false);
  useEffect(() => { commit.current = onCommit; });

  useEffect(() => {
    if (!editing) return;
    const el = root.current?.parentElement?.querySelectorAll<HTMLElement>('.sl-slide .box')[index];
    if (!el) return;
    const original = el.innerHTML;
    el.contentEditable = 'true';
    el.setAttribute('role', 'textbox');
    el.setAttribute('aria-label', 'Object text');
    el.setAttribute('aria-multiline', 'true');
    el.classList.add('editing');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(true);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    finished.current = false;
    const finish = () => {
      if (finished.current) return;
      finished.current = true;
      const html = el.innerHTML === original ? original : DOMPurify.sanitize(
        el.innerHTML.replace(/<div><br><\/div>/gi, '<br>').replace(/<div[^>]*>/gi, '<br>').replace(/<\/div>/gi, '').replace(/\n/g, '<br>'),
        { ALLOWED_TAGS: ['br', 'b', 'strong', 'em', 'i', 'u', 's', 'span', 'a', 'code', 'sub', 'sup'], ALLOWED_ATTR: ['href', 'title', 'style'] },
      );
      commit.current(html);
    };
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        el.blur();
      }
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData?.getData('text/plain') ?? '');
    };
    el.addEventListener('blur', finish);
    el.addEventListener('keydown', onKey);
    el.addEventListener('paste', onPaste);
    return () => {
      el.removeEventListener('blur', finish);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('paste', onPaste);
      el.removeAttribute('contenteditable');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
      el.removeAttribute('aria-multiline');
      el.classList.remove('editing');
    };
  }, [editing, index]);

  return <div ref={root} className={`sl-selection${editing ? ' is-editing' : ''}`} aria-label="Object selection"
    style={{ left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, transform: `rotate(${box.rotate ?? 0}deg)` }}>
    {!editing && <>
      <span className="sl-rotate-stem" />
      <button type="button" tabIndex={-1} className="sl-rotate" data-drag="rotate" aria-label="Rotate object" title="Rotate · Shift for 15° steps" />
      {RESIZE_HANDLES.filter((handle) => box.shape !== 'line' || handle === 'w' || handle === 'e').map((handle) => (
        <button type="button" tabIndex={-1} key={handle} className={`sl-handle ${handle}`} data-drag={handle}
          aria-label={`Resize ${LABELS[handle]}`} title={`Resize ${LABELS[handle]}${handle.length === 2 ? ' · Shift to keep proportions' : ''}`} />
      ))}
    </>}
  </div>;
}
