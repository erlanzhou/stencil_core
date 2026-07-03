import type { HostElement, VNode } from './types';

/**
 * The minimal host reference required by {@link renderVdom}.
 *
 * - `$hostElement$` is the element the vdom tree is rooted at. `renderVdom` reads
 *   its `tagName` / `shadowRoot` and uses it as the root DOM node.
 * - `$vnode$` holds the previously-rendered tree so subsequent renders can diff
 *   against it instead of recreating the DOM. It starts out absent and is
 *   maintained by `renderVdom` itself.
 */
export interface RenderHostRef {
  $hostElement$: HostElement;
  $vnode$?: VNode | null;
}
