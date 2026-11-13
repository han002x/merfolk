import { useSyncExternalStore } from 'react';
import { COLORS, FONTS, PRESETS, colorMode, documentIcon, isAppearance, type Appearance } from './appearance';
export type Theme = 'light' | 'dark';
const KEY = 'marmerlade.appearance';
interface Settings { selected: string; custom: Appearance | null }
function fallback(): Settings {
  let saved: string | null = null;
  try { saved = localStorage.getItem('marmerlade.theme'); } catch { /* use system preference */ }
  return { selected: (saved === 'light' || saved !== 'dark' && window.matchMedia?.('(prefers-color-scheme: light)').matches) ? 'paper' : 'night-paper', custom: null };
}
function read(): Settings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value && typeof value === 'object' && 'selected' in value && typeof value.selected === 'string' && 'custom' in value
      && (value.custom === null || isAppearance(value.custom))
      && (PRESETS.some((p) => p.id === value.selected) || value.selected === 'custom' && value.custom !== null)) {
      return { selected: value.selected, custom: value.custom };
    }
  } catch { /* invalid or unavailable storage */ }
  return fallback();
}
let current = read();
const listeners = new Set<() => void>();
export function activeAppearance(settings = current): Appearance {
  return settings.selected === 'custom' && settings.custom ? settings.custom : PRESETS.find((p) => p.id === settings.selected)?.style ?? PRESETS[0].style;
}
const root = document.documentElement;
const paperGrain = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 .35 0 0 0 -.14'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E")`;
function apply() {
  const a = activeAppearance();
  root.dataset.theme = colorMode(a);
  root.dataset.appearance = current.selected;
  root.dataset.corners = a.corners;
  root.dataset.shadows = String(a.shadows);
  root.dataset.texture = a.texture;
  root.style.colorScheme = colorMode(a);
  for (const key of COLORS) root.style.setProperty(`--mf-${key}`, a.colors[key]);
  root.style.setProperty('--mf-wiki-icon', documentIcon(a, 'wiki').color);
  root.style.setProperty('--mf-slides-icon', documentIcon(a, 'slides').color);
  root.style.setProperty('--mf-ui-font', FONTS[a.uiFont]);
  root.style.setProperty('--mf-content-font', FONTS[a.contentFont]);
  root.style.setProperty('--mf-heading-font', FONTS[a.headingFont]);
  root.style.setProperty('--mf-radius', a.corners === 'sharp' ? '0px' : '6px');
  root.style.setProperty('--mf-grain', a.texture === 'paper' ? paperGrain : 'none');
  root.style.setProperty('--mf-shadow', a.shadows ? 'color-mix(in srgb, var(--mf-ink) 20%, transparent)' : 'transparent');
  root.style.setProperty('--mf-glow', 'color-mix(in srgb, var(--mf-accent) 35%, transparent)');
}
apply();
function emit() { apply(); for (const listener of listeners) listener(); }
export function saveAppearance(selected: string, custom = current.custom) {
  current = { selected, custom };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* keep working in memory */ }
  emit();
}
window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { current = read(); emit(); } });
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useAppearance() { return useSyncExternalStore(subscribe, () => current, () => current); }
export function useTheme(): Theme { return colorMode(activeAppearance(useAppearance())); }
export function openAppearance() { window.dispatchEvent(new Event('marmerlade:appearance')); }
