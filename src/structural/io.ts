import type { Cardinality, ClassCard, ClassDiagram, ClassMarker, ClassNamespace, ErDiagram, ErEntity, StructuralCard, StructuralDiagram, StructuralParseResult, StructuralRef, StructuralSource } from './types.ts';

let sequence = 0;
export const makeStructuralId = () => `r${Date.now().toString(36)}${(sequence++).toString(36)}`;
const NAME = '("(?:[^"\\\\]|\\\\.)*"|[A-Za-z_][A-Za-z0-9_.-]*)';
const unquote = (value: string): string => { if (!value.startsWith('"')) return value; const result: unknown = JSON.parse(value); if (typeof result !== 'string') throw new Error('Expected quoted text'); return result; };
const quote = (value: string) => JSON.stringify(value);
const name = (value: string) => /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(value) ? value : quote(value);
const decodeText = (value: string) => value.replace(/#(34|35|59);/g, (_m, n: string) => String.fromCharCode(Number(n))).replace(/<br\s*\/?\s*>/gi, '\n');
const encodeText = (value: string) => value.replace(/#/g, '#35;').replace(/"/g, '#34;').replace(/\r?\n/g, '<br/>');
const card = (id: string, index: number): StructuralCard => ({ id, label: id, position: { x: (index % 4) * 300, y: Math.floor(index / 4) * 240 }, collapsed: false });
const leftCards: Record<string, Cardinality> = { '||': 'one', '|o': 'zero-or-one', '}|': 'one-or-more', '}o': 'zero-or-more', 'o|': 'zero-or-one' };
const rightCards: Record<string, Cardinality> = { '||': 'one', 'o|': 'zero-or-one', '|{': 'one-or-more', 'o{': 'zero-or-more', '|o': 'zero-or-one' };
const marker = (token: string): ClassMarker => token === '<|' || token === '|>' ? 'inheritance' : token === '*' ? 'composition' : token === 'o' ? 'aggregation' : token === '<' || token === '>' ? 'association' : 'none';

function statements(source: string, er: boolean): { text: string; line: number }[] {
  const result: { text: string; line: number }[] = [];
  source.replace(/\r\n/g, '\n').split('\n').forEach((raw, line) => {
    const text = raw.trim();
    if (!text || text.startsWith('%%') || (er && /--|\.\./.test(text))) { if (text) result.push({ text, line }); return; }
    let part = ''; let quoted = false; let escaped = false;
    for (const ch of text) {
      if (ch === '"' && !escaped) quoted = !quoted;
      if (!quoted && (ch === '{' || ch === '}' || ch === ';')) {
        if (part.trim()) result.push({ text: part.trim(), line });
        if (ch !== ';') result.push({ text: ch, line });
        part = '';
      } else part += ch;
      escaped = ch === '\\' && !escaped;
    }
    if (part.trim()) result.push({ text: part.trim(), line });
  });
  return result;
}

export function parseStructural(source: string): StructuralParseResult {
  const header = source.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith('%%'))?.trim();
  if (header !== 'erDiagram' && header !== 'classDiagram') return { ok: false, error: 'Line 1: Expected erDiagram or classDiagram' };
  const er: ErDiagram = { kind: 'er', direction: 'TB', entities: [], relationships: [] };
  const classes: ClassDiagram = { kind: 'class', direction: 'TB', classes: [], namespaces: [], notes: [], relationships: [] };
  const diagram = header === 'erDiagram' ? er : classes;
  const refs = new Map<number, StructuralRef>();
  const ids = new Set<string>();
  const pages = new Map<string, string[]>();
  const stack: { kind: 'entity' | 'class' | 'namespace'; id: string }[] = [];
  let waiting: { kind: 'entity' | 'class' | 'namespace'; id: string } | null = null;
  let pending: string | null = null;
  let currentLine = 0;
  function fail(message: string): never { throw new Error(`Line ${currentLine + 1}: ${message}`); }
  const newId = () => { const id = pending ?? makeStructuralId(); pending = null; if (ids.has(id)) fail(`Duplicate element ID ${id}`); ids.add(id); return id; };
  const ref = (kind: StructuralRef['kind'], id: string) => refs.set(currentLine, { kind, id });
  const ensureEntity = (id: string): ErEntity => {
    let entity = er.entities.find((e) => e.id === id);
    if (!entity) { if (ids.has(id)) fail(`Conflicting ID ${id}`); ids.add(id); entity = { ...card(id, er.entities.length), attributes: [] }; er.entities.push(entity); }
    return entity;
  };
  const namespace = () => stack.findLast((s) => s.kind === 'namespace')?.id ?? null;
  const ensureClass = (id: string): ClassCard => {
    let c = classes.classes.find((e) => e.id === id);
    if (!c) { if (ids.has(id)) fail(`Conflicting ID ${id}`); ids.add(id); c = { ...card(id, classes.classes.length), generics: '', annotations: [], namespaceId: namespace(), members: [] }; classes.classes.push(c); }
    return c;
  };
  const member = (owner: ClassCard, signature: string) => {
    if (!signature || /^(?:style|classDef|click|link|cssClass|callback)\b/.test(signature)) fail('Unsupported class member');
    if (signature.startsWith('<<')) {
      const annotation = /^<<([^<>]+)>>$/.exec(signature);
      if (!annotation) fail('Malformed class annotation');
      owner.annotations.push(annotation[1]); ref('class', owner.id); return;
    }
    const id = newId(); owner.members.push({ id, kind: signature.includes('(') ? 'method' : 'attribute', signature: decodeText(signature) }); ref('member', id);
  };
  try {
    for (const item of statements(source, diagram.kind === 'er')) {
      currentLine = item.line; const line = item.text;
      if (line === header) continue;
      const meta = /^%%\s+merfolk-id\s+([A-Za-z0-9_.-]+)$/.exec(line);
      if (meta) { if (pending) fail('ID metadata must precede an element'); pending = meta[1]; continue; }
      const page = new RegExp(`^%%\\s+merfolk-pages\\s+${NAME}\\s+(.+)$`).exec(line);
      if (page) { const raw: unknown = JSON.parse(page[2]); if (!Array.isArray(raw) || !raw.every((v: unknown) => typeof v === 'string' && v.length)) fail('Invalid page IDs'); pages.set(unquote(page[1]), [...new Set<string>(raw)]); continue; }
      if (line.startsWith('%% merfolk-empty-namespace ')) {
        const raw: unknown = JSON.parse(line.slice('%% merfolk-empty-namespace '.length));
        const n = record(raw); const id = string(n.id); const label = string(n.label); const parentId = n.parentId === null ? null : string(n.parentId);
        if (diagram.kind !== 'class' || ids.has(id)) fail('Invalid empty namespace metadata');
        ids.add(id); classes.namespaces.push({ ...card(id, classes.namespaces.length), label, parentId });
        ref('namespace', id); continue;
      }
      if (line.startsWith('%%')) { if (/^%%\s+merfolk-/.test(line)) fail('Malformed merfolk metadata'); continue; }
      if (line === '{') { if (!waiting) fail('Unexpected opening brace'); stack.push(waiting); waiting = null; continue; }
      if (line === '}') { if (!stack.length) fail('Unexpected closing brace'); if (pending) fail('ID metadata must precede an element'); const closed = stack.pop(); if (closed) ref(closed.kind, closed.id); waiting = null; continue; }
      waiting = null;
      const direction = /^direction\s+(TB|TD|BT|LR|RL)$/.exec(line);
      if (direction) { const d = direction[1] === 'TD' ? 'TB' : direction[1]; if (d === 'TB' || d === 'BT' || d === 'LR' || d === 'RL') diagram.direction = d; continue; }
      const owner = stack.at(-1);
      if (diagram.kind === 'er') {
        if (owner?.kind === 'entity') {
          const attribute = /^(\S+)\s+([^\s,]+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+("(?:[^"\\]|\\.)*"))?$/.exec(line);
          if (!attribute) fail(`Malformed attribute: ${line}`);
          const keys = (attribute[3]?.split(/\s*,\s*/) ?? []).map((key): 'PK' | 'FK' | 'UK' => { if (key !== 'PK' && key !== 'FK' && key !== 'UK') fail('Invalid attribute key'); return key; });
          const id = newId(); ensureEntity(owner.id).attributes.push({ id, type: attribute[1], name: attribute[2], keys, comment: attribute[4] ? decodeText(unquote(attribute[4])) : '' }); ref('attribute', id); continue;
        }
        const relationship = new RegExp(`^${NAME}\\s+(\\|\\||[|o][|o]|}[|o])(--|\\.\\.)(\\|\\||[|o][|o]|[|o]{)\\s+${NAME}\\s*:\\s*(.*)$`).exec(line);
        if (relationship) {
          const sourceId = unquote(relationship[1]); const targetId = unquote(relationship[5]); ensureEntity(sourceId); ensureEntity(targetId);
          const left = leftCards[relationship[2]], right = rightCards[relationship[4]];
          if (!left || !right) fail('Unsupported cardinality');
          const id = newId(); er.relationships.push({ id, source: sourceId, target: targetId, label: decodeText(relationship[6].startsWith('"') ? unquote(relationship[6]) : relationship[6]), sourceCardinality: left, targetCardinality: right, identifying: relationship[3] === '--' }); ref('relationship', id); continue;
        }
        const declaration = new RegExp(`^${NAME}(?:\\s*\\[\\s*(.*?)\\s*\\])?$`).exec(line);
        if (declaration) { const e = ensureEntity(unquote(declaration[1])); if (declaration[2]) e.label = decodeText(unquote(declaration[2])); ref('entity', e.id); waiting = { kind: 'entity', id: e.id }; continue; }
      } else {
        if (owner?.kind === 'class') { member(ensureClass(owner.id), line); continue; }
        const ns = /^namespace\s+([A-Za-z_][A-Za-z0-9_.-]*)(?:\s*\[\s*(.*?)\s*\])?$/.exec(line);
        if (ns) {
          const parentId = namespace(); const id = pending ?? (parentId && !ns[1].startsWith(`${parentId}.`) ? `${parentId}.${ns[1]}` : ns[1]); pending = null;
          if (ids.has(id)) fail(`Duplicate namespace ${id}`); ids.add(id);
          const n: ClassNamespace = { ...card(id, classes.namespaces.length), label: ns[2] ? decodeText(unquote(ns[2])) : ns[1], parentId };
          classes.namespaces.push(n); ref('namespace', id); waiting = { kind: 'namespace', id }; continue;
        }
        const relation = new RegExp(`^${NAME}(?:\\s+"([^"]*)")?\\s*(<\\||\\|>|[<>*o])?(--|\\.\\.)(<\\||\\|>|[<>*o])?\\s*(?:"([^"]*)"\\s+)?${NAME}(?:\\s*:\\s*(.*))?$`).exec(line);
        if (relation) {
          const a = unquote(relation[1]); const b = unquote(relation[7]); ensureClass(a); ensureClass(b);
          const id = newId(); classes.relationships.push({ id, source: a, target: b, label: decodeText(relation[8] ?? ''), sourceMarker: marker(relation[3] ?? ''), targetMarker: marker(relation[5] ?? ''), lineStyle: relation[4] === '--' ? 'solid' : 'dashed', sourceMultiplicity: relation[2] ?? '', targetMultiplicity: relation[6] ?? '' }); ref('relationship', id); continue;
        }
        const annotation = /^<<([^<>]+)>>\s+([A-Za-z_][A-Za-z0-9_.-]*)$/.exec(line);
        if (annotation) { const c = ensureClass(annotation[2]); c.annotations.push(annotation[1]); ref('class', c.id); continue; }
        const note = /^note(?:\s+for\s+([A-Za-z_][A-Za-z0-9_.-]*))?\s+("(?:[^"\\]|\\.)*")$/.exec(line);
        if (note) { if (note[1]) ensureClass(note[1]); const id = newId(); classes.notes.push({ id, classId: note[1] ?? null, text: decodeText(unquote(note[2])) }); ref('note', id); continue; }
        const declaration = /^class\s+([A-Za-z_][A-Za-z0-9_.-]*)(?:~([^~]+)~)?(?:\s*\[\s*(.*?)\s*\])?$/.exec(line);
        if (declaration) { const c = ensureClass(declaration[1]); if (namespace()) c.namespaceId = namespace(); if (declaration[2]) c.generics = declaration[2]; if (declaration[3]) c.label = decodeText(unquote(declaration[3])); ref('class', c.id); waiting = { kind: 'class', id: c.id }; continue; }
        const inline = /^([A-Za-z_][A-Za-z0-9_.-]*)\s*:\s*(.+)$/.exec(line);
        if (inline) { member(ensureClass(inline[1]), inline[2]); continue; }
      }
      fail(`Unsupported or malformed ${diagram.kind} statement: ${line}`);
    }
    if (stack.length) fail('Missing closing brace');
    if (pending) fail('ID metadata must precede an element');
    for (const [id, pageIds] of pages) {
      const target = diagram.kind === 'er' ? diagram.entities.find((e) => e.id === id) : [...diagram.classes, ...diagram.namespaces].find((e) => e.id === id);
      if (!target) fail(`Page metadata refers to unknown element ${id}`); target.pageIds = pageIds;
    }
    return { ok: true, diagram, lineRefs: refs };
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Invalid structural diagram' }; }
}

const sourceCard: Record<Cardinality, string> = { one: '||', 'zero-or-one': '|o', 'one-or-more': '}|', 'zero-or-more': '}o' };
const targetCard: Record<Cardinality, string> = { one: '||', 'zero-or-one': 'o|', 'one-or-more': '|{', 'zero-or-more': 'o{' };
const startMarker: Record<ClassMarker, string> = { none: '', inheritance: '<|', composition: '*', aggregation: 'o', association: '<' };
const endMarker: Record<ClassMarker, string> = { none: '', inheritance: '|>', composition: '*', aggregation: 'o', association: '>' };
export function emitStructural(diagram: StructuralDiagram): StructuralSource {
  const lines = [diagram.kind === 'er' ? 'erDiagram' : 'classDiagram', `  direction ${diagram.direction}`];
  const lineRefs = new Map<number, StructuralRef>();
  const add = (text: string, kind: StructuralRef['kind'], id: string) => { lineRefs.set(lines.length, { kind, id }); lines.push(text); };
  const id = (value: string, pad = '  ') => lines.push(`${pad}%% merfolk-id ${value}`);
  const pages = (value: StructuralCard, pad = '  ') => { if (value.pageIds !== undefined) lines.push(`${pad}%% merfolk-pages ${quote(value.id)} ${JSON.stringify(value.pageIds)}`); };
  if (diagram.kind === 'er') {
    for (const entity of diagram.entities) {
      add(`  ${name(entity.id)}${entity.label !== entity.id ? `[${quote(encodeText(entity.label))}]` : ''} {`, 'entity', entity.id);
      for (const a of entity.attributes) { id(a.id, '    '); add(`    ${a.type} ${a.name}${a.keys.length ? ` ${a.keys.join(', ')}` : ''}${a.comment ? ` ${quote(encodeText(a.comment))}` : ''}`, 'attribute', a.id); }
      add('  }', 'entity', entity.id); pages(entity);
    }
    for (const r of diagram.relationships) { id(r.id); add(`  ${name(r.source)} ${sourceCard[r.sourceCardinality]}${r.identifying ? '--' : '..'}${targetCard[r.targetCardinality]} ${name(r.target)} : ${quote(encodeText(r.label))}`, 'relationship', r.id); }
  } else {
    const emitClass = (c: ClassCard, pad: string) => {
      add(`${pad}class ${c.id}${c.generics ? `~${c.generics}~` : ''}${c.label !== c.id ? `[${quote(encodeText(c.label))}]` : ''} {`, 'class', c.id);
      for (const annotation of c.annotations) add(`${pad}  <<${annotation}>>`, 'class', c.id);
      for (const member of c.members) { id(member.id, `${pad}  `); add(`${pad}  ${member.signature.replace(/\r?\n/g, '<br/>')}`, 'member', member.id); }
      add(`${pad}}`, 'class', c.id); pages(c, pad);
    };
    const hasContent = (nsId: string, seen = new Set<string>()): boolean => {
      if (seen.has(nsId)) return false;
      seen.add(nsId);
      return diagram.classes.some((c) => c.namespaceId === nsId) || diagram.namespaces.some((n) => n.parentId === nsId && hasContent(n.id, seen));
    };
    const emitNamespace = (parentId: string | null, pad: string) => {
      for (const ns of diagram.namespaces.filter((n) => n.parentId === parentId)) {
        if (!hasContent(ns.id)) {
          lines.push(`${pad}%% merfolk-empty-namespace ${JSON.stringify({ id: ns.id, label: ns.label, parentId: ns.parentId })}`);
          pages(ns, pad); emitNamespace(ns.id, pad); continue;
        }
        const local = parentId && ns.id.startsWith(`${parentId}.`) ? ns.id.slice(parentId.length + 1) : ns.id;
        id(ns.id, pad);
        add(`${pad}namespace ${local}${ns.label !== local ? `[${quote(encodeText(ns.label))}]` : ''} {`, 'namespace', ns.id);
        for (const c of diagram.classes.filter((c) => c.namespaceId === ns.id)) emitClass(c, `${pad}  `);
        emitNamespace(ns.id, `${pad}  `); add(`${pad}}`, 'namespace', ns.id); pages(ns, pad);
      }
    };
    for (const c of diagram.classes.filter((c) => !c.namespaceId)) emitClass(c, '  ');
    emitNamespace(null, '  ');
    for (const note of diagram.notes) { id(note.id); add(`  note${note.classId ? ` for ${note.classId}` : ''} ${quote(encodeText(note.text))}`, 'note', note.id); }
    for (const r of diagram.relationships) { id(r.id); add(`  ${r.source}${r.sourceMultiplicity ? ` ${quote(r.sourceMultiplicity)}` : ''} ${startMarker[r.sourceMarker]}${r.lineStyle === 'solid' ? '--' : '..'}${endMarker[r.targetMarker]}${r.targetMultiplicity ? ` ${quote(r.targetMultiplicity)}` : ''} ${r.target}${r.label ? ` : ${encodeText(r.label)}` : ''}`, 'relationship', r.id); }
  }
  return { text: lines.join('\n'), lineRefs };
}

export function sampleStructural(kind: 'er' | 'class'): StructuralDiagram {
  const parsed = parseStructural(kind === 'er' ? 'erDiagram\nCUSTOMER {\nint id PK\nstring email UK\n}\nORDER {\nint id PK\nint customer_id FK\n}\nCUSTOMER ||--o{ ORDER : places' : 'classDiagram\nnamespace Domain {\nclass Animal {\n<<abstract>>\n+String name\n+move() void\n}\nclass Duck {\n+quack() void\n}\n}\nAnimal <|-- Duck');
  if (!parsed.ok) throw new Error(parsed.error); return parsed.diagram;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected structural object');
  return Object.fromEntries(Object.entries(value));
}
const string = (value: unknown): string => { if (typeof value !== 'string') throw new Error('Expected text'); return value; };
const array = (value: unknown): unknown[] => { if (!Array.isArray(value)) throw new Error('Expected array'); return value; };
const boolean = (value: unknown): boolean => { if (typeof value !== 'boolean') throw new Error('Expected boolean'); return value; };
const finite = (value: unknown): number => { if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected finite number'); return value; };
function readStyle(value: unknown): import('../types.ts').ElementStyle | undefined {
  if (value === undefined) return undefined;
  const s = record(value); const style: import('../types.ts').ElementStyle = {};
  for (const key of ['stroke', 'background'] as const) if (s[key] !== undefined) style[key] = string(s[key]);
  for (const key of ['strokeWidth', 'fontSize', 'opacity', 'animationSpeed'] as const) if (s[key] !== undefined) style[key] = finite(s[key]);
  if (s.sloppiness !== undefined) { if (s.sloppiness !== 0 && s.sloppiness !== 1 && s.sloppiness !== 2) throw new Error('Invalid sloppiness'); style.sloppiness = s.sloppiness; }
  if (s.strokeStyle !== undefined) { if (s.strokeStyle !== 'solid' && s.strokeStyle !== 'dashed' && s.strokeStyle !== 'dotted') throw new Error('Invalid stroke style'); style.strokeStyle = s.strokeStyle; }
  if (s.edges !== undefined) { if (s.edges !== 'sharp' && s.edges !== 'round') throw new Error('Invalid edge style'); style.edges = s.edges; }
  if (s.fontFamily !== undefined) { if (s.fontFamily !== 'sans' && s.fontFamily !== 'serif' && s.fontFamily !== 'mono' && s.fontFamily !== 'hand') throw new Error('Invalid font family'); style.fontFamily = s.fontFamily; }
  if (s.animation !== undefined) { if (s.animation !== 'none' && s.animation !== 'pulse' && s.animation !== 'fade' && s.animation !== 'draw' && s.animation !== 'flow') throw new Error('Invalid animation'); style.animation = s.animation; }
  return style;
}
export function decodeStructural(value: unknown): StructuralDiagram {
  const source = record(value);
  if (source.kind !== 'er' && source.kind !== 'class') throw new Error('Expected ER or class diagram');
  const direction = source.direction;
  if (direction !== 'TB' && direction !== 'BT' && direction !== 'LR' && direction !== 'RL') throw new Error('Invalid diagram direction');
  const ids = new Set<string>();
  const identifier = (value: unknown): string => { const id = string(value); if (!id || /[\r\n]/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate structural ID ${id}`); ids.add(id); return id; };
  const baseCard = (s: Record<string, unknown>): StructuralCard => {
    const position = record(s.position);
    const c: StructuralCard = { id: identifier(s.id), label: string(s.label), position: { x: finite(position.x), y: finite(position.y) }, collapsed: boolean(s.collapsed) };
    if (s.pageIds !== undefined) c.pageIds = [...new Set(array(s.pageIds).map((v) => { const id = string(v); if (!id) throw new Error('Empty page ID'); return id; }))];
    if (s.style !== undefined) c.style = readStyle(s.style);
    return c;
  };
  const commonRelation = (s: Record<string, unknown>) => ({ id: identifier(s.id), source: string(s.source), target: string(s.target), label: string(s.label), ...(s.style !== undefined && { style: readStyle(s.style) }) });
  let diagram: StructuralDiagram;
  if (source.kind === 'er') {
    const entities = array(source.entities).map((v): ErEntity => {
      const s = record(v); const base = baseCard(s);
      const attributes = array(s.attributes).map((v) => { const a = record(v); return { id: identifier(a.id), type: string(a.type), name: string(a.name), comment: string(a.comment), keys: array(a.keys).map((key): 'PK' | 'FK' | 'UK' => { if (key !== 'PK' && key !== 'FK' && key !== 'UK') throw new Error('Invalid attribute key'); return key; }) }; });
      return { ...base, attributes };
    });
    const cardinality = (v: unknown): Cardinality => { if (v !== 'one' && v !== 'zero-or-one' && v !== 'one-or-more' && v !== 'zero-or-more') throw new Error('Invalid cardinality'); return v; };
    const relationships = array(source.relationships).map((v) => { const s = record(v); return { ...commonRelation(s), sourceCardinality: cardinality(s.sourceCardinality), targetCardinality: cardinality(s.targetCardinality), identifying: boolean(s.identifying) }; });
    const entityIds = new Set(entities.map((e) => e.id));
    if (relationships.some((r) => !entityIds.has(r.source) || !entityIds.has(r.target))) throw new Error('Unknown relationship entity');
    diagram = { kind: 'er', direction, entities, relationships };
  } else {
    const namespaces = array(source.namespaces).map((v): ClassNamespace => { const s = record(v); return { ...baseCard(s), parentId: s.parentId === null ? null : string(s.parentId) }; });
    const namespaceIds = new Set(namespaces.map((n) => n.id));
    for (const ns of namespaces) {
      const chain = new Set<string>([ns.id]); let parent = ns.parentId;
      while (parent !== null) { if (!namespaceIds.has(parent) || chain.has(parent)) throw new Error('Invalid namespace hierarchy'); chain.add(parent); parent = namespaces.find((n) => n.id === parent)?.parentId ?? null; }
    }
    const classes = array(source.classes).map((v): ClassCard => {
      const s = record(v); const base = baseCard(s); const namespaceId = s.namespaceId === null ? null : string(s.namespaceId);
      if (namespaceId !== null && !namespaceIds.has(namespaceId)) throw new Error('Unknown class namespace');
      return { ...base, namespaceId, generics: string(s.generics), annotations: array(s.annotations).map(string), members: array(s.members).map((v) => { const m = record(v); const kind = m.kind; if (kind !== 'attribute' && kind !== 'method') throw new Error('Invalid member kind'); const signature = string(m.signature); if ((signature.includes('(') ? 'method' : 'attribute') !== kind) throw new Error('Member kind disagrees with signature'); return { id: identifier(m.id), kind, signature }; }) };
    });
    const classIds = new Set(classes.map((c) => c.id));
    const readMarker = (v: unknown): ClassMarker => { if (v !== 'none' && v !== 'inheritance' && v !== 'composition' && v !== 'aggregation' && v !== 'association') throw new Error('Invalid relationship marker'); return v; };
    const relationships = array(source.relationships).map((v): import('./types.ts').ClassRelationship => { const s = record(v); const lineStyle = s.lineStyle; if (lineStyle !== 'solid' && lineStyle !== 'dashed') throw new Error('Invalid line style'); return { ...commonRelation(s), sourceMarker: readMarker(s.sourceMarker), targetMarker: readMarker(s.targetMarker), lineStyle, sourceMultiplicity: string(s.sourceMultiplicity), targetMultiplicity: string(s.targetMultiplicity) }; });
    if (relationships.some((r) => !classIds.has(r.source) || !classIds.has(r.target))) throw new Error('Unknown relationship class');
    const notes = array(source.notes).map((v) => { const s = record(v); const classId = s.classId === null ? null : string(s.classId); if (classId !== null && !classIds.has(classId)) throw new Error('Unknown note class'); return { id: identifier(s.id), classId, text: string(s.text) }; });
    diagram = { kind: 'class', direction, classes, namespaces, relationships, notes };
  }
  const parsed = parseStructural(emitStructural(diagram).text);
  if (!parsed.ok) throw new Error(parsed.error);
  return diagram;
}
