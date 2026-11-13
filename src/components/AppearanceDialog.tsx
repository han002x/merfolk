import { useEffect, useRef } from 'react';
import { COLORS, DOCUMENT_SYMBOLS, FONTS, PRESETS, documentIcon, type Appearance } from '../appearance';
import { activeAppearance, saveAppearance, useAppearance } from '../theme';
import { useDiagram } from '../store';
import { write } from '../persist';
import { isTyping } from '../useHotkeys';
import { Icon } from './Icon';
import './appearance.css';

export default function AppearanceDialog() {
  const dialog = useRef<HTMLDialogElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  const settings = useAppearance();
  const style = activeAppearance(settings);
  useEffect(() => {
    const open = () => {
      if (dialog.current?.open) return;
      previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.current?.showModal();
    };
    const key = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 't') {
        e.preventDefault(); open();
      }
    };
    const close = () => previous.current?.focus();
    const element = dialog.current;
    element?.addEventListener('close', close);
    window.addEventListener('merfolk:appearance', open);
    window.addEventListener('keydown', key);
    return () => {
      element?.removeEventListener('close', close);
      window.removeEventListener('merfolk:appearance', open);
      window.removeEventListener('keydown', key);
    };
  }, []);
  const choose = (selected: string, custom = settings.custom) => {
    useDiagram.getState().restyleAppearance();
    const { nodes, edges, pages, decks } = useDiagram.getState();
    write({ nodes, edges, pages, decks });
    saveAppearance(selected, custom);
  };
  const patch = (change: Partial<Appearance>) => choose('custom', { ...style, ...change });
  return <dialog ref={dialog} className="mf-appearance" aria-labelledby="appearance-title"
    onClick={(e) => { if (e.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.current.close(); } }}>
    <header><h2 id="appearance-title">Appearance</h2><button type="button" aria-label="Close appearance" onClick={() => dialog.current?.close()}>×</button></header>
    <div className="mf-appearance-presets" role="group" aria-label="App styles">
      {[...PRESETS, { id: 'custom', name: 'Custom', style: settings.custom ?? style }].map((preset) => <button
        type="button" key={preset.id} aria-pressed={settings.selected === preset.id}
        onClick={() => choose(preset.id, preset.id === 'custom' ? settings.custom ?? style : settings.custom)}>
        <span className="mf-appearance-preview" aria-hidden="true" style={{ background: preset.style.colors.bg, color: preset.style.colors.ink, fontFamily: FONTS[preset.style.contentFont], borderRadius: preset.style.corners === 'sharp' ? 0 : 6 }}>
          <span style={{ background: preset.style.colors.node, borderColor: preset.style.colors.accent }}>Aa</span><span style={{ color: preset.style.colors.accent }}>→</span><span style={{ background: preset.style.colors.group }}>Ab</span>
        </span>{preset.name}
      </button>)}
    </div>
    {settings.selected === 'custom' && <div className="mf-custom-controls">
      <label className="mf-appearance-field">Reset from preset<select aria-label="Reset custom from preset" value="" onChange={(e) => {
        const preset = PRESETS.find((p) => p.id === e.target.value);
        if (preset) choose('custom', preset.style);
      }}><option value="" disabled>Choose preset</option>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <fieldset><legend>Colors</legend><div className="mf-appearance-colors">
        {COLORS.map((key) => <label key={key}>{({ bg: 'Canvas', panel: 'Panels', border: 'Borders', text: 'Text', muted: 'Muted text', ink: 'Ink', pencil: 'Grid', accent: 'Accent', seal: 'Brand', node: 'Nodes', group: 'Groups', input: 'Inputs' })[key]}
          <input type="color" value={style.colors[key]} onChange={(e) => patch({ colors: { ...style.colors, [key]: e.target.value } })} />
        </label>)}
      </div></fieldset>
      <fieldset><legend>Icons</legend>
        {(['wiki', 'slides'] as const).map((kind) => {
          const value = documentIcon(style, kind);
          const name = kind === 'wiki' ? 'Wiki' : 'Slides';
          const update = (change: Partial<typeof value>) => saveAppearance('custom', { ...style, [kind === 'wiki' ? 'wikiIcon' : 'slidesIcon']: { ...value, ...change } });
          return <div className="mf-appearance-field" key={kind}>
            <label htmlFor={`appearance-${kind}-symbol`}>{name}</label>
            <span className="mf-appearance-icon-controls"><Icon name={kind === 'wiki' ? 'page' : 'deck'} size={20} />
              <select id={`appearance-${kind}-symbol`} aria-label={`${name} icon symbol`} value={value.symbol} onChange={(e) => {
                const symbol = DOCUMENT_SYMBOLS.find((option) => option.id === e.target.value);
                if (symbol) update({ symbol: symbol.id });
              }}>{DOCUMENT_SYMBOLS.map((symbol) => <option key={symbol.id} value={symbol.id}>{symbol.label}</option>)}</select>
              <input type="color" aria-label={`${name} icon color`} value={value.color} onChange={(e) => update({ color: e.target.value })} />
            </span>
          </div>;
        })}
      </fieldset>
      <fieldset><legend>Typography</legend>{(['uiFont','contentFont','headingFont'] as const).map((key) => <label className="mf-appearance-field" key={key}>
        {{uiFont:'UI font',contentFont:'Content font',headingFont:'Heading font'}[key]}<select aria-label={{uiFont:"UI font",contentFont:"Content font",headingFont:"Heading font"}[key]} value={style[key]} onChange={(e) => {
          const font = (['sans','serif','mono','hand'] as const).find((f) => f === e.target.value);
          if (font) patch({ [key]: font });
        }}>{Object.entries(FONTS).map(([font, css]) => <option key={font} value={font} style={{ fontFamily: css }}>{font}</option>)}</select>
      </label>)}</fieldset>
      <fieldset><legend>Drawing</legend>
        <label className="mf-appearance-field">Sketchiness<select aria-label="Sketchiness" value={style.sloppiness} onChange={(e) => {
          const sloppiness = ([0,1,2] as const).find((n) => n === Number(e.target.value));
          if (sloppiness !== undefined) patch({ sloppiness });
        }}><option value={0}>Ink</option><option value={1}>Sketch</option><option value={2}>Scribble</option></select></label>
        <label className="mf-appearance-field">Corners<select aria-label="Corners" value={style.corners} onChange={(e) => patch({ corners: e.target.value === 'sharp' ? 'sharp' : 'round' })}><option value="sharp">Sharp</option><option value="round">Round</option></select></label>
        <label className="mf-appearance-field">Texture<select aria-label="Texture" value={style.texture} onChange={(e) => {
          const texture = (['plain','paper','grid'] as const).find((t) => t === e.target.value);
          if (texture) patch({ texture });
        }}><option value="plain">Plain</option><option value="paper">Paper</option><option value="grid">Grid</option></select></label>
        <label className="mf-appearance-field">Shadows<input type="checkbox" checked={style.shadows} onChange={(e) => patch({ shadows: e.target.checked })} /></label>
      </fieldset>
    </div>}
  </dialog>;
}
