import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

const KEY = 'merfolk.theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function read(): Theme {
  const saved = localStorage.getItem(KEY);
  return saved === 'light' || saved === 'dark' ? saved : systemTheme();
}

/** Reflect the active theme onto <html data-theme> so CSS variables switch. */
function apply(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// apply immediately on module load so there's no flash of the wrong palette
apply(read());

const listeners = new Set<() => void>();
let current: Theme = read();

function emit() {
  for (const l of listeners) l();
}

export function setTheme(theme: Theme) {
  current = theme;
  localStorage.setItem(KEY, theme);
  apply(theme);
  emit();
}

export function toggleTheme() {
  setTheme(current === 'dark' ? 'light' : 'dark');
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: current theme, re-renders on change. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 'dark' as Theme,
  );
}
