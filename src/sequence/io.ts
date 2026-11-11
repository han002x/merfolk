import type { Fragment, Participant, SequenceDiagram, SequenceEvent, SequenceRef, SequenceSource } from './types.ts';

let idCounter = 0;
export const makeSequenceId = (): string => `s${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function walkEvents(events: SequenceEvent[]): SequenceEvent[] {
  return events.flatMap((event) => event.kind === 'fragment'
    ? [event, ...event.branches.flatMap((branch) => walkEvents(branch.events))]
    : [event]);
}

export type SequenceParseResult =
  | { ok: true; diagram: SequenceDiagram; lineRefs: Map<number, SequenceRef> }
  | { ok: false; error: string };

const decode = (text: string) => text.replace(/#(35|59|58|38);/g, (_all, code: string) => String.fromCharCode(Number(code))).replace(/<br\s*\/?\s*>/gi, '\n');
const encode = (text: string) => text.replace(/#/g, '#35;').replace(/;/g, '#59;').replace(/#35#59;/g, '#35;').replace(/\r?\n/g, '<br/>');
const IDENT = '[A-Za-z_][A-Za-z0-9_]*';

/** Parse only the sequence syntax the canvas can edit, with no silent omissions. */
export function parseSequence(source: string): SequenceParseResult {
  const diagram: SequenceDiagram = { kind: 'sequence', participants: [], events: [] };
  const participants = new Map<string, Participant>();
  const declared = new Set<string>();
  const ids = new Set<string>();
  const lineRefs = new Map<number, SequenceRef>();
  const stack: Fragment[] = [];
  let pendingId: string | undefined;
  let header = false;
  let lineNumber = 0;
  function fail(message: string): never { throw new Error(`Line ${lineNumber + 1}: ${message}`); }
  const ensure = (id: string): Participant => {
    const existing = participants.get(id);
    if (existing) return existing;
    const participant: Participant = { id, label: id, kind: 'participant' };
    participants.set(id, participant);
    diagram.participants.push(participant);
    return participant;
  };
  const targetEvents = (): SequenceEvent[] => {
    const current = stack.at(-1);
    return current ? current.branches[current.branches.length - 1].events : diagram.events;
  };
  const eventId = (): string => {
    const id = pendingId ?? makeSequenceId();
    pendingId = undefined;
    if (ids.has(id)) fail(`Duplicate event ID ${id}`);
    ids.add(id);
    return id;
  };
  const push = (event: SequenceEvent) => {
    targetEvents().push(event);
    lineRefs.set(lineNumber, { kind: event.kind, id: event.id });
  };
  try {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    for (lineNumber = 0; lineNumber < lines.length; lineNumber++) {
      const line = lines[lineNumber].trim();
      if (!line) continue;
      const metadata = /^%%\s+merfolk-id\s+([A-Za-z0-9_-]+)\s*$/.exec(line);
      if (metadata) {
        if (pendingId) fail('An event ID must be followed by an event');
        pendingId = metadata[1];
        continue;
      }
      const pages = new RegExp(`^%%\\s+merfolk-pages\\s+(${IDENT})\\s+(.+)$`).exec(line);
      if (pages) {
        const pageIds: unknown = JSON.parse(pages[2]);
        if (!Array.isArray(pageIds) || !pageIds.every((id: unknown) => typeof id === 'string' && id.length > 0)) fail('Page links must be an array of nonempty page IDs');
        ensure(pages[1]).pageIds = [...new Set<string>(pageIds)];
        continue;
      }
      if (line.startsWith('%%')) {
        if (/^%%\s+merfolk-(id|pages)\b/.test(line)) fail('Invalid merfolk metadata');
        continue;
      }
      if (!header) {
        if (line !== 'sequenceDiagram') fail('Expected sequenceDiagram header');
        header = true;
        continue;
      }
      const declaration = new RegExp(`^(participant|actor)\\s+(${IDENT})(?:\\s+as\\s+(.+))?$`).exec(line);
      if (declaration) {
        if (pendingId) fail('An event ID cannot identify a participant');
        if (stack.length) fail('Declare participants outside interaction blocks');
        if (declared.has(declaration[2])) fail(`Duplicate participant ${declaration[2]}`);
        declared.add(declaration[2]);
        const participant = ensure(declaration[2]);
        participant.kind = declaration[1] === 'actor' ? 'actor' : 'participant';
        participant.label = decode(declaration[3] ?? declaration[2]);
        lineRefs.set(lineNumber, { kind: 'participant', id: participant.id });
        continue;
      }
      const block = /^(alt|opt|loop|par)(?:\s+(.*))?$/.exec(line);
      if (block) {
        const operator = block[1];
        if (operator !== 'alt' && operator !== 'opt' && operator !== 'loop' && operator !== 'par') fail('Invalid interaction block');
        const fragment: Fragment = { kind: 'fragment', id: eventId(), operator, branches: [{ label: decode(block[2] ?? ''), events: [] }], collapsed: false };
        push(fragment);
        stack.push(fragment);
        continue;
      }
      const branch = /^(else|and)(?:\s+(.*))?$/.exec(line);
      if (branch) {
        const fragment = stack.at(-1);
        if (!fragment || (branch[1] === 'else' ? fragment.operator !== 'alt' : fragment.operator !== 'par')) fail(`${branch[1]} does not match the current interaction block`);
        if (pendingId) fail('An event ID cannot identify a branch delimiter');
        fragment.branches.push({ label: decode(branch[2] ?? ''), events: [] });
        lineRefs.set(lineNumber, { kind: 'fragment', id: fragment.id });
        continue;
      }
      if (line === 'end') {
        const fragment = stack.pop();
        if (!fragment) fail('end without an interaction block');
        if (pendingId) fail('An event ID cannot identify end');
        lineRefs.set(lineNumber, { kind: 'fragment', id: fragment.id });
        continue;
      }
      const activation = new RegExp(`^(activate|deactivate)\\s+(${IDENT})$`).exec(line);
      if (activation) {
        ensure(activation[2]);
        push({ kind: 'activation', id: eventId(), participant: activation[2], active: activation[1] === 'activate' });
        continue;
      }
      const note = new RegExp(`^Note\\s+(left of|right of|over)\\s+(${IDENT})(?:\\s*,\\s*(${IDENT}))?\\s*:\\s?(.*)$`, 'i').exec(line);
      if (note) {
        const placement = note[1].toLowerCase();
        if (placement !== 'left of' && placement !== 'right of' && placement !== 'over') fail('Invalid note placement');
        if (note[3] && placement !== 'over') fail('Only notes over participants can span two participants');
        const actorIds = [note[2], ...(note[3] ? [note[3]] : [])];
        actorIds.forEach(ensure);
        push({ kind: 'note', id: eventId(), participants: actorIds, placement, text: decode(note[4]) });
        continue;
      }
      const message = new RegExp(`^(${IDENT})\\s*(-->>|->>|-->|->|--x|-x|--\\)|-\\))\\s*([+-])?\\s*(${IDENT})\\s*:\\s?(.*)$`).exec(line);
      if (message) {
        ensure(message[1]); ensure(message[4]);
        push({ kind: 'message', id: eventId(), from: message[1], to: message[4], arrow: message[2], text: decode(message[5]) });
        if (message[3]) targetEvents().push({ kind: 'activation', id: makeSequenceId(), participant: message[3] === '+' ? message[4] : message[1], active: message[3] === '+' });
        continue;
      }
      fail(`Unsupported or malformed sequence statement: ${line}`);
    }
    if (!header) fail('Expected sequenceDiagram header');
    if (stack.length) fail(`Missing end for ${stack.at(-1)?.operator} block`);
    if (pendingId) fail('An event ID must be followed by an event');
    const activations = new Map<string, number>();
    for (const event of walkEvents(diagram.events)) {
      if (event.kind !== 'activation') continue;
      const count = (activations.get(event.participant) ?? 0) + (event.active ? 1 : -1);
      if (count < 0) throw new Error(`Cannot deactivate inactive participant ${event.participant}`);
      activations.set(event.participant, count);
    }
    return { ok: true, diagram, lineRefs };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Invalid sequence diagram' };
  }
}

export function emitSequence(diagram: SequenceDiagram): SequenceSource {
  const lines = ['sequenceDiagram'];
  const lineRefs = new Map<number, SequenceRef>();
  const add = (text: string, ref: SequenceRef) => { lineRefs.set(lines.length, ref); lines.push(text); };
  for (const participant of diagram.participants) {
    add(`  ${participant.kind} ${participant.id} as ${encode(participant.label || participant.id)}`, { kind: 'participant', id: participant.id });
    if (participant.pageIds !== undefined) lines.push(`  %% merfolk-pages ${participant.id} ${JSON.stringify(participant.pageIds)}`);
  }
  const emit = (events: SequenceEvent[], depth: number) => {
    const pad = '  '.repeat(depth);
    for (const event of events) {
      const ref = { kind: event.kind, id: event.id };
      lines.push(`${pad}%% merfolk-id ${event.id}`);
      switch (event.kind) {
        case 'message': add(`${pad}${event.from}${event.arrow}${event.to}: ${encode(event.text)}`, ref); break;
        case 'note': add(`${pad}Note ${event.placement} ${event.participants.join(',')}: ${encode(event.text)}`, ref); break;
        case 'activation': add(`${pad}${event.active ? 'activate' : 'deactivate'} ${event.participant}`, ref); break;
        case 'fragment': {
          event.branches.forEach((branch, index) => {
            const delimiter = index === 0 ? event.operator : event.operator === 'par' ? 'and' : 'else';
            add(`${pad}${delimiter}${branch.label ? ` ${encode(branch.label)}` : ''}`, ref);
            emit(branch.events, depth + 1);
          });
          add(`${pad}end`, ref);
          break;
        }
      }
    }
  };
  emit(diagram.events, 1);
  return { text: lines.join('\n'), lineRefs };
}

export function sampleSequence(): SequenceDiagram {
  const parsed = parseSequence('sequenceDiagram\nactor User\nparticipant API\nparticipant DB as Database\nUser->>+API: Request\nAPI->>DB: Query\nDB-->>API: Result\nalt Found\nAPI-->>User: Response\nelse Missing\nAPI-->>User: Not found\nend\ndeactivate API');
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.diagram;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate saved sequence documents once, before they enter the typed store. */
export function decodeSequence(value: unknown): SequenceDiagram {
  function object(input: unknown): Record<string, unknown> {
    if (!isRecord(input)) throw new Error('Expected a sequence object');
    return input;
  }
  function text(input: unknown): string {
    if (typeof input !== 'string') throw new Error('Expected sequence text');
    return input;
  }
  function id(input: unknown): string {
    const result = text(input);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(result)) throw new Error('Invalid sequence identifier');
    return result;
  }
  function list(input: unknown): unknown[] {
    if (!Array.isArray(input)) throw new Error('Expected a sequence array');
    return input;
  }
  function style(input: unknown): import('../types.ts').ElementStyle | undefined {
    if (input === undefined) return undefined;
    const source = object(input);
    const result: import('../types.ts').ElementStyle = {};
    if (source.stroke !== undefined) result.stroke = text(source.stroke);
    if (source.background !== undefined) result.background = text(source.background);
    for (const key of ['strokeWidth', 'fontSize', 'opacity', 'animationSpeed'] as const) {
      if (source[key] === undefined) continue;
      if (typeof source[key] !== 'number' || !Number.isFinite(source[key])) throw new Error(`Invalid ${key}`);
      result[key] = source[key];
    }
    if (source.sloppiness !== undefined) {
      if (source.sloppiness !== 0 && source.sloppiness !== 1 && source.sloppiness !== 2) throw new Error('Invalid sloppiness');
      result.sloppiness = source.sloppiness;
    }
    if (source.strokeStyle !== undefined) {
      if (source.strokeStyle !== 'solid' && source.strokeStyle !== 'dashed' && source.strokeStyle !== 'dotted') throw new Error('Invalid stroke style');
      result.strokeStyle = source.strokeStyle;
    }
    if (source.edges !== undefined) {
      if (source.edges !== 'sharp' && source.edges !== 'round') throw new Error('Invalid edge style');
      result.edges = source.edges;
    }
    if (source.fontFamily !== undefined) {
      if (source.fontFamily !== 'sans' && source.fontFamily !== 'serif' && source.fontFamily !== 'mono' && source.fontFamily !== 'hand') throw new Error('Invalid font family');
      result.fontFamily = source.fontFamily;
    }
    if (source.animation !== undefined) {
      if (source.animation !== 'none' && source.animation !== 'pulse' && source.animation !== 'fade' && source.animation !== 'draw' && source.animation !== 'flow') throw new Error('Invalid animation');
      result.animation = source.animation;
    }
    return result;
  }
  const document = object(value);
  if (document.kind !== 'sequence') throw new Error('Expected a sequence diagram');
  const participants: Participant[] = list(document.participants).map((input) => {
    const item = object(input);
    if (item.kind !== 'actor' && item.kind !== 'participant') throw new Error('Invalid participant kind');
    const participant: Participant = { id: id(item.id), kind: item.kind, label: text(item.label) };
    const parsedStyle = style(item.style);
    if (parsedStyle) participant.style = parsedStyle;
    if (item.pageIds !== undefined) {
      participant.pageIds = [...new Set(list(item.pageIds).map((pageId) => {
        const result = text(pageId);
        if (!result) throw new Error('Page IDs must not be empty');
        return result;
      }))];
    }
    return participant;
  });
  const participantIds = new Set(participants.map((participant) => participant.id));
  if (participantIds.size !== participants.length) throw new Error('Duplicate participant ID');
  const reference = (input: unknown): string => {
    const result = text(input);
    if (!participantIds.has(result)) throw new Error(`Unknown participant ${result}`);
    return result;
  };
  const eventIds = new Set<string>();
  const events = (input: unknown, depth = 0): SequenceEvent[] => {
    if (depth > 100) throw new Error('Sequence nesting exceeds 100 blocks');
    return list(input).map((inputEvent): SequenceEvent => {
      const item = object(inputEvent);
      const eventId = text(item.id);
      if (!/^[A-Za-z0-9_-]+$/.test(eventId) || eventIds.has(eventId)) throw new Error('Invalid or duplicate event ID');
      eventIds.add(eventId);
      const base = { id: eventId, ...(item.style !== undefined && { style: style(item.style) }) };
      switch (item.kind) {
        case 'message': {
          const arrow = text(item.arrow);
          if (!['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)'].includes(arrow)) throw new Error('Unsupported sequence arrow');
          return { ...base, kind: 'message', from: reference(item.from), to: reference(item.to), text: text(item.text), arrow };
        }
        case 'note': {
          const placement = item.placement;
          if (placement !== 'over' && placement !== 'left of' && placement !== 'right of') throw new Error('Invalid note placement');
          const actors = list(item.participants).map(reference);
          if (actors.length < 1 || actors.length > (placement === 'over' ? 2 : 1)) throw new Error('Invalid note participants');
          return { ...base, kind: 'note', placement, participants: actors, text: text(item.text) };
        }
        case 'activation': {
          if (typeof item.active !== 'boolean') throw new Error('Invalid activation');
          return { ...base, kind: 'activation', participant: reference(item.participant), active: item.active };
        }
        case 'fragment': {
          const operator = item.operator;
          if (operator !== 'alt' && operator !== 'opt' && operator !== 'loop' && operator !== 'par') throw new Error('Unsupported interaction block');
          if (typeof item.collapsed !== 'boolean') throw new Error('Invalid collapse state');
          const branches = list(item.branches).map((inputBranch) => {
            const branch = object(inputBranch);
            return { label: text(branch.label), events: events(branch.events, depth + 1) };
          });
          if (!branches.length || ((operator === 'opt' || operator === 'loop') && branches.length !== 1)) throw new Error('Invalid interaction branches');
          return { ...base, kind: 'fragment', operator, branches, collapsed: item.collapsed };
        }
        default: throw new Error('Unsupported sequence event');
      }
    });
  };
  const diagram: SequenceDiagram = { kind: 'sequence', participants, events: events(document.events) };
  const parsed = parseSequence(emitSequence(diagram).text);
  if (!parsed.ok) throw new Error(parsed.error);
  return diagram;
}
