import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { decodeStructural, emitStructural, parseStructural, sampleStructural } from '../src/structural/io.ts';
import type { Cardinality, ClassDiagram } from '../src/structural/types.ts';
const dom = new JSDOM('<!doctype html><html><body></body></html>');
Object.assign(globalThis, { window: dom.window, document: dom.window.document });
const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
function parse(source: string) { const result = parseStructural(source); assert.ok(result.ok, result.ok ? '' : result.error); return result.diagram; }
for (const kind of ['er', 'class'] as const) {
  const diagram = sampleStructural(kind);
  assert.deepEqual(decodeStructural(diagram), diagram);
  const emitted = emitStructural(diagram);
  await mermaid.parse(emitted.text);
  const roundtrip = parse(emitted.text);
  assert.deepEqual(emitStructural(roundtrip), emitted);
  assert.ok(emitted.lineRefs.size > 0);
}
const er = parse('erDiagram\ndirection LR\nCUSTOMER[Customer] {\nint id PK, FK "Shared key"\nstring email UK\nstring[] tags\n}\nORDER {\nint id PK\n}\nCUSTOMER ||--o{ ORDER : places\nCUSTOMER ||..o{ ORDER : archive\nCUSTOMER |o--o| CUSTOMER : parent');
assert.equal(er.kind, 'er');
if (er.kind === 'er') {
  assert.deepEqual(er.entities[0].attributes.map((a) => [a.type, a.name, a.keys, a.comment]), [['int','id',['PK','FK'],'Shared key'],['string','email',['UK'],''],['string[]','tags',[],'']]);
  assert.equal(er.entities[0].label, 'Customer');
  assert.equal(er.relationships[0].sourceCardinality, 'one');
  assert.equal(er.relationships[0].targetCardinality, 'zero-or-more');
  assert.notEqual(er.relationships[0].id, er.relationships[1].id);
  const cardinalities: Cardinality[] = ['one', 'zero-or-one', 'one-or-more', 'zero-or-more'];
  const expected = { one: 'ONLY_ONE', 'zero-or-one': 'ZERO_OR_ONE', 'one-or-more': 'ONE_OR_MORE', 'zero-or-more': 'ZERO_OR_MORE' };
  for (const left of cardinalities) for (const right of cardinalities) {
    const candidate = { ...er, relationships: [{ ...er.relationships[0], sourceCardinality: left, targetCardinality: right }] };
    const text = emitStructural(candidate).text;
    await mermaid.parse(text);
    const oracle = await mermaid.mermaidAPI.getDiagramFromText(text);
    const r = oracle.db.getRelationships()[0];
    assert.equal(r.relSpec.cardB, expected[left], text);
    assert.equal(r.relSpec.cardA, expected[right], text);
    assert.equal(r.relSpec.relType, 'IDENTIFYING');
  }
  const text = emitStructural(er).text;
  await mermaid.parse(text);
  const oracle = await mermaid.mermaidAPI.getDiagramFromText(text);
  assert.deepEqual(oracle.db.getEntities().get('CUSTOMER').attributes.map((a: {type:string;name:string;keys:string[];comment:string}) => [a.type,a.name,a.keys,a.comment]), er.entities[0].attributes.map((a) => [a.type,a.name,a.keys,a.comment]));
  assert.equal(oracle.db.getEntities().get('CUSTOMER').alias, 'Customer');
  const saved = { ...er, entities: er.entities.map((entity) => ({ ...entity, collapsed: true, position: { x: 12, y: 40 }, pageIds: ['p'], style: { stroke: 'red' } })) };
  assert.deepEqual(decodeStructural(saved), saved);
  assert.deepEqual(parse(emitStructural(saved).text).kind, 'er');
}
const classText = 'classDiagram\ndirection RL\nnamespace Domain {\nclass Box~T~ {\n<<interface>>\n+List~T~ values\n#int count\n+get(int i) T\n+create() Box~T~$\n}\nnamespace Nested {\nclass Item["Item label"]\n}\n}\nnote for Box "A generic box"\nBox "1" o-- "*" Item : contains\nBox ..|> Item\nItem : -String name';
const classes = parse(classText);
assert.equal(classes.kind, 'class');
if (classes.kind === 'class') {
  assert.equal(classes.classes[0].generics, 'T');
  assert.equal(classes.classes[1].namespaceId, 'Domain.Nested');
  assert.deepEqual(classes.classes[0].members.map((m) => m.signature), ['+List~T~ values','#int count','+get(int i) T','+create() Box~T~$']);
  const text = emitStructural(classes).text;
  await mermaid.parse(text);
  const oracle = await mermaid.mermaidAPI.getDiagramFromText(text);
  assert.equal(oracle.db.getClasses().get('Box').parent, 'Domain');
  assert.equal(oracle.db.getClasses().get('Item').parent, 'Domain.Nested');
  assert.equal(oracle.db.getClasses().get('Item').label, 'Item label');
  assert.equal(oracle.db.getClasses().get('Box').members[1].visibility, '#');
  assert.equal(oracle.db.getClasses().get('Box').methods[1].classifier, '$');
  assert.equal(oracle.db.getRelations()[0].relationTitle1, '1');
  assert.equal(oracle.db.getRelations()[0].relationTitle2, '*');
  assert.deepEqual(emitStructural(parse(text)), emitStructural(classes));
  assert.deepEqual(decodeStructural(classes), classes);
}
const arrows = ['<|--','*--','o--','-->','--','..>','..|>','..','<|--|>'];
const markerTypes = { none:'none', inheritance:1, composition:2, aggregation:0, association:3 };
for (const arrow of arrows) {
  const d = parse(`classDiagram\nA ${arrow} B`);
  assert.equal(d.kind, 'class');
  if (d.kind !== 'class') continue;
  const text = emitStructural(d).text; await mermaid.parse(text);
  const oracle = await mermaid.mermaidAPI.getDiagramFromText(text);
  const r = oracle.db.getRelations()[0].relation;
  assert.equal(r.type1, markerTypes[d.relationships[0].sourceMarker]);
  assert.equal(r.type2, markerTypes[d.relationships[0].targetMarker]);
  assert.equal(r.lineType, d.relationships[0].lineStyle === 'dashed' ? 1 : 0);
}
for (const source of ['erDiagram\nCUSTOMER {\nint id', 'classDiagram\nnamespace N {\nclass A', 'classDiagram\nclick A callback', 'erDiagram\nstyle A red', 'classDiagram\nclass A\n%% merfolk-id A\nA --> B']) assert.equal(parseStructural(source).ok, false, source);
assert.throws(() => decodeStructural({ ...sampleStructural('er'), direction: 'wrong' }));
const badNamespace: ClassDiagram = { kind: 'class', direction: 'TB', classes: [], relationships: [], notes: [], namespaces: [{id:'n',label:'n',collapsed:false,position:{x:0,y:0},parentId:'n'}] };
assert.throws(() => decodeStructural(badNamespace), /hierarchy/);
console.log('PASS: ER/class round-trip, cardinalities, UML endpoints, members, namespaces, metadata and JSON validation');
dom.window.close();

