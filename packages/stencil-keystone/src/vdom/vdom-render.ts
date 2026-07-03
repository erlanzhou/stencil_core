/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/snabbdom/snabbdom/blob/master/LICENSE
 *
 * Modified for Stencil's renderer and slot projection
 */
import { HTML_NS, SVG_NS } from '../internal/constants';
import type { RenderHostRef } from '../internal/host-ref';
import { consoleDevError, win } from '../internal/platform';
import type { PatchedSlotNode, RenderNode, VNode } from '../internal/types';
import { h, isHost, newVNode } from './h';
import { updateElement } from './update-element';

const IS_DEV = process.env.NODE_ENV === 'development';

let hostTagName: string;
let isSvgMode = false;

/**
 * Queues for ref callbacks that need to be called during rendering.
 * These ensure that ref callbacks are called in the correct order:
 * first all removal callbacks (with null), then all attachment callbacks (with elements).
 */
const refCallbacksToRemove: Array<() => void> = [];
const refCallbacksToAttach: Array<() => void> = [];

/**
 * Create a DOM Node corresponding to one of the children of a given VNode.
 *
 * @param oldParentVNode the parent VNode from the previous render
 * @param newParentVNode the parent VNode from the current render
 * @param childIndex the index of the VNode, in the _new_ parent node's
 * children, for which we will create a new DOM node
 * @returns the newly created node
 */
const createElm = (oldParentVNode: VNode | null, newParentVNode: VNode, childIndex: number) => {
  const newVNode = newParentVNode.$children$![childIndex];
  let i = 0;
  let elm: RenderNode;
  let childNode: RenderNode;

  if (IS_DEV && newVNode.$elm$) {
    consoleDevError(
      `The JSX ${
        newVNode.$text$ !== null ? `"${newVNode.$text$}" text` : `"${newVNode.$tag$}" element`
      } node should not be shared within the same renderer. The renderer caches element lookups in order to improve performance. However, a side effect from this is that the exact same JSX node should not be reused. For more information please see https://stenciljs.com/docs/templating-jsx#avoid-shared-jsx-nodes`,
    );
  }

  // Use loose equality to handle both null and undefined
  if (newVNode.$text$ != null) {
    // create text node
    elm = newVNode.$elm$ = win.document.createTextNode(newVNode.$text$) as any;
  } else {
    if (!isSvgMode) {
      isSvgMode = newVNode.$tag$ === 'svg';
    }

    if (!win.document) {
      throw new Error("You are trying to render a Stencil component in an environment that doesn't support the DOM.");
    }

    elm = newVNode.$elm$ = win.document.createElementNS(
      isSvgMode ? SVG_NS : HTML_NS,
      newVNode.$tag$ as string,
    ) as any;

    if (isSvgMode && newVNode.$tag$ === 'foreignObject') {
      isSvgMode = false;
    }

    // add css classes, attrs, props, listeners, etc.
    updateElement(null, newVNode, isSvgMode);

    if (newVNode.$children$) {
      // For template elements, children should be appended to the content DocumentFragment
      const appendTarget = newVNode.$tag$ === 'template' ? (elm as HTMLTemplateElement).content : elm;
      for (i = 0; i < newVNode.$children$.length; ++i) {
        // create the node
        childNode = createElm(oldParentVNode, newVNode, i);

        // return node could have been null
        if (childNode) {
          // append our new node
          appendTarget.appendChild(childNode);
        }
      }
    }

    if (newVNode.$tag$ === 'svg') {
      // Only reset the SVG context when we're exiting <svg> element
      isSvgMode = false;
    } else if (elm.tagName === 'foreignObject') {
      // Reenter SVG context when we're exiting <foreignObject> element
      isSvgMode = true;
    }
  }

  return elm;
};

/**
 * Create DOM nodes corresponding to a list of {@link VNode} objects and
 * add them to the DOM in the appropriate place.
 *
 * @param parentElm the DOM node which should be used as a parent for the new
 * DOM nodes
 * @param before a child of the `parentElm` which the new children should be
 * inserted before (optional)
 * @param parentVNode the parent virtual DOM node
 * @param vnodes the new child virtual DOM nodes to produce DOM nodes for
 * @param startIdx the index in the child virtual DOM nodes at which to start
 * creating DOM nodes (inclusive)
 * @param endIdx the index in the child virtual DOM nodes at which to stop
 * creating DOM nodes (inclusive)
 */
