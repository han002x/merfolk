import { BACKGROUND_COLORS, STROKE_COLORS } from '../style';
import { FONTS, TRANSITIONS, type Box, type Font, type Look } from '../slides';
import { Icon } from '../components/Icon';
import Menu from '../wiki/Menu';

// literal colours only: a deck's Markdown has to mean the same in Marp or Slidev
const FILLS = [null, ...BACKGROUND_COLORS.slice(1), '#2a2723'];
const INKS = [null, ...STROKE_COLORS.slice(1), '#2a2723', '#fdfdfc'];
/** A theme is a pair of Marp's deck directives: paper and ink. */
const THEMES: [string, string | null, string | null][] = [
  ['Paper', null, null],
  ['Kraft', '#f4e4b4', '#2a2723'],
  ['Sky', '#d4e2f0', '#22304a'],
  ['Night', '#1f1d1a', '#f2efe9'],
];
const hex = (color: string | undefined) => (/^#[0-9a-f]{6}$/i.test(color ?? '') ? color! : '#888888');
const SIZES = [['S', 0.75], ['M', undefined], ['L', 1.5], ['XL', 2.2]] as const;

function Swatches({ label, colors, value, onPick, menu = true }: {
  label: string;
  colors: (string | null)[];
  menu?: boolean;
  value: string | undefined;
  onPick: (color: string | null) => void;
}) {
  return <>
    <div className="wk-menu-label">{label}</div>
    <div className="sl-swatches">
      {colors.map((color) => (
        <button key={color ?? 'none'} type="button" role={menu ? 'menuitemradio' : undefined}
          aria-checked={menu ? (value ?? null) === color : undefined} aria-pressed={menu ? undefined : (value ?? null) === color}
          aria-label={`${label}: ${color ?? 'default'}`} title={color ?? 'Default'}
          className={color ? undefined : 'none'} style={{ background: color ?? undefined }} onClick={() => onPick(color)} />
      ))}
      {/* any colour at all; the menu stays open while it is chosen */}
      <input type="color" aria-label={`${label}: custom`} title="Custom" value={hex(value)}
        className={value && !colors.includes(value) ? 'on' : undefined} onChange={(e) => onPick(e.target.value)} />
    </div>
  </>;
}

/** Four fonts in a row, each written in itself. Picking the one in use clears it. */
function Fonts({ label, value, onPick, menu = true }: { label: string; value: Font | undefined; onPick: (font: Font | null) => void; menu?: boolean }) {
  return <>
    <div className="wk-menu-label">{label}</div>
    <div className="sl-choices">
      {FONTS.map((font) => (
        <button key={font} type="button" role={menu ? 'menuitemradio' : undefined}
          aria-checked={menu ? value === font : undefined} aria-pressed={menu ? undefined : value === font} aria-label={`${label}: ${font}`}
          className={`sl-font-${font}`} onClick={() => onPick(value === font ? null : font)}>
          {font[0].toUpperCase() + font.slice(1)}
        </button>
      ))}
    </div>
  </>;
}

/** Dress the slide being written, and set the deck's fonts. */
export function StylePanel({ look, onSlide, onDeck, onTheme }: {
  look: Look;
  onSlide: (key: 'backgroundColor' | 'color' | 'class', value: string | null) => void;
  onDeck: (key: 'font' | 'headingFont' | 'transition', value: string | null) => void;
  onTheme: (background: string | null, color: string | null) => void;
}) {
  const classes = (lead: boolean, invert: boolean) => [lead && 'lead', invert && 'invert'].filter(Boolean).join(' ') || null;
  return (
    <div className="sl-style" role="region" aria-label="Slide style">
      <h2>Slide</h2>
      <Swatches menu={false} label="Slide background" colors={FILLS} value={look.background} onPick={(c) => onSlide('backgroundColor', c)} />
      <Swatches menu={false} label="Slide text" colors={INKS} value={look.color} onPick={(c) => onSlide('color', c)} />
      <button type="button" className="wk-btn sl-toggle" aria-pressed={look.lead} onClick={() => onSlide('class', classes(!look.lead, look.invert))}>
        Centered
      </button>
      <button type="button" className="wk-btn sl-toggle" aria-pressed={look.invert} onClick={() => onSlide('class', classes(look.lead, !look.invert))}>
        Inverted
      </button>
      <hr />
      <h2>Deck</h2>
      <Fonts menu={false} label="Deck text font" value={look.font} onPick={(f) => onDeck('font', f)} />
      <Fonts menu={false} label="Deck heading font" value={look.headingFont} onPick={(f) => onDeck('headingFont', f)} />
      <div className="wk-menu-label">Deck theme</div>
      <div className="sl-choices">
        {THEMES.map(([name, background, color]) => (
          <button key={name} type="button" aria-pressed={(look.background ?? null) === background && (look.color ?? null) === color} aria-label={`Deck theme: ${name}`}
            style={{ background: background ?? undefined, color: color ?? undefined }} onClick={() => onTheme(background, color)}>
            {name}
          </button>
        ))}
      </div>
      <div className="wk-menu-label">Transition</div>
      <div className="sl-choices">
        {([undefined, ...TRANSITIONS] as const).map((t) => (
          <button key={t ?? 'none'} type="button" aria-pressed={look.transition === t} aria-label={`Transition: ${t ?? 'none'}`}
            onClick={() => onDeck('transition', t ?? null)}>
            {t ? t[0].toUpperCase() + t.slice(1) : 'None'}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The selected text box or shape: its colours, font and size. */
export function BoxBar({ box, editable, onChange, onOrder, onText, onSource, onDuplicate, onRemove }: {
  box: Box;
  /** it holds words: a line, an arrow and an image do not */
  editable: boolean;
  onChange: (patch: Partial<Box>) => void;
  onOrder: (to: 'front' | 'back') => void;
  /** Edit words directly on the slide. */
  onText: () => void;
  onSource: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="sl-boxbar" role="toolbar" aria-label={!box.shape ? 'Text box' : box.shape === 'image' ? 'Image' : 'Shape'}>
      <Menu label="Object style" className="wk-btn" button={<>
        <span className="sl-dot" style={{ background: box.background, borderColor: box.stroke }} />
        Style
      </>}>
        {box.shape !== 'image' && <Swatches label="Fill" colors={editable ? FILLS : INKS} value={box.background}
          onPick={(c) => onChange({ background: c ?? undefined })} />}
        {editable && <>
          {box.shape && <Swatches label="Border" colors={INKS} value={box.stroke} onPick={(c) => onChange({ stroke: c ?? undefined })} />}
          <Swatches label="Text" colors={INKS} value={box.color} onPick={(c) => onChange({ color: c ?? undefined })} />
          <Fonts label="Font" value={box.font} onPick={(f) => onChange({ font: f ?? undefined })} />
          <div className="wk-menu-label">Size</div>
          <div className="sl-choices">
            {SIZES.map(([name, size]) => (
              <button key={name} role="menuitemradio" aria-checked={box.size === size} aria-label={`Size: ${name}`}
                onClick={() => onChange({ size })}>{name}</button>
            ))}
          </div>
          <div className="wk-menu-label">Text alignment</div>
          <div className="sl-choices">
            {(['left', 'center', 'right'] as const).map((align) => (
              <button key={align} role="menuitemradio" aria-label={`Text alignment: ${align}`}
                aria-checked={(box.align ?? (box.shape ? 'center' : 'left')) === align} onClick={() => onChange({ align })}>
                {align[0].toUpperCase() + align.slice(1)}
              </button>
            ))}
          </div>
          <hr />
        </>}
        <button role="menuitem" onClick={() => onOrder('front')}>Bring to front</button>
        <button role="menuitem" onClick={() => onOrder('back')}>Send to back</button>
        <button role="menuitem" onClick={onSource}>Edit source</button>
        {!!box.rotate && <button role="menuitem" onClick={() => onChange({ rotate: undefined })}>Straighten</button>}
      </Menu>
      {editable && <button className="wk-btn" onClick={onText}>Edit text</button>}
      {editable && <div className="sl-text-controls">
        <select aria-label="Object font" value={box.font ?? ''} onChange={(e) => onChange({ font: FONTS.find((f) => f === e.target.value) })}>
          <option value="">Font</option>
          {FONTS.map((font) => <option key={font} value={font}>{font[0].toUpperCase() + font.slice(1)}</option>)}
        </select>
        <select aria-label="Object font size" value={box.size ?? 1} onChange={(e) => onChange({ size: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })}>
          {[0.75, 1, 1.5, 2.2].map((size, i) => <option key={size} value={size}>{['S', 'M', 'L', 'XL'][i]}</option>)}
          {box.size && ![0.75, 1, 1.5, 2.2].includes(box.size) && <option value={box.size}>{box.size}×</option>}
        </select>
        {(['left', 'center', 'right'] as const).map((align) => (
          <button type="button" key={align} className="wk-icon" aria-label={`Align text ${align}`} title={`Align text ${align}`}
            aria-pressed={(box.align ?? (box.shape ? 'center' : 'left')) === align} onClick={() => onChange({ align })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <path d="M3 5h18M3 13h18" /><path d={align === 'left' ? 'M3 9h11M3 17h11' : align === 'right' ? 'M10 9h11M10 17h11' : 'M7 9h10M7 17h10'} />
            </svg>
          </button>
        ))}
      </div>}
      <span />
      <button className="wk-btn" title="Duplicate · Ctrl/⌘D" onClick={onDuplicate}>Duplicate</button>
      <button className="wk-icon" title="Delete  ·  ⌫" aria-label="Delete object" onClick={onRemove}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}
