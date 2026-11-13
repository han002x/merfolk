import type { FontFamily, Sloppiness } from './types';

export const COLORS = ['bg', 'panel', 'border', 'text', 'muted', 'ink', 'pencil', 'accent', 'seal', 'node', 'group', 'input'] as const;
export type Palette = Record<typeof COLORS[number], string>;
export const DOCUMENT_SYMBOLS = [
  { id: 'page', label: 'Page' }, { id: 'book', label: 'Book' },
  { id: 'notebook', label: 'Notebook' }, { id: 'deck', label: 'Presentation' },
  { id: 'monitor', label: 'Screen' }, { id: 'film', label: 'Film' },
  { id: 'pumpkin', label: 'Pumpkin' }, { id: 'ghost', label: 'Ghost' },
  { id: 'bat', label: 'Bat' }, { id: 'skull', label: 'Skull' },
] as const;
export interface DocumentIconStyle {
  symbol: typeof DOCUMENT_SYMBOLS[number]['id'];
  color: string;
}
export interface Appearance {
  colors: Palette;
  wikiIcon?: DocumentIconStyle;
  slidesIcon?: DocumentIconStyle;
  uiFont: FontFamily;
  contentFont: FontFamily;
  headingFont: FontFamily;
  sloppiness: Sloppiness;
  corners: 'sharp' | 'round';
  texture: 'plain' | 'paper' | 'grid';
  shadows: boolean;
}
function palette([bg, panel, border, text, muted, ink, pencil, accent, seal, node, group, input]: [string,string,string,string,string,string,string,string,string,string,string,string]): Palette {
  return { bg, panel, border, text, muted, ink, pencil, accent, seal, node, group, input };
}
const paper: Appearance = {
  colors: palette(['#ffffff','#fbfaf7','#e6e1d7','#2a2723','#8a857c','#3a352e','#e2ddd2','#3b5b9a','#d0532f','#ffffff','#f6f2ea','#ffffff']),
  uiFont: 'sans', contentFont: 'hand', headingFont: 'hand', sloppiness: 1, corners: 'round', texture: 'paper', shadows: true,
};
export const PRESETS = [
  { id: 'paper', name: 'Paper', style: paper },
  { id: 'night-paper', name: 'Night Paper', style: { ...paper, colors: palette(['#1a1916','#22201c','#3a362f','#ece5d8','#9b9384','#d9d1c3','#3d3932','#8fa8dc','#e9764f','#27241f','#2d2a24','#161512']) } },
  { id: 'clean', name: 'Clean', style: { ...paper, colors: palette(['#f7f8fa','#ffffff','#dfe3e8','#20242b','#667085','#394150','#dbe1e8','#2563eb','#2563eb','#ffffff','#edf2f7','#ffffff']), contentFont: 'sans', headingFont: 'sans', sloppiness: 0, texture: 'plain' } },
  { id: 'blueprint', name: 'Blueprint', style: { ...paper, colors: palette(['#102c4c','#16395f','#365b7b','#e4f1ff','#a3c0dc','#d5e9ff','#25496b','#73c7ff','#73c7ff','#173b60','#123354','#0c2340']), contentFont: 'mono', headingFont: 'mono', sloppiness: 0, corners: 'sharp', texture: 'grid', shadows: false } },
  { id: 'terminal', name: 'Terminal', style: { ...paper, colors: palette(['#0d1510','#121f17','#294333','#ccebd5','#83a88c','#9fd6ad','#21392a','#65d486','#65d486','#14251a','#182e20','#0a110d']), uiFont: 'mono', contentFont: 'mono', headingFont: 'mono', sloppiness: 0, corners: 'sharp', texture: 'plain', shadows: false } },
  { id: 'sepia', name: 'Sepia', style: { ...paper, colors: palette(['#f5efdf','#fcf8ed','#d6c8ad','#45372a','#81715f','#5c4632','#ddd0b8','#91613b','#b76542','#fffaf0','#e9ddc4','#fffaf0']), contentFont: 'serif', headingFont: 'serif', sloppiness: 0 } },
  { id: 'classic', name: 'Classic', style: { ...paper, colors: palette(['#ffffff','#ffffff','#cccccc','#000000','#666666','#000000','#e6e6e6','#000000','#000000','#ffffff','#ffffff','#ffffff']), contentFont: 'sans', headingFont: 'sans', sloppiness: 0, corners: 'sharp', texture: 'plain', shadows: false } },
  { id: 'halloween', name: 'Halloween', style: { ...paper, colors: palette(['#17121e','#23192e','#51405f','#fff0dd','#bba6c9','#f4dcc0','#382a45','#ff963f','#dca1ff','#2b2035','#34233c','#130f19']), contentFont: 'hand', headingFont: 'serif', sloppiness: 1, texture: 'paper', wikiIcon: { symbol: 'ghost', color: '#dca1ff' }, slidesIcon: { symbol: 'pumpkin', color: '#ff963f' } } },
] satisfies { id: string; name: string; style: Appearance }[];
export type PresetId = typeof PRESETS[number]['id'];
export const FONTS: Record<FontFamily, string> = {
  sans: "'Inter', system-ui, sans-serif", mono: "'JetBrains Mono', ui-monospace, monospace",
  hand: "'Kalam', 'Segoe Print', cursive", serif: 'ui-serif, Georgia, serif',
};
export function colorMode(style: Appearance): 'light' | 'dark' {
  const n = parseInt(style.colors.bg.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 140 ? 'light' : 'dark';
}
function isDocumentIcon(value: unknown): value is DocumentIconStyle {
  return !!value && typeof value === 'object' && 'symbol' in value
    && DOCUMENT_SYMBOLS.some((symbol) => symbol.id === value.symbol)
    && 'color' in value && typeof value.color === 'string' && /^#[\da-f]{6}$/i.test(value.color);
}
export function documentIcon(appearance: Appearance, kind: 'wiki' | 'slides'): DocumentIconStyle {
  return (kind === 'wiki' ? appearance.wikiIcon : appearance.slidesIcon)
    ?? { symbol: kind === 'wiki' ? 'page' : 'deck', color: appearance.colors.accent };
}
export function isAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== 'object' || !('colors' in value) || !value.colors || typeof value.colors !== 'object') return false;
  const colors = Object.entries(value.colors);
  return COLORS.every((key) => colors.some(([name, color]) => name === key && typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)))
    && (!('wikiIcon' in value) || isDocumentIcon(value.wikiIcon))
    && (!('slidesIcon' in value) || isDocumentIcon(value.slidesIcon))
    && 'uiFont' in value && typeof value.uiFont === 'string' && Object.keys(FONTS).includes(String(value.uiFont))
    && 'contentFont' in value && typeof value.contentFont === 'string' && Object.keys(FONTS).includes(String(value.contentFont))
    && 'headingFont' in value && typeof value.headingFont === 'string' && Object.keys(FONTS).includes(String(value.headingFont))
    && 'sloppiness' in value && [0,1,2].includes(Number(value.sloppiness)) && typeof value.sloppiness === 'number'
    && 'corners' in value && typeof value.corners === 'string' && ['sharp','round'].includes(String(value.corners))
    && 'texture' in value && typeof value.texture === 'string' && ['plain','paper','grid'].includes(String(value.texture))
    && 'shadows' in value && typeof value.shadows === 'boolean';
}
