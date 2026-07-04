import { describe, expect, it } from 'vitest';

import { proxyCustomElement } from '../src/element/index';
import { h } from '../src/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('element runtime — slice 2: @Prop/@State reactivity', () => {
  it('seeds initial values through the setter (compiled shape) and re-renders on change', async () => {
    class Counter extends KeystoneElement {
      // Compiled shape: initial values are setter-routed constructor assignments
      // (Set semantics), NOT define-semantics class fields — a raw `count = 0`
      // field would create an own data property that shadows the accessor. Using
      // `declare` keeps the type without emitting a shadowing field.
      declare count: number; // @State
      declare step: number; // @Prop
      constructor() {
        super();
        this.count = 0;
        this.step = 2;
      }
      render() {
        return h('span', null, `count:${this.count} step:${this.step}`);
      }
    }
    proxyCustomElement('x-counter', Counter, undefined, ['count', 'step']);
    customElements.define('x-counter', Counter);

    const el = document.createElement('x-counter') as HTMLElement & { count: number; step: number };
    document.body.appendChild(el);
    await tick();

    // initial values seeded via the constructor assignments
    expect(el.count).toBe(0);
    expect(el.step).toBe(2);
    expect(el.shadowRoot?.textContent).toContain('count:0 step:2');

    // setting a member re-renders
    el.count = 5;
    await tick();
    expect(el.count).toBe(5);
    expect(el.shadowRoot?.textContent).toContain('count:5 step:2');
  });

  it('captures a prop set before the element connects (React-wrapper channel)', async () => {
    class Pre extends KeystoneElement {
      declare label: string;
      render() {
        return h('span', null, this.label ?? '');
      }
    }
    proxyCustomElement('x-pre', Pre, undefined, ['label']);
    customElements.define('x-pre', Pre);

    const el = document.createElement('x-pre') as HTMLElement & { label: string };
    el.label = 'set-before-mount'; // before appendChild → before connectedCallback
    document.body.appendChild(el);
    await tick();

    expect(el.label).toBe('set-before-mount');
    expect(el.shadowRoot?.textContent).toContain('set-before-mount');
  });

  it('does not re-render when a member is set to an equal value', async () => {
    let renderCount = 0;
    class Equal extends KeystoneElement {
      declare value: number;
      constructor() {
        super();
        this.value = 1;
      }
      render() {
        renderCount++;
        return h('span', null, `${this.value}`);
      }
    }
    proxyCustomElement('x-equal', Equal, undefined, ['value']);
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
    class SizeCmp extends KeystoneElement {
      // `_size` is not a reactive member, so it stays a plain field (no accessor
      // is defined for it, hence nothing to shadow).
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
    proxyCustomElement('x-size', SizeCmp, undefined, ['size']);
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

  it('reverse case: a define-semantics class field shadows the accessor and is NOT reactive', async () => {
    // Documents the compiler contract: a raw class field for a reactive member
    // creates an own data property that hides the prototype accessor, so writes
    // bypass the setter and nothing becomes reactive. The compiler must emit
    // setter-routed initialization instead of define-semantics fields.
    let renderCount = 0;
    class Shadowed extends KeystoneElement {
      count = 0; // ⚠️ raw class field — shadows the reactive accessor
      render() {
        renderCount++;
        return h('span', null, `${this.count}`);
      }
    }
    proxyCustomElement('x-shadowed', Shadowed, undefined, ['count']);
    customElements.define('x-shadowed', Shadowed);

    const el = document.createElement('x-shadowed') as HTMLElement & { count: number };
    document.body.appendChild(el);
    await tick();
    expect(renderCount).toBe(1);
    expect(el.shadowRoot?.textContent).toContain('0');

    el.count = 5; // writes the own field, bypassing the setter → no reactivity
    await tick();
    expect(el.count).toBe(5); // the own field did update
    expect(renderCount).toBe(1); // ...but no re-render was scheduled
    expect(el.shadowRoot?.textContent).toContain('0'); // DOM is stale
  });
});
