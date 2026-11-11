/** Rasterize the paper's SVG filter before nesting it inside the capture SVG. */
export async function preparePaperTexture(element: HTMLElement): Promise<() => void> {
  const grain = getComputedStyle(element).getPropertyValue('--mf-grain').trim();
  const url = grain.match(/^url\((['"]?)(.*?)\1\)$/)?.[2];
  if (!url) return () => {};

  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot create the GIF texture canvas');
  context.drawImage(image, 0, 0);

  const original = element.style.getPropertyValue('--mf-grain');
  const priority = element.style.getPropertyPriority('--mf-grain');
  element.style.setProperty('--mf-grain', `url("${canvas.toDataURL()}")`);
  return () => {
    if (original) element.style.setProperty('--mf-grain', original, priority);
    else element.style.removeProperty('--mf-grain');
  };
}

/** Preserve SVG descendant styles that html-to-image's deep SVG clone skips. */
export function prepareSvgStyles(element: HTMLElement): () => void {
  // Read first so writing an ancestor's styles cannot change a child's snapshot.
  const snapshots = Array.from(element.querySelectorAll<SVGElement>('svg *'), (node) => {
    const computed = getComputedStyle(node);
    return {
      node,
      original: node.getAttribute('style'),
      properties: Array.from(computed, (name) => [name, computed.getPropertyValue(name)] as const),
    };
  });
  for (const { node, properties } of snapshots) {
    for (const [name, value] of properties) node.style.setProperty(name, value);
  }
  return () => {
    for (const { node, original } of snapshots) {
      if (original === null) node.removeAttribute('style');
      else node.setAttribute('style', original);
    }
  };
}
