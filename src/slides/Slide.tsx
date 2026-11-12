import { openWiki } from '../route';
import Preview from '../wiki/Preview';
import type { Slide as SlideData } from '../slides';

/** One slide at 16:9. Type scales with the slide's width, so it reads the same at any size. */
export default function Slide({ slide, nodeId }: { slide: SlideData; nodeId?: string }) {
  const { look } = slide;
  const classes = ['sl-slide', look.lead && 'lead', look.invert && 'invert',
    look.font && `font-${look.font}`, look.headingFont && `head-${look.headingFont}`];
  return (
    <div className={classes.filter(Boolean).join(' ')} style={{ background: look.background, color: look.color }}>
      <Preview body={slide.body} nodeId={nodeId} onPage={openWiki} />
    </div>
  );
}
