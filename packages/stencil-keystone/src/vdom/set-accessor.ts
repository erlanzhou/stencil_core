/**
 * Production setAccessor() function based on Preact by
 * Jason Miller (@developit)
 * Licensed under the MIT License
 * https://github.com/developit/preact/blob/master/LICENSE
 *
 * Modified for Stencil's compiler and vdom
 */

import { isComplexType } from '../internal/helpers';
import { isMemberInElement, win } from '../internal/platform';
import { NODE_TYPE, XLINK_NS } from '../internal/runtime-constants';
import type { RenderNode } from '../internal/types';
import { queueRefAttachment } from './vdom-render';

/**
 * When running a VDom render set properties present on a VDom node onto the
 * corresponding HTML element.
 *
 * Note that this function has special functionality for the `class`,
 * `style`, `key`, and `ref` attributes, as well as event handlers (like
 * `onClick`, etc). All others are just passed through as-is.
 *
 * @param elm the HTMLElement onto which attributes should be set
 * @param memberName the name of the attribute to set
 * @param oldValue the old value for the attribute
 * @param newValue the new value for the attribute
 * @param isSvg whether we're in an svg context or not
 * @param isHost whether the target element is the render root (the `<Host>`),
 * in which case attributes are reflected onto the element even when they also
 * exist as DOM properties
 * @param isInitialRender whether this is the first render pass
 */
