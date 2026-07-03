/**
 * Public type surface for @stencil/render-kernel.
 *
 * These types are owned by the kernel and intentionally independent of
 * `@stencil/core`. VNode field names keep the historical `$name$` convention.
 */

export interface VNode {
  /**
   * Marks the single root node produced by `renderVdom` (the `<Host>`). Used by
   * `setAccessor` to force attribute reflection onto the host element.
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

export interface FunctionalComponent<T = Record<string, unknown>> {
  (props: T, children: VNode[]): VNode | VNode[] | null;
}

export interface HostElement extends HTMLElement {
  [key: string]: any;
}

export interface RenderNode extends HTMLElement {
  host?: Element;
  content?: DocumentFragment;
  __insertBefore?: (newNode: Node, reference?: Node | null) => Node;
  __childNodes?: NodeListOf<ChildNode>;
  [key: string]: any;
}

/**
 * The minimal host reference required by {@link renderVdom}. `$hostElement$` is
 * the element the vdom tree is rooted at; `$vnode$` holds the previously-rendered
 * tree so re-renders can diff instead of recreating the DOM (maintained by
 * `renderVdom` itself).
 */
export interface RenderHostRef {
  $hostElement$: HostElement;
  $vnode$?: VNode | null;
}

export declare const Host: FunctionalComponent<Record<string, any>>;
export declare const Fragment: FunctionalComponent<Record<string, any>>;

export declare function h(nodeName: any, vnodeData: any, ...children: ChildType[]): VNode;
export declare function newVNode(tag: string | null, text: string | null): VNode;
export declare function isHost(node: any): node is VNode;

export declare function jsx(type: any, props: any, key?: string): VNode;
export declare function jsxs(type: any, props: any, key?: string): VNode;
export declare function jsxDEV(
  type: any,
  props: any,
  key?: string | number,
  isStaticChildren?: boolean,
  source?: any,
  self?: any,
): VNode;

export declare function render(vnode: VNode, container: Element): void;

export declare function parseClassList(value: string | SVGAnimatedString | undefined | null): string[];
export declare function setAccessor(
  elm: any,
  memberName: string,
  oldValue: any,
  newValue: any,
  isSvg: boolean,
  isHost: boolean,
  isInitialRender?: boolean,
): void;
export declare function updateElement(
  oldVnode: VNode | null,
  newVnode: VNode,
  isSvgMode: boolean,
  isInitialRender?: boolean,
): void;

export declare function toVNode(node: Node): VNode | null;

export declare function insertBefore(parentNode: Node, newNode: Node, referenceNode: Node): void;
export declare function isSameVnode(leftVNode: VNode, rightVNode: VNode): boolean;
export declare function nullifyVNodeRefs(vNode: VNode): void;
export declare function patch(oldVNode: VNode, newVNode: VNode, isInitialRender?: boolean): void;
export declare function queueRefAttachment(refCallback: (elm: any) => void, elm: any): void;
export declare function renderVdom(
  hostRef: RenderHostRef,
  renderFnResults: VNode | VNode[] | null,
  isInitialLoad?: boolean,
): void;