const addVnodes = (
  parentElm: RenderNode,
  before: RenderNode | null,
  parentVNode: VNode,
  vnodes: VNode[],
  startIdx: number,
  endIdx: number,
) => {
  let containerElm = parentElm as any;
  let childNode: Node;
  if ((containerElm as any).shadowRoot && containerElm.tagName === hostTagName) {
    containerElm = (containerElm as any).shadowRoot;
  }

  // For template elements, children should be added to the content DocumentFragment
  if (parentVNode.$tag$ === 'template') {
    containerElm = (containerElm as HTMLTemplateElement).content;
  }

  for (; startIdx <= endIdx; ++startIdx) {
    if (vnodes[startIdx]) {
      childNode = createElm(null, parentVNode, startIdx);
      if (childNode) {
        vnodes[startIdx].$elm$ = childNode as any;
        insertBefore(containerElm, childNode as RenderNode, before);
      }
    }
  }
};

/**
 * Remove the DOM elements corresponding to a list of {@link VNode} objects.
 * This can be used to, for instance, clean up after a list of children which
 * should no longer be shown.
 *
 * This function also handles some of Stencil's slot relocation logic.
 *
 * @param vnodes a list of virtual DOM nodes to remove
 * @param startIdx the index at which to start removing nodes (inclusive)
 * @param endIdx the index at which to stop removing nodes (inclusive)
 */
const removeVnodes = (vnodes: VNode[], startIdx: number, endIdx: number) => {
  for (let index = startIdx; index <= endIdx; ++index) {
    const vnode = vnodes[index];
    if (vnode) {
      const elm = vnode.$elm$;
      nullifyVNodeRefs(vnode);
      elm?.remove();
    }
  }
};

/**
 * Reconcile the children of a new VNode with the children of an old VNode by
 * traversing the two collections of children, identifying nodes that are
 * conserved or changed, calling out to `patch` to make any necessary
 * updates to the DOM, and rearranging DOM nodes as needed.
 *
 * The algorithm for reconciling children works by analyzing two 'windows' onto
 * the two arrays of children (`oldCh` and `newCh`). We keep track of the
 * 'windows' by storing start and end indices and references to the
 * corresponding array entries. Initially the two 'windows' are basically equal
 * to the entire array, but we progressively narrow the windows until there are
 * no children left to update by doing the following:
 *
 * 1. Skip any `null` entries at the beginning or end of the two arrays, so
 *    that if we have an initial array like the following we'll end up dealing
 *    only with a window bounded by the highlighted elements:
 *
 *    [null, null, VNode1 , ... , VNode2, null, null]
 *                 ^^^^^^         ^^^^^^
 *
 * 2. Check to see if the elements at the head and tail positions are equal
 *    across the windows. This will basically detect elements which haven't
 *    been added, removed, or changed position, i.e. if you had the following
 *    VNode elements (represented as HTML):
 *
 *    oldVNode: `<div><p><span>HEY</span></p></div>`
 *    newVNode: `<div><p><span>THERE</span></p></div>`
 *
 *    Then when comparing the children of the `<div>` tag we check the equality
 *    of the VNodes corresponding to the `<p>` tags and, since they are the
 *    same tag in the same position, we'd be able to avoid completely
 *    re-rendering the subtree under them with a new DOM element and would just
 *    call out to `patch` to handle reconciling their children and so on.
 *
 * 3. Check, for both windows, to see if the element at the beginning of the
 *    window corresponds to the element at the end of the other window. This is
 *    a heuristic which will let us identify _some_ situations in which
 *    elements have changed position, for instance it _should_ detect that the
 *    children nodes themselves have not changed but merely moved in the
 *    following example:
 *
 *    oldVNode: `<div><element-one /><element-two /></div>`
 *    newVNode: `<div><element-two /><element-one /></div>`
 *
 *    If we find cases like this then we also need to move the concrete DOM
 *    elements corresponding to the moved children to write the re-order to the
 *    DOM.
 *
 * 4. Finally, if VNodes have the `key` attribute set on them we check for any
 *    nodes in the old children which have the same key as the first element in
 *    our window on the new children. If we find such a node we handle calling
 *    out to `patch`, moving relevant DOM nodes, and so on, in accordance with
 *    what we find.
 *
 * Finally, once we've narrowed our 'windows' to the point that either of them
 * collapse (i.e. they have length 0) we then handle any remaining VNode
 * insertion or deletion that needs to happen to get a DOM state that correctly
 * reflects the new child VNodes. If, for instance, after our window on the old
 * children has collapsed we still have more nodes on the new children that
 * we haven't dealt with yet then we need to add them, or if the new children
 * collapse but we still have unhandled _old_ children then we need to make
 * sure the corresponding DOM nodes are removed.
 *
 * @param parentElm the node into which the parent VNode is rendered
 * @param oldCh the old children of the parent node
 * @param newVNode the new VNode which will replace the parent
 * @param newCh the new children of the parent node
 * @param isInitialRender whether or not this is the first render of the vdom
 */