const namespaceInput: ClassDiagram = { kind:'class', direction:'TB', classes:[], relationships:[],notes:[],namespaces:[{id:'root',label:'Root',position:{x:0,y:0},collapsed:false,parentId:null},{id:'opaque_child',label:'Child',position:{x:20,y:40},collapsed:false,parentId:'root',pageIds:['p']}]};
const namespaceRoundtrip = parse(emitStructural(namespaceInput).text);
assert.equal(namespaceRoundtrip.kind, 'class');
if (namespaceRoundtrip.kind === 'class') assert.deepEqual(namespaceRoundtrip.namespaces.map((n) => [n.id,n.parentId,n.pageIds]), [['root',null,undefined],['opaque_child','root',['p']]]);
assert.deepEqual(decodeStructural(namespaceInput), namespaceInput);
await mermaid.parse(emitStructural(namespaceInput).text);

for (const source of ['classDiagram\nA --> B : #hashtag', 'classDiagram\nA : +String #34;encoded', 'classDiagram\nclass A {\n#String protected\n+String #34;quoted#34;\n}']) {
 const d = parse(source);
 const emitted = emitStructural(d);
 const roundtrip = parse(emitted.text);
 assert.deepEqual(emitStructural(roundtrip), emitted, source);
 await mermaid.parse(emitted.text);
 if (d.kind === 'class' && d.classes[0]?.members[0]?.signature.startsWith('#')) {
  const oracle = await mermaid.mermaidAPI.getDiagramFromText(emitted.text);
  assert.equal(oracle.db.getClasses().get('A').members[0].visibility, '#');
 }
}
console.log('PASS: structural escaped labels, quoted member signatures and protected visibility');

const dotted = parse('classDiagram\nnamespace A.B {\nclass C\n}');
assert.equal(dotted.kind, 'class');
if (dotted.kind === 'class') {
 assert.deepEqual(dotted.namespaces.map((n) => [n.id,n.label,n.parentId]), [['A','A',null],['A.B','B','A']]);
 assert.equal(dotted.classes[0].namespaceId,'A.B');
 await mermaid.parse(emitStructural(dotted).text);
 const oracle = await mermaid.mermaidAPI.getDiagramFromText(emitStructural(dotted).text);
 assert.deepEqual([...oracle.db.getNamespaces().values()].map((n: {id:string,parent?:string}) => [n.id,n.parent ?? null]), [['A',null],['A.B','A']]);
 assert.deepEqual(emitStructural(parse(emitStructural(dotted).text)),emitStructural(dotted));
}
const genericEndpoints = parse('classDiagram\nclass Foo~T~\nFoo~T~ --> Bar : has { many }');
assert.equal(genericEndpoints.kind,'class');
if (genericEndpoints.kind === 'class') {
 assert.equal(genericEndpoints.classes[0].generics,'T');
 assert.equal(genericEndpoints.relationships[0].source,'Foo');
 assert.equal(genericEndpoints.relationships[0].label,'has { many }');
 const text = emitStructural(genericEndpoints).text;
 assert.deepEqual(emitStructural(parse(text)),emitStructural(genericEndpoints));
 await mermaid.parse(text);
 const oracle = await mermaid.mermaidAPI.getDiagramFromText(text);
 assert.equal(oracle.db.getRelations()[0].id1,'Foo');
 assert.equal(oracle.db.getRelations()[0].title,'has { many }');
}
console.log('PASS: dotted namespaces, generic endpoints and literal relationship label braces');
