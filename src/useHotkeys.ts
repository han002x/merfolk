import { useEffect } from 'react';

export interface Hotkey {
  /** lowercase key, e.g. 'r', 'l', 'delete' */
  key: string;
  shift?: boolean;
  meta?: boolean; // cmd/ctrl
  run: () => void;
}

/** Whether keyboard input is going into a text field (so shortcuts stand down). */
export function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

/** Global keyboard shortcuts, suspended while the user is typing in a field. */
export function useHotkeys(hotkeys: Hotkey[]) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      for (const h of hotkeys) {
        const metaOk = h.meta ? e.metaKey || e.ctrlKey : !(e.metaKey || e.ctrlKey);
        const shiftOk = !!h.shift === e.shiftKey;
        if (key === h.key && metaOk && shiftOk) {
          e.preventDefault();
          h.run();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys]);
}