const updateChildren = (
  parentElm: RenderNode,
  oldCh: VNode[],
  newVNode: VNode,
  newCh: VNode[],
  isInitialRender = false,
) => {
  let oldStartIdx = 0;
  let newStartIdx = 0;
  let idxInOld = 0;
  let i = 0;
  let oldEndIdx = oldCh.length - 1;
  let oldStartVnode = oldCh[0];
  let oldEndVnode = oldCh[oldEndIdx];
  let newEndIdx = newCh.length - 1;
  let newStartVnode = newCh[0];
  let newEndVnode = newCh[newEndIdx];
  let node: Node;
  let elmToMove: VNode;

  // For template elements, we need to work with the content DocumentFragment
  const containerElm = newVNode.$tag$ === 'template' ? (parentElm as HTMLTemplateElement).content : parentElm;

  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (oldStartVnode == null) {
      // VNode might have been moved left
      oldStartVnode = oldCh[++oldStartIdx];
    } else if (oldEndVnode == null) {
      oldEndVnode = oldCh[--oldEndIdx];
    } else if (newStartVnode == null) {
      newStartVnode = newCh[++newStartIdx];
    } else if (newEndVnode == null) {
      newEndVnode = newCh[--newEndIdx];
    } else if (isSameVnode(oldStartVnode, newStartVnode, isInitialRender)) {
      // if the start nodes are the same then we should patch the new VNode
      // onto the old one, and increment our `newStartIdx` and `oldStartIdx`
      // indices to reflect that. We don't need to move any DOM Nodes around
      // since things are matched up in order.
      patch(oldStartVnode, newStartVnode, isInitialRender);
      oldStartVnode = oldCh[++oldStartIdx];
      newStartVnode = newCh[++newStartIdx];
    } else if (isSameVnode(oldEndVnode, newEndVnode, isInitialRender)) {
      // likewise, if the end nodes are the same we patch new onto old and
      // decrement our end indices, and also likewise in this case we don't
      // need to move any DOM Nodes.
      patch(oldEndVnode, newEndVnode, isInitialRender);
      oldEndVnode = oldCh[--oldEndIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (isSameVnode(oldStartVnode, newEndVnode, isInitialRender)) {
      // case: "Vnode moved right"
      //
      // We've found that the last node in our window on the new children is
      // the same VNode as the _first_ node in our window on the old children
      // we're dealing with now. Visually, this is the layout of these two
      // nodes:
      //
      // newCh: [..., newStartVnode , ... , newEndVnode , ...]
      //                                    ^^^^^^^^^^^
      // oldCh: [..., oldStartVnode , ... , oldEndVnode , ...]
      //              ^^^^^^^^^^^^^
      //
      // In this situation we need to patch `newEndVnode` onto `oldStartVnode`
      // and move the DOM element for `oldStartVnode`.
      patch(oldStartVnode, newEndVnode, isInitialRender);
      // We need to move the element for `oldStartVnode` into a position which
      // will be appropriate for `newEndVnode`. For this we can use
      // `.insertBefore` and `oldEndVnode.$elm$.nextSibling`. If there is a
      // sibling for `oldEndVnode.$elm$` then we want to move the DOM node for
      // `oldStartVnode` between `oldEndVnode` and it's sibling, like so:
      //
      // <old-start-node />
      // <some-intervening-node />
      // <old-end-node />
      // <!-- ->              <-- `oldStartVnode.$elm$` should be inserted here
      // <next-sibling />
      //
      // If instead `oldEndVnode.$elm$` has no sibling then we just want to put
      // the node for `oldStartVnode` at the end of the children of
      // `containerElm`. Luckily, `Node.nextSibling` will return `null` if there
      // aren't any siblings, and passing `null` to `Node.insertBefore` will
      // append it to the children of the parent element.
      insertBefore(containerElm, oldStartVnode.$elm$, oldEndVnode.$elm$.nextSibling as any);
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (isSameVnode(oldEndVnode, newStartVnode, isInitialRender)) {
      // case: "Vnode moved left"
      //
      // We've found that the first node in our window on the new children is
      // the same VNode as the _last_ node in our window on the old children.
      // Visually, this is the layout of these two nodes:
      //
      // newCh: [..., newStartVnode , ... , newEndVnode , ...]
      //              ^^^^^^^^^^^^^
      // oldCh: [..., oldStartVnode , ... , oldEndVnode , ...]
      //                                    ^^^^^^^^^^^
      //
      // In this situation we need to patch `newStartVnode` onto `oldEndVnode`
      // (which will handle updating any changed attributes, reconciling their
      // children etc) but we also need to move the DOM node to which
      // `oldEndVnode` corresponds.
      patch(oldEndVnode, newStartVnode, isInitialRender);
      // We've already checked above if `oldStartVnode` and `newStartVnode` are
      // the same node, so since we're here we know that they are not. Thus we
      // can move the element for `oldEndVnode` _before_ the element for
      // `oldStartVnode`, leaving `oldStartVnode` to be reconciled in the
      // future.
      insertBefore(containerElm, oldEndVnode.$elm$, oldStartVnode.$elm$);
      oldEndVnode = oldCh[--oldEndIdx];
      newStartVnode = newCh[++newStartIdx];
    } else {
      // Here we do some checks to match up old and new nodes based on the
      // `$key$` attribute, which is set by putting a `key="my-key"` attribute
      // in the JSX for a DOM element in the implementation of a Stencil
      // component.
      //
      // First we check to see if there are any nodes in the array of old
      // children which have the same key as the first node in the new
      // children.
      idxInOld = -1;
      for (i = oldStartIdx; i <= oldEndIdx; ++i) {
        if (oldCh[i] && oldCh[i].$key$ !== null && oldCh[i].$key$ === newStartVnode.$key$) {
          idxInOld = i;
          break;
        }
      }

      if (idxInOld >= 0) {
        // We found a node in the old children which matches up with the first
        // node in the new children! So let's deal with that
        elmToMove = oldCh[idxInOld];

        if (elmToMove.$tag$ !== newStartVnode.$tag$) {
          // the tag doesn't match so we'll need a new DOM element
          node = createElm(oldCh && oldCh[newStartIdx], newVNode, idxInOld);
        } else {
          patch(elmToMove, newStartVnode, isInitialRender);
          // invalidate the matching old node so that we won't try to update it
          // again later on
          oldCh[idxInOld] = undefined as unknown as VNode;
          node = elmToMove.$elm$;
        }

        newStartVnode = newCh[++newStartIdx];
      } else {
        // We either didn't find an element in the old children that matches
        // the key of the first new child OR the build is not using `key`
        // attributes at all. In either case we need to create a new element
        // for the new node.
        node = createElm(oldCh && oldCh[newStartIdx], newVNode, newStartIdx);
        newStartVnode = newCh[++newStartIdx];
      }

      if (node) {
        insertBefore(oldStartVnode.$elm$.parentNode, node as RenderNode, oldStartVnode.$elm$);
      }
    }
  }

  if (oldStartIdx > oldEndIdx) {
    addVnodes(
      parentElm,
      newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].$elm$,
      newVNode,
      newCh,
      newStartIdx,
      newEndIdx,
    );
  } else if (newStartIdx > newEndIdx) {
    removeVnodes(oldCh, oldStartIdx, oldEndIdx);
  }
};

/**
 * Compare two VNodes to determine if they are the same
 *
 * **NB**: This function is an equality _heuristic_ based on the available
 * information set on the two VNodes and can be misleading under certain
 * circumstances. In particular, if the two nodes do not have `key` attrs
 * (available under `$key$` on VNodes) then the function falls back on merely
 * checking that they have the same tag.
 *
 * So, in other words, if `key` attrs are not set on VNodes which may be
 * changing order within a `children` array or something along those lines then
 * we could obtain a false negative and then have to do needless re-rendering
 * (i.e. we'd say two VNodes aren't equal when in fact they should be).
 *
 * @param leftVNode the first VNode to check
 * @param rightVNode the second VNode to check
 * @param isInitialRender whether or not this is the first render of the vdom
 * @returns whether they're equal or not
 */
export const isSameVnode = (leftVNode: VNode, rightVNode: VNode, isInitialRender = false) => {
  // compare if two vnode to see if they're "technically" the same
  // need to have the same element tag, and same key to be the same
  if (leftVNode.$tag$ === rightVNode.$tag$) {
    // this will be set if JSX tags in the build have `key` attrs set on them
    // we only want to check this if we're not on the first render since on
    // first render `leftVNode.$key$` will always be `null`, so we can be led
    // astray and, for instance, accidentally delete a DOM node that we want to
    // keep around.
    if (!isInitialRender) {
      return leftVNode.$key$ === rightVNode.$key$;
    }
    // if we're comparing the same node and it's the initial render,
    // let's set the $key$ property to the rightVNode so we don't cause re-renders
    if (isInitialRender && !leftVNode.$key$ && rightVNode.$key$) {
      leftVNode.$key$ = rightVNode.$key$;
    }
    return true;
  }
  return false;
};

/**
 * Handle reconciling an outdated VNode with a new one which corresponds to
 * it. This function handles flushing updates to the DOM and reconciling the
 * children of the two nodes (if any).
 *
 * @param oldVNode an old VNode whose DOM element and children we want to update
 * @param newVNode a new VNode representing an updated version of the old one
 * @param isInitialRender whether or not this is the first render of the vdom
 */
export const patch = (oldVNode: VNode, newVNode: VNode, isInitialRender = false) => {
  const elm = (newVNode.$elm$ = oldVNode.$elm$);
  const oldChildren = oldVNode.$children$;
  const newChildren = newVNode.$children$;
  const tag = newVNode.$tag$;
  const text = newVNode.$text$;

  // Use loose equality to handle both null and undefined
  if (text == null) {
    // test if we're rendering an svg element, or still rendering nodes inside of one
    // only add this to the when the compiler sees we're using an svg somewhere
    isSvgMode = tag === 'svg' ? true : tag === 'foreignObject' ? false : isSvgMode;

    // either this is the first render of an element OR it's an update
    // AND we already know it's possible it could have changed
    // this updates the element's css classes, attrs, props, listeners, etc.
    updateElement(oldVNode, newVNode, isSvgMode, isInitialRender);

    if (oldChildren !== null && newChildren !== null) {
      // looks like there's child vnodes for both the old and new vnodes
      // so we need to call `updateChildren` to reconcile them
      updateChildren(elm, oldChildren, newVNode, newChildren, isInitialRender);
    } else if (newChildren !== null) {
      // no old child vnodes, but there are new child vnodes to add
      if (oldVNode.$text$ !== null) {
        // the old vnode was text, so be sure to clear it out
        elm.textContent = '';
      }
      // add the new vnode children
      addVnodes(elm, null, newVNode, newChildren, 0, newChildren.length - 1);
    } else if (
      // don't do this on initial render as it can cause non-hydrated content to be removed
      !isInitialRender &&
      oldChildren !== null
    ) {
      // no new child vnodes, but there are old child vnodes to remove
      removeVnodes(oldChildren, 0, oldChildren.length - 1);
    }

    if (isSvgMode && tag === 'svg') {
      isSvgMode = false;
    }
  } else if (oldVNode.$text$ !== text) {
    // update the text content for the text only vnode
    // and also only if the text is different than before
    elm.data = text;
  }
};

/**
 * 'Nullify' any VDom `ref` callbacks on a VDom node or its children by calling
 * them with `null`. This signals that the DOM element corresponding to the VDom
 * node has been removed from the DOM.
 *
 * @param vNode a virtual DOM node
 */
export const nullifyVNodeRefs = (vNode: VNode) => {
  if (vNode.$attrs$ && vNode.$attrs$.ref) {
    refCallbacksToRemove.push(() => vNode.$attrs$.ref(null));
  }
  vNode.$children$ && vNode.$children$.map(nullifyVNodeRefs);
};

/**
 * Queue a ref callback to be called with an element during rendering.
 * This ensures ref callbacks are called in the correct order.
 *
 * @param refCallback the ref callback function to queue
 * @param elm the element to pass to the callback
 */
export const queueRefAttachment = (refCallback: (elm: any) => void, elm: any) => {
  refCallbacksToAttach.push(() => refCallback(elm));
};

/**
 * Flush all queued ref callbacks in the correct order:
 * first all removal callbacks (with null), then all attachment callbacks (with elements).
 * This ensures that when elements are replaced/reordered, the ref is always left
 * pointing to the current element, not null.
 */
const flushQueuedRefCallbacks = () => {
  // First, call all ref removal callbacks (passing null)
  refCallbacksToRemove.forEach((cb) => cb());
  refCallbacksToRemove.length = 0;

  // Then, call all ref attachment callbacks (passing elements)
  refCallbacksToAttach.forEach((cb) => cb());
  refCallbacksToAttach.length = 0;
};

/**
 * Inserts a node before a reference node as a child of a specified parent node.
 * Additionally, adds parent elements' scope ids as class names to the new node.
 *
 * @param parent parent node
 * @param newNode element to be inserted
 * @param reference anchor element
 * @returns inserted node
 */
export const insertBefore = (
  parent: Node,
  newNode: RenderNode,
  reference?: RenderNode | PatchedSlotNode | null,
): Node => {
  if ((parent as RenderNode).__insertBefore) {
    return (parent as RenderNode).__insertBefore!(newNode, reference) as RenderNode;
  } else {
    return parent?.insertBefore(newNode, reference ?? null) as RenderNode;
  }
};

/**
 * The main entry point for Stencil's virtual DOM-based rendering engine
 *
 * Given a {@link RenderHostRef} container and some virtual DOM nodes, this
 * function will handle creating a virtual DOM tree with a single root, patching
 * the current virtual DOM tree onto an old one (if any), and dealing with slot
 * relocation.
 *
 * @param hostRef data needed to root and render the virtual DOM tree, such as
 * the DOM node into which it should be rendered.
 * @param renderFnResults the virtual DOM nodes to be rendered
 * @param isInitialLoad whether or not this is the first call after page load
 */
export const renderVdom = (hostRef: RenderHostRef, renderFnResults: VNode | VNode[] | null, isInitialLoad = false) => {
  const hostElm = hostRef.$hostElement$;
  const oldVNode: VNode = hostRef.$vnode$ || newVNode(null, null);
  const isHostElement = isHost(renderFnResults);

  // if `renderFnResults` is a Host node then we can use it directly. If not,
  // we need to call `h` again to wrap the children of our component in a
  // 'dummy' Host node (well, an empty vnode) since `renderVdom` assumes
  // implicitly that the top-level vdom node is 1) an only child and 2)
  // contains attrs that need to be set on the host element.
  const rootVnode: VNode = isHostElement ? (renderFnResults as VNode) : h(null, null, renderFnResults as any);

  hostTagName = hostElm.tagName;

  // <Host> runtime check
  if (IS_DEV && Array.isArray(renderFnResults) && renderFnResults.some(isHost)) {
    throw new Error(`The <Host> must be the single root component.
Looks like the render() function of "${hostTagName.toLowerCase()}" is returning an array that contains the <Host>.

The render() function should look like this instead:

render() {
  // Do not return an array
  return (
    <Host>{content}</Host>
  );
}
  `);
  }

  // On the first render and *only* on the first render we want to check for
  // any attributes set on the host element which are also set on the vdom
  // node. If we find them, we override the value on the VDom node attrs with
  // the value from the host element, which allows developers building apps
  // with Stencil components to override e.g. the `role` attribute on a
  // component even if it's already set on the `Host`.
  if (isInitialLoad && rootVnode.$attrs$) {
    for (const key of Object.keys(rootVnode.$attrs$)) {
      // We have a special implementation in `setAccessor` for `style` and
      // `class` which reconciles values coming from the VDom with values
      // already present on the DOM element, so we don't want to override those
      // attributes on the VDom tree with values from the host element if they
      // are present.
      //
      // Likewise, `ref` and `key` are special internal values for the Stencil
      // runtime and we don't want to override those either.
      if (hostElm.hasAttribute(key) && !['key', 'ref', 'style', 'class'].includes(key)) {
        rootVnode.$attrs$[key] = (hostElm as any)[key];
      }
    }
  }

  rootVnode.$tag$ = null;
  rootVnode.$isHost$ = true;
  hostRef.$vnode$ = rootVnode;
  rootVnode.$elm$ = oldVNode.$elm$ = (hostElm.shadowRoot || hostElm) as any;

  patch(oldVNode, rootVnode, isInitialLoad);

  flushQueuedRefCallbacks();
};
