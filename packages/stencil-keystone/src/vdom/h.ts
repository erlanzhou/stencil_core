/**
 * Production h() function based on Preact by
 * Jason Miller (@developit)
 * Licensed under the MIT License
 * https://github.com/developit/preact/blob/master/LICENSE
 *
 * Modified for Stencil's compiler and vdom
 */

import { isComplexType } from '../internal/helpers';
import { consoleDevError, consoleDevWarn } from '../internal/platform';
import type { ChildType, FunctionalComponent, VNode } from '../internal/types';

const IS_DEV = process.env.NODE_ENV === 'development';

// export function h(nodeName: string | FunctionalComponent, vnodeData: PropsType, child?: ChildType): VNode;
// export function h(nodeName: string | FunctionalComponent, vnodeData: PropsType, ...children: ChildType[]): VNode;
export const h = (nodeName: any, vnodeData: any, ...children: ChildType[]): VNode => {
  let child: any = null;
  let key: string | null = null;
  let simple = false;
  let lastSimple = false;
  const vNodeChildren: VNode[] = [];
  const walk = (c: any[]) => {
    for (let i = 0; i < c.length; i++) {
      child = c[i];
      if (Array.isArray(child)) {
        walk(child);
      } else if (child != null && typeof child !== 'boolean') {
        if ((simple = typeof nodeName !== 'function' && !isComplexType(child))) {
          child = String(child);
        } else if (IS_DEV && typeof nodeName !== 'function' && child.$isHost$ === undefined) {
          consoleDevError(`vNode passed as children has unexpected type.
Make sure it's using the correct h() function.
Empty objects can also be the cause, look for JSX comments that became objects.`);
        }

        if (simple && lastSimple) {
          // If the previous child was simple (string), we merge both
          vNodeChildren[vNodeChildren.length - 1].$text$ += child;
        } else {
          // Append a new vNode, if it's text, we create a text vNode
          vNodeChildren.push(simple ? newVNode(null, child) : child);
        }
        lastSimple = simple;
      }
    }
  };
  walk(children);
  if (vnodeData) {
    if (IS_DEV && nodeName === 'input') {
      validateInputProperties(vnodeData);
    }
    if (vnodeData.key) {
      key = vnodeData.key;
    }
    // normalize class / className attributes
    const classData = vnodeData.className || vnodeData.class;
    if (classData) {
      vnodeData.class =
        typeof classData !== 'object'
          ? classData
          : Object.keys(classData)
              .filter((k) => classData[k])
              .join(' ');
    }
  }

  if (IS_DEV && vNodeChildren.some(isHost)) {
    consoleDevError(`The <Host> must be the single root component. Make sure:
- You are NOT using hostData() and <Host> in the same component.
- <Host> is used once, and it's the single root component of the render() function.`);
  }

  if (typeof nodeName === 'function') {
    // nodeName is a functional component
    return (nodeName as FunctionalComponent<any>)(vnodeData === null ? {} : vnodeData, vNodeChildren) as any;
  }

  const vnode = newVNode(nodeName, null);
  vnode.$attrs$ = vnodeData;
  if (vNodeChildren.length > 0) {
    vnode.$children$ = vNodeChildren;
  }
  vnode.$key$ = key;
  return vnode;
};

/**
 * A utility function for creating a virtual DOM node from a tag and some
 * possible text content.
 *
 * @param tag the tag for this element
 * @param text possible text content for the node
 * @returns a newly-minted virtual DOM node
 */
export const newVNode = (tag: string | null, text: string | null) => {
  const vnode: VNode = {
    $isHost$: false,
    $tag$: tag,
    // Normalize undefined to null to prevent rendering "undefined" as text
    $text$: text ?? null,
    $elm$: null,
    $children$: null,
    $attrs$: null,
    $key$: null,
  };
  return vnode;
};

export const Host = {};

/**
 * Check whether a given node is a Host node or not
 *
 * @param node the virtual DOM node to check
 * @returns whether it's a Host node or not
 */
export const isHost = (node: any): node is VNode => node && node.$tag$ === Host;

/**
 * Validates the ordering of attributes on an input element
 *
 * @param inputElm the element to validate
 */
const validateInputProperties = (inputElm: HTMLInputElement): void => {
  const props = Object.keys(inputElm);

  const value = props.indexOf('value');
  if (value === -1) {
    return;
  }

  const typeIndex = props.indexOf('type');
  const minIndex = props.indexOf('min');
  const maxIndex = props.indexOf('max');
  const stepIndex = props.indexOf('step');
  if (value < typeIndex || value < minIndex || value < maxIndex || value < stepIndex) {
    consoleDevWarn(`The "value" prop of <input> should be set after "min", "max", "type" and "step"`);
  }
};
