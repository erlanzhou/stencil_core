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
 * Anything usable as JSX children of a keystone component: vnodes, primitives,
 * booleans/nullish (ignored), and nested arrays thereof. Deliberately generic —
 * like Stencil's React output target, slots are not typed individually.
 */
export type VNodeChildren = ChildType | boolean | null | undefined | VNodeChildren[];

/**
 * The framework-managed props every keystone component accepts in JSX, on top of
 * its own `@Prop`s: children, a diff `key`, and a callback `ref` that receives the
 * host element (typed with its `@Method` surface) or `null`.
 *
 * @typeParam Methods the imperative methods (`@Method`) exposed on the host element
 */
export interface KeystoneNodeAttrs<Methods = unknown> {
  children?: VNodeChildren;
  key?: string | number;
  ref?: (el: (Methods & HTMLElement) | null) => void;
}

/**
 * The JSX-facing type of a compiled keystone component reference. The runtime
 * value is the component's class (tagged with `$ksTag$` by `proxyCustomElement`);
 * the compiler retypes the emitted `.d.ts` export as this so `<MyButton .../>`
 * type-checks its `@Prop`s and `on*` `@Event` handlers. It is shaped as a
 * function component so TS's JSX support reads the call signature's parameter as
 * the element's attributes.
 *
 * @typeParam Props the component's props: its `@Prop`s plus `on*` handlers from `@Event`s
 * @typeParam Methods the imperative surface exposed via a `ref` (from `@Method`s)
 */
export interface KeystoneComponent<Props = Record<string, never>, Methods = unknown> {
  (props: Props & KeystoneNodeAttrs<Methods>): VNode;
  /** The component's custom-element tag; `h` resolves a reference to it. */
  $ksTag$: string;
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
