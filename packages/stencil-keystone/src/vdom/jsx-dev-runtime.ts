/**
 * Automatic JSX Development Runtime for Stencil
 *
 * This module provides the automatic JSX runtime functions required by
 * TypeScript when using "jsx": "react-jsxdev" mode. This is used during
 * development and includes additional debugging information.
 *
 * For more information, see:
 * https://www.typescriptlang.org/docs/handbook/jsx.html
 */

import { jsx } from './jsx-runtime';

export { Fragment } from '../internal/fragment';
// Re-export the JSX type surface so `react-jsxdev` mode (which resolves JSX types
// from this module) shares the exact same namespace as the production runtime.
export type { JSX } from './jsx-runtime';

/**
 * JSX development runtime function for creating elements with debug info.
 * Called by TypeScript's jsx transform in development mode. The extra debug
 * parameters are part of the transform's contract but are not used here — the
 * produced vnode is identical to `jsx`.
 *
 * @param type - The element type (string tag name or functional component)
 * @param props - The element props (includes children, key, etc.)
 * @param key - The element's key (passed separately in dev mode)
 * @param _isStaticChildren - Whether children are static (optimization hint)
 * @param _source - Source location information for debugging
 * @param _self - The component instance (for debugging)
 * @returns A virtual DOM node
 */
export function jsxDEV(
  type: any,
  props: any,
  key?: string | number,
  _isStaticChildren?: boolean,
  _source?: any,
  _self?: any,
) {
  return jsx(type, props, key);
}
