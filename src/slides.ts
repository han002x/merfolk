import type { Appearance } from './appearance';
// Pure slide-deck logic. A deck is Markdown in the subset Marp and Slidev both
// read: `---` between slides, HTML comments as speaker notes, optional front
// matter. No store or DOM here, so scripts/slides.ts can exercise it directly.

import { Marked, type Token } from 'marked';
import type { Deck, Diagram } from './types';
import { embedDiagram, embedNode } from './pages.ts';
import { toMermaid } from './mermaid/io.ts';

export const FONTS = ['sans', 'serif', 'mono', 'hand'] as const;
export type Font = (typeof FONTS)[number];
const font = (value: string | undefined): Font | undefined => FONTS.find((f) => f === value?.trim());

/** How a slide is dressed: Marp's `backgroundColor`, `color` and `class`, plus fonts. */
export interface Look {
  background?: string;
  color?: string;
  /** `class: lead`: a centred title slide */
  lead: boolean;
  /** `class: invert`: ink and paper swapped */
  invert: boolean;
  font?: Font;
  headingFont?: Font;
  /** how one slide gives way to the next while presenting */
  transition?: Transition;
}

export const TRANSITIONS = ['fade', 'slide'] as const;
export type Transition = (typeof TRANSITIONS)[number];

export interface Slide {
  /** Markdown of one slide, notes removed */
  body: string;
  notes: string[];
  look: Look;
}

export interface Slides {
  /** YAML between the opening `---` lines, kept verbatim and never rendered */
  frontMatter: string;
  slides: Slide[];
}

const md = new Marked();

