// Minimal ambient types for gif.js (ships no types) and its worker ?url import.

declare module 'gif.js' {
  interface GifOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    repeat?: number;
    background?: string;
    transparent?: string | null;
    dither?: boolean | string;
    workerScript?: string;
  }
  interface FrameOptions {
    delay?: number;
    copy?: boolean;
  }
  export default class GIF {
    constructor(options?: GifOptions);
    addFrame(
      image: CanvasImageSource | CanvasRenderingContext2D,
      options?: FrameOptions,
    ): void;
    on(event: 'finished', cb: (blob: Blob) => void): void;
    on(event: 'progress', cb: (progress: number) => void): void;
    on(event: 'abort', cb: () => void): void;
    render(): void;
    abort(): void;
  }
}

declare module 'gif.js/dist/gif.worker.js?url' {
  const url: string;
  export default url;
}
