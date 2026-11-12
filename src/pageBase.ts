// Base URL for exported wiki links (see setPageBase in mermaid/io.ts).
// Browser overrides take precedence over the build-time default.

import { create } from 'zustand';
import { setPageBase } from './mermaid/io';

const KEY = 'merfolk.pageBase';
const DEFAULT_BASE = import.meta.env.VITE_PAGE_BASE_URL?.trim() ?? '';

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
};

interface PageBase {
  base: string;
  set: (base: string) => void;
}

export const usePageBase = create<PageBase>((set) => {
  const base = read();
  setPageBase(base);
  return {
    base,
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