export const setAccessor = (
  elm: RenderNode,
  memberName: string,
  oldValue: any,
  newValue: any,
  isSvg: boolean,
  isHost: boolean,
  isInitialRender?: boolean,
) => {
  void isInitialRender;

  if (oldValue === newValue) {
    return;
  }

  let isProp = isMemberInElement(elm, memberName);
  let ln = memberName.toLowerCase();
  if (memberName === 'class') {
    const classList = elm.classList;
    const oldClasses = parseClassList(oldValue);
    const newClasses = parseClassList(newValue);

    classList.remove(...oldClasses.filter((c) => c && !newClasses.includes(c)));
    classList.add(...newClasses.filter((c) => c && !oldClasses.includes(c)));
  } else if (memberName === 'style') {
    // update style attribute, css properties and values
    for (const prop in oldValue) {
      if (!newValue || newValue[prop] == null) {
        if (prop.includes('-')) {
          elm.style.removeProperty(prop);
        } else {
          (elm as any).style[prop] = '';
        }
      }
    }

    for (const prop in newValue) {
      if (!oldValue || newValue[prop] !== oldValue[prop]) {
        if (prop.includes('-')) {
          elm.style.setProperty(prop, newValue[prop]);
        } else {
          (elm as any).style[prop] = newValue[prop];
        }
      }
    }
  } else if (memberName === 'key') {
    // minifier will clean this up
  } else if (memberName === 'ref') {
    // minifier will clean this up
    if (newValue) {
      queueRefAttachment(newValue, elm);
    }
  } else if (
    !(elm as any).__lookupSetter__(memberName) &&
    memberName[0] === 'o' &&
    memberName[1] === 'n'
  ) {
    // Event Handlers
    // so if the member name starts with "on" and the 3rd characters is
    // a capital letter, and it's not already a member on the element,
    // then we're assuming it's an event listener
    if (memberName[2] === '-') {
      // on- prefixed events
      // allows to be explicit about the dom event to listen without any magic
      // under the hood:
      // <my-cmp on-click> // listens for "click"
      // <my-cmp on-Click> // listens for "Click"
      // <my-cmp on-ionChange> // listens for "ionChange"
      // <my-cmp on-EVENTS> // listens for "EVENTS"
      memberName = memberName.slice(3);
    } else if (isMemberInElement(win, ln)) {
      // standard event
      // the JSX attribute could have been "onMouseOver" and the
      // member name "onmouseover" is on the window's prototype
      // so let's add the listener "mouseover", which is all lowercased
      memberName = ln.slice(2);
    } else {
      // custom event
      // the JSX attribute could have been "onMyCustomEvent"
      // so let's trim off the "on" prefix and lowercase the first character
      // and add the listener "myCustomEvent"
      // except for the first character, we keep the event name case
      memberName = ln[2] + memberName.slice(3);
    }
    if (oldValue || newValue) {
      // Need to account for "capture" events.
      // If the event name ends with "Capture", we'll update the name to remove
      // the "Capture" suffix and make sure the event listener is setup to handle the capture event.
      const capture = memberName.endsWith(CAPTURE_EVENT_SUFFIX);
      // Make sure we only replace the last instance of "Capture"
      memberName = memberName.replace(CAPTURE_EVENT_REGEX, '');

      if (oldValue) {
        elm.removeEventListener(memberName, oldValue, capture);
      }
      if (newValue) {
        elm.addEventListener(memberName, newValue, capture);
      }
    }
  } else {
    // Set property if it exists and it's not a SVG
    const isComplex = isComplexType(newValue);
    if ((isProp || (isComplex && newValue !== null)) && !isSvg) {
      try {
        if (!elm.tagName.includes('-')) {
          const n = newValue == null ? '' : newValue;

          // Workaround for Safari, moving the <input> caret when re-assigning the same valued
          if (memberName === 'list') {
            isProp = false;
          } else if (oldValue == null || (elm as any)[memberName] !== n) {
            if (typeof (elm as any).__lookupSetter__(memberName) === 'function') {
              (elm as any)[memberName] = n;
            } else {
              elm.setAttribute(memberName, n);
            }
          }
        } else if ((elm as any)[memberName] !== newValue) {
          (elm as any)[memberName] = newValue;
        }
      } catch (e) {
        /**
         * in case someone tries to set a read-only property, e.g. "namespaceURI", we just ignore it
         */
      }
    }

    /**
     * Need to manually update attribute if:
     * - memberName is not an attribute
     * - if we are rendering the host element in order to reflect attribute
     * - if it's a SVG, since properties might not work in <svg>
     * - if the newValue is null/undefined or 'false'.
     */
    let xlink = false;
    if (ln !== (ln = ln.replace(/^xlink\:?/, ''))) {
      memberName = ln;
      xlink = true;
    }
    if (newValue == null || newValue === false) {
      if (newValue !== false || elm.getAttribute(memberName) === '') {
        if (xlink) {
          elm.removeAttributeNS(XLINK_NS, memberName);
        } else {
          elm.removeAttribute(memberName);
        }
      }
    } else if (
      (!isProp || isHost || isSvg) &&
      !isComplex &&
      elm.nodeType === NODE_TYPE.ElementNode
    ) {
      newValue = newValue === true ? '' : newValue;
      if (xlink) {
        elm.setAttributeNS(XLINK_NS, memberName, newValue);
      } else {
        elm.setAttribute(memberName, newValue);
      }
    }
  }
};

const parseClassListRegex = /\s/;
/**
 * Parsed a string of classnames into an array
 * @param value className string, e.g. "foo bar baz"
 * @returns list of classes, e.g. ["foo", "bar", "baz"]
 */
export const parseClassList = /*@__PURE__*/ (value: string | SVGAnimatedString | undefined | null): string[] => {
  // Can't use `value instanceof SVGAnimatedString` because it'll break in non-browser environments
  // see https://developer.mozilla.org/docs/Web/API/SVGAnimatedString for more information
  if (typeof value === 'object' && value && 'baseVal' in value) {
    value = value.baseVal;
  }

  if (!value || typeof value !== 'string') {
    return [];
  }

  return value.split(parseClassListRegex);
};
const CAPTURE_EVENT_SUFFIX = 'Capture';
const CAPTURE_EVENT_REGEX = new RegExp(CAPTURE_EVENT_SUFFIX + '$');
