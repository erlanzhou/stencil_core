import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HostElement } from '../src/index';

// The feature detection in styles.ts runs once at module evaluation. To exercise
// the `<style>`-element fallback we simulate an engine without constructable
// stylesheets by removing the `CSSStyleSheet` global, then re-import the module
// fresh so it re-evaluates the detection. styles.ts has no runtime imports (only
// a type import), so a fresh copy is fully self-contained — no shared singleton
// state to break, unlike importing it through proxyCustomElement.
describe('shadow styles — <style> fallback (no constructable stylesheets)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('concatenates the chunks and appends a <style> element', async () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    vi.resetModules();
    const { registerStyles, attachStyles } = await import('../src/element/styles');

    registerStyles('x-fallback', [':host{color:red}', 'span{color:blue}']);

    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    attachStyles(host as unknown as HostElement, 'x-fallback');

    const styleEl = host.shadowRoot?.querySelector('style');
    expect(styleEl).toBeTruthy();
    expect(styleEl?.textContent).toBe(':host{color:red}\nspan{color:blue}');
    expect(host.shadowRoot?.adoptedStyleSheets.length).toBe(0);
  });

  it('does nothing when the component has no registered styles', async () => {
    vi.stubGlobal('CSSStyleSheet', undefined);
    vi.resetModules();
    const { attachStyles } = await import('../src/element/styles');

    const host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    attachStyles(host as unknown as HostElement, 'x-unregistered');

    expect(host.shadowRoot?.querySelector('style')).toBeNull();
  });
});
