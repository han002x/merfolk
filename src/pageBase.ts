// Base URL for exported wiki links (see setPageBase in mermaid/io.ts).
// Kept per browser; empty means relative `#/wiki/<id>` links.

import { create } from 'zustand';
import { setPageBase } from './mermaid/io';

const KEY = 'merfolk.pageBase';

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

interface PageBase {
  base: string;
  set: (base: string) => void;
}

export const usePageBase = create<PageBase>((set) => {
  setPageBase(read());
  return {
    base: read(),
    set: (base) => {
      setPageBase(base);
      try {
        localStorage.setItem(KEY, base);
      } catch {
        // best effort, like autosave
      }
      set({ base });
    },
  };
});
