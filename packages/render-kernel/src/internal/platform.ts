/**
 * Minimal platform primitives required by render-kernel.
 */

export const win = (typeof window !== 'undefined' ? window : ({} as any)) as Window;

export const isMemberInElement = (elm: any, memberName: string) => memberName in elm;

const STENCIL_DEV_MODE = [
  '%cstencil',
  'color: white;background:#4c47ff;font-weight: bold; font-size:10px; padding:2px 6px; border-radius: 5px',
];

export const consoleDevError = (...m: any[]) => console.error(...STENCIL_DEV_MODE, ...m);

export const consoleDevWarn = (...m: any[]) => console.warn(...STENCIL_DEV_MODE, ...m);

