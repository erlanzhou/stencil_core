import { describe, expect, it } from 'vitest';

import { proxyCustomElement } from '../src/element/index';
import { h } from '../src/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// `@Prop` defaults are passed to `proxyCustomElement` as the `defaults` object
// (5th positional arg); the getter returns them when the stored value is
// undefined. `@State` initializers are seeded per-instance in the constructor
// (via a members entry), never in `defaults`.
describe('default values (@Prop defaultProps semantics)', () => {
  it('returns the @Prop default when unset, and renders it', async () => {
    class Cmp extends KeystoneElement {
      declare label: string;
      render() {
        return h('span', null, this.label);
      }
    }
    proxyCustomElement('x-def-unset', Cmp, undefined, undefined, { label: 'Count' });
    customElements.define('x-def-unset', Cmp);

    const el = document.createElement('x-def-unset') as HTMLElement & { label: unknown };
    expect(el.label).toBe('Count');

    document.body.appendChild(el);
    await tick();
    expect(el.shadowRoot?.textContent).toContain('Count');
  });

  it('falls back to the default when a @Prop is explicitly set to undefined', () => {
    class Cmp extends KeystoneElement {
      declare label: string;
    }
    proxyCustomElement('x-def-undef', Cmp, undefined, undefined, { label: 'Count' });
    customElements.define('x-def-undef', Cmp);

    const el = document.createElement('x-def-undef') as HTMLElement & { label: unknown };
    el.label = 'Hi';
    expect(el.label).toBe('Hi');
    el.label = undefined;
    expect(el.label).toBe('Count'); // undefined → default
  });

  it('keeps undefined for @State set to undefined (component-controlled, no fallback)', () => {
    class Cmp extends KeystoneElement {
      declare count: number;
      constructor() {
        super();
        this.count = 0;
      }
    }
    // @State: listed in members, absent from defaults.
    proxyCustomElement('x-def-state', Cmp, undefined, ['count']);
    customElements.define('x-def-state', Cmp);

    const el = document.createElement('x-def-state') as HTMLElement & { count: unknown };
    expect(el.count).toBe(0);
    el.count = undefined;
    expect(el.count).toBeUndefined();
  });

  it('shares an object @Prop default across instances (React defaultProps model)', () => {
    class Cmp extends KeystoneElement {
      declare config: object;
    }
    proxyCustomElement('x-def-shared', Cmp, undefined, undefined, { config: { theme: 'dark' } });
    customElements.define('x-def-shared', Cmp);

    const a = document.createElement('x-def-shared') as HTMLElement & { config: unknown };
    const b = document.createElement('x-def-shared') as HTMLElement & { config: unknown };
    expect(a.config).toBe(b.config); // one shared reference
  });

  it('gives each instance its own @State object default (per-instance constructor seed)', () => {
    class Cmp extends KeystoneElement {
      declare items: unknown[];
      constructor() {
        super();
        this.items = [];
      }
    }
    proxyCustomElement('x-def-perinst', Cmp, undefined, ['items']);
    customElements.define('x-def-perinst', Cmp);

    const a = document.createElement('x-def-perinst') as HTMLElement & { items: unknown };
    const b = document.createElement('x-def-perinst') as HTMLElement & { items: unknown };
    expect(a.items).not.toBe(b.items); // fresh array per instance
  });
});
