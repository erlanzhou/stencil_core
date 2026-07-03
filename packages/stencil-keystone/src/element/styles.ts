import type { HostElement } from '../internal/types';

/**
 * Shared constructable stylesheets, keyed by scope id (the tag name). One sheet
 * per component is adopted by every instance's shadow root.
 */
const registeredSheets = new Map<string, CSSStyleSheet>();

/**
 * Register a component's CSS as a shared constructable stylesheet.
 *
 * @param scopeId the component's scope id (its tag name)
 * @param cssText the component's CSS text
 */
export const registerStyle = (scopeId: string, cssText: string): void => {
  let sheet = registeredSheets.get(scopeId);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    registeredSheets.set(scopeId, sheet);
  }
  sheet.replaceSync(cssText);
};

/**
 * Adopt a component's registered stylesheet into an element's shadow root.
 *
 * @param elm the host element (must have an attached shadow root)
 * @param scopeId the component's scope id (its tag name)
 */
export const attachStyles = (elm: HostElement, scopeId: string): void => {
  const sheet = registeredSheets.get(scopeId);
  const shadowRoot = elm.shadowRoot;
  if (!sheet || !shadowRoot) {
    return;
  }
  if (!shadowRoot.adoptedStyleSheets.includes(sheet)) {
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
  }
};
