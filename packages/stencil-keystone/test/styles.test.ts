import { describe, expect, it } from 'vitest';

import { h } from '../src/index';
import { proxyCustomElement } from '../src/element/index';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('element runtime — slice 4: shadow styles', () => {
  it('adopts a registered stylesheet into the shadow root', async () => {
    class Styled extends HTMLElement {
      render() {
        return h('span', null, 'hi');
      }
    }
    proxyCustomElement(Styled, { $tagName$: 'x-styled', $style$: ':host{color:red}' });
    customElements.define('x-styled', Styled);

    const el = document.createElement('x-styled');
    document.body.appendChild(el);
    await tick();

    expect(el.shadowRoot).toBeTruthy();
    const sheets = el.shadowRoot?.adoptedStyleSheets ?? [];
    expect(sheets.length).toBe(1);
    expect(el.shadowRoot?.textContent).toContain('hi');
  });

  it('shares one stylesheet across instances', async () => {
    class Shared extends HTMLElement {
      render() {
        return h('span', null, 'x');
      }
    }
    proxyCustomElement(Shared, { $tagName$: 'x-shared', $style$: ':host{display:block}' });
    customElements.define('x-shared', Shared);

    const a = document.createElement('x-shared');
    const b = document.createElement('x-shared');
    document.body.appendChild(a);
    document.body.appendChild(b);
    await tick();

    const sheetA = a.shadowRoot?.adoptedStyleSheets?.[0];
    const sheetB = b.shadowRoot?.adoptedStyleSheets?.[0];
    expect(sheetA).toBeTruthy();
    expect(sheetA).toBe(sheetB); // same shared constructable stylesheet
  });
});
