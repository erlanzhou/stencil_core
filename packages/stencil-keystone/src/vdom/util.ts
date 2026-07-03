import { NODE_TYPE } from '../internal/runtime-constants';
import type { VNode } from '../internal/types';
import { newVNode } from './h';

/**
 * Derive a tree of virtual DOM nodes from a DOM node, handling the DOM node's
 * children (if any)
 *
 * @param node a DOM node to use as a 'template'
 * @returns a virtual DOM node based on the supplied DOM node
 */
export function toVNode(node: Node): VNode | null {
  if (node.nodeType === NODE_TYPE.TextNode) {
    const vnode: VNode = newVNode(null, node.textContent);
    vnode.$elm$ = node;
    return vnode;
  } else if (node.nodeType === NODE_TYPE.ElementNode) {
    const vnode: VNode = newVNode(node.nodeName.toLowerCase(), null);
    vnode.$elm$ = node;

    const childNodes = (node as any).__childNodes || node.childNodes;
    let childVnode: VNode | null;

    for (let i = 0, l = childNodes.length; i < l; i++) {
      childVnode = toVNode(childNodes[i]);
      if (childVnode) {
        (vnode.$children$ ||= []).push(childVnode);
      }
    }
    return vnode;
  }

  return null;
}
