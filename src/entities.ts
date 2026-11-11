import { useDiagram } from './store';
export function usePageEntities() {
  return useDiagram((state) => state.sequence ? state.sequence.participants : state.nodes);
}
export function pageEntities() {
  const state = useDiagram.getState();
  return state.sequence ? state.sequence.participants : state.nodes;
}
