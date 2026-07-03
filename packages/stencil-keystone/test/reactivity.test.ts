import { describe, expect, it } from 'vitest';

import { h } from '../src/index';
import { MEMBER_FLAGS, proxyCustomElement } from '../src/element/index';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('element runtime — slice 2: @Prop/@State reactivity', () => {
  it('preserves initial field values (un-shadow) and re-renders on member change', async () => {
    class Counter extends HTMLElement {
      count = 0; // @State
      step = 2; // @Prop
      render() {
        return h('span', null, `count:${this.count} step:${this.step}`);
      }
    }
    proxyCustomElement(Counter, {
      $tagName$: 'x-counter',
      $members$: { count: [MEMBER_FLAGS.State], step: [MEMBER_FLAGS.Prop] },
    });
    customElements.define('x-counter', Counter);

    const el = document.createElement('x-counter') as HTMLElement & { count: number; step: number };
    document.body.appendChild(el);
    await tick();

    // initial field values survived the accessor shadowing
    expect(el.count).toBe(0);
    expect(el.step).toBe(2);
    expect(el.shadowRoot?.textContent).toContain('count:0 step:2');

    // setting a member re-renders
    el.count = 5;
    await tick();
    expect(el.count).toBe(5);
    expect(el.shadowRoot?.textContent).toContain('count:5 step:2');
  });

  it('does not re-render when a member is set to an equal value', async () => {
    let renderCount = 0;
    class Equal extends HTMLElement {
      value = 1;
      render() {
        renderCount++;
        return h('span', null, `${this.value}`);
      }
    }
    proxyCustomElement(Equal, { $tagName$: 'x-equal', $members$: { value: [MEMBER_FLAGS.Prop] } });
    customElements.define('x-equal', Equal);

    const el = document.createElement('x-equal') as HTMLElement & { value: number };
    document.body.appendChild(el);
    await tick();
    expect(renderCount).toBe(1);

    el.value = 1; // unchanged → no re-render
    await tick();
    expect(renderCount).toBe(1);

    el.value = 2; // changed → re-render
    await tick();
    expect(renderCount).toBe(2);
  });

  it('preserves an author-declared getter/setter while staying reactive', async () => {
    class SizeCmp extends HTMLElement {
      _size = 'm';
      get size(): string {
        return this._size;
      }
      set size(v: string) {
        this._size = v.toUpperCase();
      }
      render() {
        return h('span', null, this.size);
      }
    }
    proxyCustomElement(SizeCmp, { $tagName$: 'x-size', $members$: { size: [MEMBER_FLAGS.Prop] } });
    customElements.define('x-size', SizeCmp);

    const el = document.createElement('x-size') as HTMLElement & { size: string };
    document.body.appendChild(el);
    await tick();
    expect(el.shadowRoot?.textContent).toContain('m');

    el.size = 'lg';
    await tick();
    expect(el.size).toBe('LG'); // normalized by author setter
    expect(el.shadowRoot?.textContent).toContain('LG');
  });
});
