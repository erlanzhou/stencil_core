import { describe, expect, it } from 'vitest';

import { proxyCustomElement } from '../src/element/index';
import { h } from '../src/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// Vue 2 binds a `value` prop in two steps: `el._value = raw` (the pre-coercion
// value) then `el.value = String(raw)` (DOM values are strings). The runtime
// installs a `_value` write-through + string-echo guard so the component's
// reactive `value` keeps the raw value.
const defineField = (tag: string) => {
  class Field extends KeystoneElement {
    declare value: unknown;
    constructor() {
      super();
      this.value = '';
    }
    render() {
      return h('span', null, String(this.value));
    }
  }
  proxyCustomElement(tag, Field, undefined, ['value']);
  customElements.define(tag, Field);
  return () => document.createElement(tag) as HTMLElement & { value: unknown; _value: unknown };
};

describe('Vue 2 `_value` / `value` compatibility', () => {
  it('keeps the raw number when Vue writes _value then the stringified value', async () => {
    const make = defineField('x-vue-num');
    const el = make();
    document.body.appendChild(el);
    await tick();

    el._value = 42; // Vue: raw
    el.value = '42'; // Vue: String(raw) — must be swallowed
    expect(el.value).toBe(42);

    await tick();
    expect(el.shadowRoot?.textContent).toContain('42');
  });

  it('keeps a raw object when Vue writes _value then "[object Object]"', () => {
    const make = defineField('x-vue-obj');
    const el = make();
    const raw = { a: 1 };
    el._value = raw;
    el.value = '[object Object]';
    expect(el.value).toBe(raw);
  });

  it('keeps undefined (Vue writes value = "") ', () => {
    const make = defineField('x-vue-undef');
    const el = make();
    el._value = undefined;
    el.value = ''; // Vue stringifies undefined to ''
    expect(el.value).toBeUndefined();
  });

  it('does not swallow a genuine value set that differs from the echo', () => {
    const make = defineField('x-vue-genuine');
    const el = make();
    el._value = 1; // arms echo "1"
    el.value = '2'; // not the echo → a real set
    expect(el.value).toBe('2');
  });

  it('is inert for React-style direct value assignment (no _value)', () => {
    const make = defineField('x-vue-react');
    const el = make();
    el.value = 5;
    expect(el.value).toBe(5);
  });

  it('the _value write-through triggers a re-render with the raw value', async () => {
    const make = defineField('x-vue-render');
    const el = make();
    document.body.appendChild(el);
    await tick();

    el._value = 99;
    el.value = '99'; // echo, swallowed
    await tick();
    expect(el.value).toBe(99);
    expect(el.shadowRoot?.textContent).toContain('99');
  });
});
