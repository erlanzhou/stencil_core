import type { HostElement } from '../internal/types';

/**
 * Whether the platform supports constructable stylesheets (`CSSStyleSheet`
 * with `replaceSync`, adopted via `ShadowRoot.adoptedStyleSheets`). Older engines
 * (e.g. pre-16.4 Safari) fall back to appending a `<style>` element instead.
 */
const supportsConstructableStyleSheets =
  typeof CSSStyleSheet === 'function' &&
  typeof CSSStyleSheet.prototype.replaceSync === 'function' &&
  typeof ShadowRoot === 'function' &&
  'adoptedStyleSheets' in ShadowRoot.prototype;

/**
 * Content-dedup cache: one constructable `CSSStyleSheet` per unique CSS string,
 * so identical CSS shared across components is parsed once and reused. Only used
 * on the constructable path.
 */
const sheetCache = new Map<string, CSSStyleSheet>();

/**
 * Each component's prepared styles, keyed by tag name, so `attachStyles` is a
 * plain lookup. The value is a `CSSStyleSheet[]` on the constructable path, or a
 * single concatenated CSS string on the `<style>`-element fallback path.
 */
const registeredStyles = new Map<string, CSSStyleSheet[] | string>();

const getSheet = (cssText: string): CSSStyleSheet => {
  let sheet = sheetCache.get(cssText);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    sheetCache.set(cssText, sheet);
  }
  return sheet;
};

/**
 * Prepare a component's CSS chunks once at registration: shared, deduped
 * constructable stylesheets where supported, otherwise a single concatenated CSS
 * string for a `<style>` element.
 *
 * @param scopeId the component's scope id (its tag name)
 * @param styles the component's CSS chunks
 */
export const registerStyles = (scopeId: string, styles: string[]): void => {
  registeredStyles.set(
    scopeId,
    supportsConstructableStyleSheets
      ? // dedupe so a component that lists the same CSS twice adopts one sheet
        [...new Set(styles.map(getSheet))]
      : styles.join('\n'),
  );
};

/**
 * Apply a component's registered styles to its shadow root — adopting the shared
 * stylesheets where supported, otherwise appending a `<style>` element.
 *
 * @param elm the host element (must have an attached shadow root)
 * @param scopeId the component's scope id (its tag name)
 */
export const attachStyles = (elm: HostElement, scopeId: string): void => {
  const registered = registeredStyles.get(scopeId);
  const shadowRoot = elm.shadowRoot;
  if (!registered || !shadowRoot) {
    return;
  }
  if (typeof registered === 'string') {
    const style = elm.ownerDocument.createElement('style');
    style.textContent = registered;
    shadowRoot.appendChild(style);
  } else {
    shadowRoot.adoptedStyleSheets = registered;
  }
};
