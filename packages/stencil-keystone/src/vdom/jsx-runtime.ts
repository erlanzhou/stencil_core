/**
 * Automatic JSX Runtime for Stencil
 *
 * This module provides the automatic JSX runtime functions required by
 * TypeScript when using "jsx": "react-jsx" mode. This allows developers
 * to write JSX without explicitly importing the `h` function.
 *
 * For more information, see:
 * https://www.typescriptlang.org/docs/handbook/jsx.html
 */

import { h } from './h';

export { Fragment } from '../internal/fragment';

/**
 * JSX runtime function for creating elements in production mode.
 * Called by TypeScript's jsx transform for elements without static children.
 *
 * @param type - The element type (string tag name or functional component)
 * @param props - The element props (includes children)
 * @param key - Optional key for the element
 * @returns A virtual DOM node
 */
export function jsx(type: any, props: any, key?: string | number) {
  const propsObj = props || {};
  const { children, ...rest } = propsObj;
  // Build vnodeData - key from props takes precedence over parameter
  let vnodeData = rest;
  if (key !== undefined && !('key' in rest)) {
    vnodeData = { ...rest, key };
  }

  // If vnodeData is empty object, use null instead (matches old transform)
  if (vnodeData && Object.keys(vnodeData).length === 0) {
    vnodeData = null;
  }

  if (children !== undefined) {
    // A static array of children is spread; anything else is passed as a single child
    return Array.isArray(children) ? h(type, vnodeData, ...children) : h(type, vnodeData, children);
  }

  return h(type, vnodeData);
}

/**
 * JSX runtime function for creating elements with static children.
 * Called by TypeScript's jsx transform as an optimization when children are static.
 *
 * @param type - The element type (string tag name or functional component)
 * @param props - The element props (includes children)
 * @param key - Optional key for the element
 * @returns A virtual DOM node
 */
export function jsxs(type: any, props: any, key?: string | number) {
  return jsx(type, props, key);
}
