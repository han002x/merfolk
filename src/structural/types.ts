import type { ElementStyle } from '../types.ts';
export type StructuralDirection = 'TB' | 'BT' | 'LR' | 'RL';
export interface StructuralCard {
  id: string;
  label: string;
  position: { x: number; y: number };
  collapsed: boolean;
  pageIds?: string[];
  style?: ElementStyle;
}
export interface ErAttribute { id: string; type: string; name: string; keys: ('PK' | 'FK' | 'UK')[]; comment: string }
export interface ErEntity extends StructuralCard { attributes: ErAttribute[] }
export type Cardinality = 'one' | 'zero-or-one' | 'one-or-more' | 'zero-or-more';
export interface ErRelationship { id: string; source: string; target: string; label: string; sourceCardinality: Cardinality; targetCardinality: Cardinality; identifying: boolean; style?: ElementStyle }
export interface ErDiagram { kind: 'er'; direction: StructuralDirection; entities: ErEntity[]; relationships: ErRelationship[] }
export interface ClassMember { id: string; kind: 'attribute' | 'method'; signature: string }
export interface ClassCard extends StructuralCard { generics: string; annotations: string[]; namespaceId: string | null; members: ClassMember[] }
export interface ClassNamespace extends StructuralCard { parentId: string | null }
export interface ClassNote { id: string; classId: string | null; text: string }
export type ClassMarker = 'none' | 'inheritance' | 'composition' | 'aggregation' | 'association';
export interface ClassRelationship { id: string; source: string; target: string; label: string; sourceMarker: ClassMarker; targetMarker: ClassMarker; lineStyle: 'solid' | 'dashed'; sourceMultiplicity: string; targetMultiplicity: string; style?: ElementStyle }
export interface ClassDiagram { kind: 'class'; direction: StructuralDirection; classes: ClassCard[]; namespaces: ClassNamespace[]; notes: ClassNote[]; relationships: ClassRelationship[] }
export type StructuralDiagram = ErDiagram | ClassDiagram;
export interface StructuralRef { kind: 'entity' | 'attribute' | 'class' | 'member' | 'namespace' | 'note' | 'relationship'; id: string }
export interface StructuralSource { text: string; lineRefs: Map<number, StructuralRef> }
export type StructuralParseResult = { ok: true; diagram: StructuralDiagram; lineRefs: Map<number, StructuralRef> } | { ok: false; error: string };
