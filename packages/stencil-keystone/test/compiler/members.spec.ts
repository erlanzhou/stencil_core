import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Prop / @State', () => {
  it('collects members and moves initializers into the constructor', () => {
    const out = compile(`
      import { Component, Prop, State } from 'stencil-keystone';
      @Component({ name: 'x-counter' })
      export class XCounter {
        @Prop() step = 1;
        @State() count = 0;
        render() { return null; }
      }
    `);

    // both names collected, order preserved. `styles` is omitted here, so
    // `emitRegistration` (unchanged from Task 2) emits an explicit `undefined`
    // placeholder to keep `members` in its correct positional slot per
    // `proxyCustomElement`'s real signature (tagName, Cstr, styles?, members?, watched?).
    expect(out).toMatch(
      /proxyCustomElement\(\s*"x-counter"\s*,\s*XCounter\s*,\s*(?:undefined\s*,\s*)?\[\s*"step"\s*,\s*"count"\s*\]/,
    );
    // no field declarations remain (they would shadow the reactive accessor)
    expect(out).not.toMatch(/@Prop|@State/);
    // initializers routed through the setter in the constructor
    expect(out).toMatch(/this\.step\s*=\s*1/);
    expect(out).toMatch(/this\.count\s*=\s*0/);
  });

  it('collects a member with no initializer without a constructor seed', () => {
    const out = compile(`
      import { Component, Prop } from 'stencil-keystone';
      @Component({ name: 'x-p' })
      export class XP { @Prop() label; render() { return null; } }
    `);
    expect(out).toMatch(/\[\s*"label"\s*\]/);
    expect(out).not.toMatch(/this\.label\s*=/);
  });
});
