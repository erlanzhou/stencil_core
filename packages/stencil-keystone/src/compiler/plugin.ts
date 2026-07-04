import { transform, type TransformOptions, type TransformResult } from './transform';

export interface KeystonePlugin {
  name: string;
  enforce: 'pre';
  transform(code: string, id: string): TransformResult | null;
}

/** Rollup-plugin-shaped object; Vite and vitest consume it natively. */
export const keystone = (opts: TransformOptions = {}): KeystonePlugin => ({
  name: 'keystone',
  enforce: 'pre',
  transform(code, id) {
    if (!/\.[jt]sx?$/.test(id)) return null;
    return transform(code, id, opts);
  },
});
