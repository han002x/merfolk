import { STYLE_DEFAULTS } from './style';
import { activeAppearance, useAppearance } from './theme';
export function useStyleDefaults() {
  const appearance = activeAppearance(useAppearance());
  return { ...STYLE_DEFAULTS, fontFamily: appearance.contentFont, sloppiness: appearance.sloppiness, edges: appearance.corners };
}
