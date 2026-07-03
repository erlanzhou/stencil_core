/**
 * Standalone type definitions for the render kernel.
 *
 * These were previously imported from `@stencil/core/declarations`. The kernel
 * now owns them so it no longer depends on Stencil's runtime type surface.
 *
 * VNode field names keep the historical `$name$` convention used across the vdom
 * (`$tag$`, `$elm$`, …). The former numeric `$flags$` bitmask has been replaced
 * by a single `$isHost$` boolean — the only flag this kernel ever set or read.
 */

/**
 * A virtual DOM node.
 */
export interface VNode {
  /**
   * Marks the single root node produced by `renderVdom` (the `<Host>`). Used by
   * `setAccessor` to force attribute reflection on the host element.
   */
  $isHost$: boolean;
  $tag$: string | number | Function | null;
  $elm$: any;
  $text$: string | null;
  $children$: VNode[] | null;
  $attrs$?: any;
  $key$?: string | number | null;
}

export interface VNodeData {
  class?: { [className: string]: boolean };
  style?: any;
  [attrName: string]: any;
}

export type ChildType = VNode | number | string;

export type PropsType = VNodeData | number | string | null;

/**
 * A functional component: called with its props and children, returns vnodes.
 */
export interface FunctionalComponent<T = Record<string, unknown>> {
  (props: T, children: VNode[]): VNode | VNode[] | null;
}

/**
 * An element that hosts a rendered vdom tree. The open index signature covers
 * the non-standard `s-*` bookkeeping members the hydration path reads/writes.
 */
export interface HostElement extends HTMLElement {
  [key: string]: any;
}

/**
 * A DOM node produced or handled during rendering. Kept intentionally loose: the
 * kernel touches a handful of non-standard members (a custom `__insertBefore`,
 * `__childNodes`, template `content`, the shadow-root `host`) and casts freely,
 * so an open index signature avoids friction without losing the DOM surface.
 */
export interface RenderNode extends HTMLElement {
  host?: Element;
  content?: DocumentFragment;
  __insertBefore?: (newNode: Node, reference?: Node | null) => Node;
  __childNodes?: NodeListOf<ChildNode>;
  [key: string]: any;
}

/**
 * A node that may stand in as a reference during slot-aware insertion.
 */
export interface PatchedSlotNode extends Node {
  [key: string]: any;
}