const FRONT = /^---[ \t]*\n((?:[ \t]*(?:#.*|[\w-]+[ \t]*:.*|-[ \t].*)?\n)*?)---[ \t]*(?:\n|$)/;
const COMMENTS = /^(?:\s*<!--[\s\S]*?-->)+\s*$/;
/** Marp directives: comments that configure a slide instead of annotating it. */
const DIRECTIVE =
  /^_?(?:marp|theme|style|font|headingFont|transition|headingDivider|size|math|title|author|description|keywords|url|image|lang|paginate|header|footer|class|color|background(?:Color|Image|Position|Repeat|Size))[ \t]*:/;

function parse(body: string): { frontMatter: string; tokens: Token[] } {
  const text = body.replace(/\r\n?/g, '\n');
  const front = FRONT.exec(text);
  return {
    frontMatter: front ? front[1].trimEnd() : '',
    tokens: md.lexer(front ? text.slice(front[0].length) : text),
  };
}

const isBreak = (t: Token) => t.type === 'hr' && t.raw.trim() === '---';

const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

/** Take `key: value` lines into a look. `class` replaces the classes, as in Marp. */
function dress(look: Look, yaml: string, spot: boolean): Look {
  const next = { ...look };
  for (const line of yaml.split('\n')) {
    const m = /^[ \t]*(_?)(backgroundColor|color|class|font|headingFont|transition)[ \t]*:(.*)$/.exec(line);
    if (!m || !!m[1] !== spot) continue;
    const value = unquote(m[3]);
    if (m[2] === 'backgroundColor') next.background = value || undefined;
    else if (m[2] === 'color') next.color = value || undefined;
    else if (m[2] === 'font') next.font = font(value);
    else if (m[2] === 'headingFont') next.headingFont = font(value);
    else if (m[2] === 'transition') next.transition = TRANSITIONS.find((t) => t === value);
    else {
      const classes = value.split(/\s+/);
      next.lead = classes.includes('lead');
      next.invert = classes.includes('invert');
    }
  }
  return next;
}

/** Split a deck into slides. A deck always has at least one slide. */
export function splitSlides(body: string): Slides {
  const { frontMatter, tokens } = parse(body);
  const slides: Slide[] = [];
  let raw = '';
  let notes: string[] = [];
  // a directive dresses this slide and the ones after; `_directive` only this one
  let look = dress({ lead: false, invert: false }, frontMatter, false);
  let spot = '';
  const close = () => {
    slides.push({ body: raw.trim(), notes, look: dress(look, spot, true) });
    raw = '';
    notes = [];
    spot = '';
  };
  for (const t of tokens) {
    if (isBreak(t)) close();
    else if (t.type === 'html' && COMMENTS.test(t.raw)) {
      for (const m of t.raw.matchAll(/<!--([\s\S]*?)-->/g)) {
        const note = m[1].trim();
        if (!note) continue;
        if (!DIRECTIVE.test(note)) notes.push(note);
        else {
          look = dress(look, note, false);
          spot += `${note}\n`;
        }
      }
    } else raw += t.raw;
  }
  close();
  return { frontMatter, slides };
}

// ---- editing: slide tools work on the Markdown itself ----------------------

/** The deck as front matter plus one source chunk per slide, notes included. */
function chunks(body: string): { head: string; parts: string[]; starts: number[]; ends: number[] } {
  const text = body.replace(/\r\n?/g, '\n');
  const head = FRONT.exec(text)?.[0] ?? '';
  const parts = [''];
  const starts = [head.length];
  const ends: number[] = [];
  let at = head.length;
  for (const t of md.lexer(text.slice(head.length))) {
    if (isBreak(t)) {
      ends.push(at);
      parts.push('');
      starts.push(at + t.raw.length);
    } else parts[parts.length - 1] += t.raw;
    at += t.raw.length;
  }
  ends.push(text.length);
  return { head, parts, starts, ends };
}

const join = (head: string, parts: string[]) =>
  `${head ? `${head.trimEnd()}\n\n` : ''}${parts.map((p) => p.trim()).join('\n\n---\n\n')}`;

/** Where each slide's source begins, as offsets into the deck. */
export const slideStarts = (body: string): number[] => chunks(body).starts;

/** The slide holding a source offset (the caret). */
export function slideAt(body: string, offset: number): number {
  const starts = slideStarts(body);
  let at = 0;
  while (at + 1 < starts.length && starts[at + 1] <= offset) at++;
  return at;
}

/** Where to put the caret to write slide `at`: its first line of source. */
export function slideCaret(body: string, at: number): number {
  const text = body.replace(/\r\n?/g, '\n');
  const { parts, starts, ends } = chunks(text);
  const i = Math.max(0, Math.min(starts.length - 1, at));
  if (parts[i].trim()) return starts[i] + (/^\n*/.exec(text.slice(starts[i]))?.[0].length ?? 0);
  // an empty slide: leave a blank line before the next divider, or text typed
  // here would join it as a heading underline
  const end = ends[i];
  return end < text.length && end - 2 >= starts[i] ? end - 2 : end < text.length ? starts[i] : end;
}

export type SlideEdit = 'add' | 'duplicate' | 'remove' | 'up' | 'down';

/**
 * Add a slide after `at`, duplicate, remove or move it. Returns the new deck,
 * the slide to show next and where its source begins. A deck keeps one slide.
 */
export function editSlides(body: string, edit: SlideEdit, at: number, content = ''): { body: string; at: number; caret: number } {
  const { head, parts } = chunks(body);
  let next = Math.max(0, Math.min(parts.length - 1, at));
  const here = next;
  if (edit === 'add') parts.splice((next = here + 1), 0, content);
  else if (edit === 'duplicate') parts.splice((next = here + 1), 0, parts[here]);
  else if (edit === 'remove') {
    if (parts.length > 1) parts.splice(here, 1);
    else parts[0] = '';
    next = Math.min(here, parts.length - 1);
  } else {
    const to = here + (edit === 'up' ? -1 : 1);
    if (to >= 0 && to < parts.length) {
      [parts[here], parts[to]] = [parts[to], parts[here]];
      next = to;
    }
  }
  const out = join(head, parts);
  return { body: out, at: next, caret: slideCaret(out, next) };
}

/** Take slide `from` out and put it back at `to`. Returns the deck and where the slide's source now begins. */
export function moveSlide(body: string, from: number, to: number): { body: string; at: number; caret: number } {
  const { head, parts } = chunks(body);
  const clamp = (n: number) => Math.max(0, Math.min(parts.length - 1, n));
  const [a, b] = [clamp(from), clamp(to)];
  parts.splice(b, 0, ...parts.splice(a, 1));
  const out = a === b ? body : join(head, parts);
  return { body: out, at: b, caret: slideCaret(out, b) };
}

/** Ready-made slides. Each is ordinary deck Markdown. */
export const LAYOUTS = {
  Title: '<!-- _class: lead -->\n\n# Title\n\nSubtitle',
  'Title and content': '## Title\n\n- First point\n- Second point',
  Section: '<!-- _class: lead invert -->\n\n# Section',
  'Two columns': '## Title\n\n<div class="box" style="left:7%;top:28%;width:41%;height:60%">Left</div>\n\n<div class="box" style="left:52%;top:28%;width:41%;height:60%">Right</div>',
} as const;

/** Things a slide is made of, ready to drop in at the caret. */
export const BLOCKS = {
  Diagram: '{{diagram}}',
  Mermaid: '```mermaid\nflowchart LR\n  A --> B\n```',
  Table: '| Column | Column |\n| --- | --- |\n| Cell | Cell |',
  Code: '```ts\n\n```',
  'Speaker note': '<!-- Note -->',
} as const;

/** Put a block on its own lines at `offset`. Returns the caret just after it. */
export function insertBlock(body: string, offset: number, block: string): { body: string; caret: number } {
  const text = body.replace(/\r\n?/g, '\n');
  // never split a line: the block goes after the one the caret is on
  const end = text.indexOf('\n', Math.min(offset, text.length));
  const cut = end === -1 ? text.length : end;
  const before = text.slice(0, cut).trimEnd();
  const after = text.slice(cut).trimStart();
  const start = `${before}${before ? '\n\n' : ''}${block}`;
  return { body: `${start}${after ? `\n\n${after}` : ''}`, caret: start.length };
}

// ---- design: slide and deck style are directives, objects are HTML blocks ----

/** Set or clear (`null`) a `_key` spot directive on one slide. */
export function setSlideStyle(body: string, at: number, key: 'backgroundColor' | 'color' | 'class', value: string | null): string {
  const { head, parts } = chunks(body);
  const i = Math.max(0, Math.min(parts.length - 1, at));
  // spot directives sit on consecutive lines above the slide's content
  const lines = parts[i].trim().split('\n');
  const stack: string[] = [];
  while (/^<!--[ \t]*_[\w]+[ \t]*:[^\n]*-->[ \t]*$/.test(lines[0] ?? '')) stack.push(lines.shift()!.trim());
  const own = new RegExp(`^<!--[ \\t]*_${key}[ \\t]*:`);
  const kept = stack.filter((line) => !own.test(line));
  if (value) kept.push(`<!-- _${key}: ${value} -->`);
  const rest = lines.join('\n').trim();
  parts[i] = [kept.join('\n'), rest].filter(Boolean).join('\n\n');
  return join(head, parts);
}

/** Set or clear (`null`) a front matter key, which dresses the whole deck. */
export function setDeckStyle(body: string, key: 'backgroundColor' | 'color' | 'font' | 'headingFont' | 'transition', value: string | null): string {
  const text = body.replace(/\r\n?/g, '\n');
  const head = FRONT.exec(text);
  const lines = (head?.[1] ?? '').split('\n').filter((line) => line.trim() && !new RegExp(`^[ \\t]*${key}[ \\t]*:`).test(line));
  if (value) lines.push(`${key}: ${/^[\w-]+$/.test(value) ? value : JSON.stringify(value)}`);
  const rest = text.slice(head?.[0].length ?? 0).replace(/^\n+/, '');
  return lines.length ? `---\n${lines.join('\n')}\n---\n\n${rest}` : rest;
}

export const SHAPES = ['rect', 'round', 'ellipse', 'line', 'arrow', 'image'] as const;
export type BoxShape = (typeof SHAPES)[number];
/** Shapes that hold words. A line, an arrow and an image do not. */
export const hasText = (shape: BoxShape | undefined) => !shape || shape === 'rect' || shape === 'round' || shape === 'ellipse';

/**
 * An object placed on a slide: a text box, or a shape when `shape` is set.
 * In the Markdown it is one HTML block,
 * `<div class="box round hand" style="left:10%;top:20%;width:30%;height:20%">Text</div>`,
 * positioned in percent of the slide.
 */
export interface Box {
  shape?: BoxShape;
  font?: Font;
  /** percent of the slide */
  left: number;
  top: number;
  width: number;
  height: number;
  background?: string;
  /** border colour */
  stroke?: string;
  color?: string;
  /** em, relative to the slide's text */
  size?: number;
  /** degrees clockwise, about the centre */
  rotate?: number;
  align?: 'left' | 'center' | 'right';
}

interface Tag { slide: number; from: number; to: number; classes: string[]; style: Map<string, string> }

/** Every box tag in the deck, with where its opening tag sits in the source. */
function tags(body: string): Tag[] {
  const text = body.replace(/\r\n?/g, '\n');
  const head = FRONT.exec(text)?.[0] ?? '';
  const found: Tag[] = [];
  let at = head.length;
  let slide = 0;
  for (const t of md.lexer(text.slice(head.length))) {
    if (isBreak(t)) slide++;
    else if (t.type === 'html')
      for (const m of t.raw.matchAll(/<div class="box((?: [\w-]+)*)"(?: style="([^"]*)")?>/g)) {
        const style = new Map<string, string>();
        for (const pair of (m[2] ?? '').split(';')) {
          const colon = pair.indexOf(':');
          if (colon > 0) style.set(pair.slice(0, colon).trim(), pair.slice(colon + 1).trim());
        }
        found.push({ slide, from: at + m.index, to: at + m.index + m[0].length, classes: m[1].trim().split(' ').filter(Boolean), style });
      }
    at += t.raw.length;
  }
  return found;
}

const percent = (value: string | undefined, fallback: number) => {
  const n = parseFloat(value ?? '');
  return Number.isFinite(n) ? n : fallback;
};

const toBox = (tag: Tag): Box => {
  const align = (['left', 'center', 'right'] as const).find((a) => a === tag.style.get('text-align'));
  return {
    shape: SHAPES.find((s) => tag.classes.includes(s)),
    font: FONTS.find((f) => tag.classes.includes(f)),
    left: percent(tag.style.get('left'), 0),
    top: percent(tag.style.get('top'), 0),
    width: percent(tag.style.get('width'), 30),
    height: percent(tag.style.get('height'), 20),
    background: tag.style.get('background'),
    stroke: tag.style.get('border-color'),
    color: tag.style.get('color'),
    size: tag.style.has('font-size') ? percent(tag.style.get('font-size'), 1) : undefined,
    rotate: percent(/rotate\(([-\d.]+)deg\)/.exec(tag.style.get('transform') ?? '')?.[1], 0) || undefined,
    ...(align && { align }),
  };
};

const round = (n: number) => `${Math.round(n * 10) / 10}`;

/** The opening tag for a box. Classes and style properties merfolk does not own are kept. */
function openTag(box: Box, classes: string[] = [], style = new Map<string, string>()): string {
  const owned = new Set<string>([...SHAPES, ...FONTS]);
  const names = ['box', ...(box.shape ? [box.shape] : []), ...(box.font ? [box.font] : []), ...classes.filter((c) => !owned.has(c))];
  const next = new Map<string, string | undefined>([
    ['left', `${round(box.left)}%`],
    ['top', `${round(box.top)}%`],
    ['width', `${round(box.width)}%`],
    ['height', `${round(box.height)}%`],
    ['background', box.background],
    ['border-color', box.stroke],
    ['color', box.color],
    ['font-size', box.size === undefined ? undefined : `${round(box.size)}em`],
    ['transform', box.rotate ? `rotate(${round(box.rotate)}deg)` : undefined],
    ['text-align', box.align],
  ]);
  for (const [key, value] of style) if (!next.has(key)) next.set(key, value);
  const css = [...next].filter(([, value]) => value).map(([key, value]) => `${key}:${value}`).join(';');
  return `<div class="${names.join(' ')}" style="${css}">`;
}

/** The boxes on one slide, in source order: the same order they have in the rendered slide. */
export const slideBoxes = (body: string, slide: number): Box[] => tags(body).filter((t) => t.slide === slide).map(toBox);

/** Put a new box on a slide. Returns the deck and the box's place among the slide's boxes. */
export function addBox(body: string, at: number, shape?: BoxShape, src = ''): { body: string; box: number } {
  const { head, parts } = chunks(body);
  const i = Math.max(0, Math.min(parts.length - 1, at));
  const box: Box = !shape ? { left: 30, top: 40, width: 40, height: 20 }
    : shape === 'line' ? { shape, left: 30, top: 50, width: 40, height: 0.8 }
    : shape === 'arrow' ? { shape, left: 30, top: 47, width: 40, height: 6 }
    : shape === 'image' ? { shape, left: 30, top: 25, width: 40, height: 50 }
    : { shape, left: 35, top: 35, width: 30, height: 30 };
  // the picture carries its own fit, so it shows the same in any renderer
  const inside = shape === 'image' ? `<img src="${src.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" alt="" style="width:100%;height:100%;object-fit:contain">`
    : !shape ? 'Text' : hasText(shape) ? 'Shape' : '';
  parts[i] = `${parts[i].trim()}${parts[i].trim() ? '\n\n' : ''}${openTag(box)}${inside}</div>`;
  const out = join(head, parts);
  return { body: out, box: slideBoxes(out, i).length - 1 };
}

/** Move, resize or restyle box `k` of a slide. `undefined` in the patch clears a property. */
export function setBox(body: string, slide: number, k: number, patch: Partial<Box>): string {
  const text = body.replace(/\r\n?/g, '\n');
  const tag = tags(text).filter((t) => t.slide === slide)[k];
  if (!tag) return body;
  return `${text.slice(0, tag.from)}${openTag({ ...toBox(tag), ...patch }, tag.classes, tag.style)}${text.slice(tag.to)}`;
}

/** Take box `k` off a slide, text and all. */
export function removeBox(body: string, slide: number, k: number): string {
  const text = body.replace(/\r\n?/g, '\n');
  const tag = tags(text).filter((t) => t.slide === slide)[k];
  const close = tag ? text.indexOf('</div>', tag.to) : -1;
  if (!tag || close === -1) return body;
  const before = text.slice(0, tag.from);
  const after = text.slice(close + '</div>'.length);
  // a box on its own lines leaves no gap behind
  const rest = before.endsWith('\n\n') || !before ? after.replace(/^\n+/, '') : after;
  return rest ? `${before}${rest}` : before.trimEnd();
}

/**
 * Objects paint in source order. Bring box `k` to the front (last) or send it
 * to the back (first): the objects trade places in the source, each staying a
 * whole block. Returns the deck and the box's new place.
 */
export function orderBox(body: string, slide: number, k: number, to: 'front' | 'back'): { body: string; box: number } {
  const text = body.replace(/\r\n?/g, '\n');
  const slots = tags(text).filter((t) => t.slide === slide)
    .map((t) => ({ from: t.from, to: text.indexOf('</div>', t.to) + '</div>'.length }));
  if (!slots[k] || slots.some((s) => s.to < '</div>'.length)) return { body, box: k };
  const order = slots.map((_, i) => i);
  order.splice(to === 'front' ? order.length - 1 : 0, 0, ...order.splice(k, 1));
  let out = '';
  let at = 0;
  slots.forEach((slot, i) => {
    const source = slots[order[i]];
    out += text.slice(at, slot.from) + text.slice(source.from, source.to);
    at = slot.to;
  });
  return { body: out + text.slice(at), box: order.indexOf(k) };
}

/** Where a box's text begins in the source, to write in it. */
export function boxCaret(body: string, slide: number, k: number): number | undefined {
  return tags(body).filter((t) => t.slide === slide)[k]?.to;
}

/** Replace the contents of a text object with HTML sanitized by the canvas editor. */
export function setBoxContent(body: string, slide: number, k: number, html: string): string {
  const text = body.replace(/\r\n?/g, '\n');
  const tag = tags(text).filter((t) => t.slide === slide)[k];
  const close = tag ? text.indexOf('</div>', tag.to) : -1;
  if (!tag || close < 0 || !hasText(toBox(tag).shape)) return body;
  return text.slice(0, tag.to) + html + text.slice(close);
}

/** Copy a complete object, keeping its content and styles, slightly offset. */
export function duplicateBox(body: string, slide: number, k: number): { body: string; box: number } {
  const text = body.replace(/\r\n?/g, '\n');
  const all = tags(text).filter((t) => t.slide === slide);
  const tag = all[k];
  const close = tag ? text.indexOf('</div>', tag.to) : -1;
  if (!tag || close < 0) return { body, box: k };
  const from = toBox(tag);
  const copy = openTag({ ...from, left: from.left + 2, top: from.top + 2 }, tag.classes, tag.style)
    + text.slice(tag.to, close + '</div>'.length);
  const end = close + '</div>'.length;
  return { body: text.slice(0, end) + '\n\n' + copy + text.slice(end), box: k + 1 };
}

const STACKS: Record<Font, string> = {
  sans: 'Inter, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: "'JetBrains Mono', ui-monospace, monospace",
  hand: "Kalam, 'Segoe Print', cursive",
};

/** An arrow is one clipped block: a shaft a third of its height, a head as long as it is tall. */
export const ARROW = 'polygon(0 33%,calc(100% - 1.4em) 33%,calc(100% - 1.4em) 0,100% 50%,calc(100% - 1.4em) 100%,calc(100% - 1.4em) 67%,0 67%)';

/** A box with everything spelled out inline, for renderers that lack merfolk's stylesheet. */
function standalone(tag: Tag): string {
  const box = toBox(tag);
  const css = (!hasText(box.shape) ? [
    'position:absolute', 'box-sizing:border-box',
    box.shape === 'image' ? '' : 'background:currentColor',
    box.shape === 'arrow' ? `clip-path:${ARROW}` : '',
  ] : [
    'position:absolute', 'box-sizing:border-box', 'display:grid', 'padding:.3em .6em', 'line-height:1.25',
    box.shape ? 'place-items:center;text-align:center' : 'align-items:center',
    box.align ? 'justify-items:stretch' : '',
    box.shape ? `border:.09em solid ${box.stroke ?? 'currentColor'}` : '',
    box.shape === 'round' ? 'border-radius:.6em' : box.shape === 'ellipse' ? 'border-radius:50%' : '',
    box.font ? `font-family:${STACKS[box.font]}` : '',
  ]).filter(Boolean).join(';');
  return openTag(box, tag.classes, tag.style).replace('style="', `style="${css};`);
}

const EMBED = /^\{\{diagram(?::([^}\n]+))?\}\}[ \t]*$/gm;
const WIKILINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

/**
 * A deck as a standalone Markdown file for Marp or Slidev: live diagram embeds
 * become Mermaid fences and wikilinks become their text.
 */
export function toMarkdown(deck: Deck, diagram: Diagram, nodeId?: string, appearance?: Appearance): string {
  let source = deck.body.replace(/\r\n?/g, '\n');
  if (appearance) {
    const look = dress({ lead: false, invert: false }, parse(source).frontMatter, false);
    for (const [key, value] of Object.entries({ backgroundColor: look.background ?? appearance.colors.bg, color: look.color ?? appearance.colors.text, font: look.font ?? appearance.contentFont, headingFont: look.headingFont ?? appearance.headingFont })) {
      if (key === 'backgroundColor' || key === 'color' || key === 'font' || key === 'headingFont') source = setDeckStyle(source, key, value);
    }
  }
  for (const tag of tags(source).reverse()) source = `${source.slice(0, tag.from)}${standalone(tag)}${source.slice(tag.to)}`;
  const { frontMatter, tokens } = parse(source);
  const look = dress({ lead: false, invert: false }, frontMatter, false);
  const fonts = [
    ...(look.font ? [`  section { font-family: ${STACKS[look.font]}; }`] : []),
    ...(look.headingFont ? [`  h1, h2, h3 { font-family: ${STACKS[look.headingFont]}; }`] : []),
  ];
  const body = tokens
    .map((t) => {
      if (t.type === 'code') return t.raw;
      return t.raw
        .replace(EMBED, (_all, target: string | undefined) => {
          const id = embedNode(target ?? '', diagram.nodes, nodeId);
          const sub = id ? embedDiagram(diagram, id) : { nodes: [], edges: [] };
          return sub.nodes.length ? `\`\`\`mermaid\n${toMermaid(sub)}\n\`\`\`` : '';
        })
        .replace(WIKILINK, (_all, target: string, alias: string | undefined) => (alias ?? target).trim());
    })
    .join('')
    .trim();
  const front = [
    ...(/^marp[ \t]*:/m.test(frontMatter) ? [] : ['marp: true']),
    ...(/^title[ \t]*:/m.test(frontMatter) || !deck.title ? [] : [`title: ${JSON.stringify(deck.title)}`]),
    ...(frontMatter ? [frontMatter] : []),
    // Marp has no font directive: the deck's fonts travel as its `style`
    ...(fonts.length && !/^style[ \t]*:/m.test(frontMatter) ? ['style: |', ...fonts] : []),
  ].join('\n');
  return `---\n${front}\n---\n\n${body}\n`;
}

/** A file name for the exported deck. */
export function deckFileName(deck: Deck): string {
  const slug = deck.title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `${slug || 'deck'}.md`;
}

/** Reset only styling owned by the app; fenced examples and speaker notes survive. */
export function restyleDeck(body: string): string {
  const { frontMatter, tokens } = parse(body);
  const clean = (source: string) => source
    .replace(/^\s*_?(?:backgroundColor|color|font|headingFont)\s*:.*$/gm, '')
    .replace(/^(\s*_?class\s*:)(.*)$/gm, (_match, prefix: string, value: string) => `${prefix}${value.replace(/\binvert\b/g, '').trim()}`);
  const front = clean(frontMatter).trim();
  let source = (front ? `---\n${front}\n---\n` : '') + tokens.map((t) => t.type === 'html' && COMMENTS.test(t.raw)
    ? t.raw.replace(/<!--([\s\S]*?)-->/g, (original, contents: string) => DIRECTIVE.test(contents.trim()) ? `<!--${clean(contents)}-->` : original)
    : t.raw).join('');
  for (const tag of tags(source).reverse()) {
    const opening = source.slice(tag.from, tag.to);
    const next = opening.replace(/class="([^"]*)"/, (_match, value: string) => `class="${value.split(' ').filter((name) => !FONTS.some((font) => font === name)).join(' ')}"`)
      .replace(/style="([^"]*)"/, (_match, css: string) => `style="${css.split(';').filter((pair) => !/^\s*(background|border-color|color)\s*:/.test(pair)).join(';')}"`);
    source = source.slice(0, tag.from) + next + source.slice(tag.to);
  }
  return source;
}
