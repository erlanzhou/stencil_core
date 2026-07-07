import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Prop / @State', () => {
  it('routes @Prop defaults into `defaults`, seeds @State in the constructor', () => {
    const out = compile(`
      import { Component, Prop, State } from 'stencil-keystone';
      @Component({ name: 'x-counter' })
      export class XCounter {
        @Prop() step = 1;
        @State() count = 0;
        render() { return null; }
      }
    `);

    // `step` (a @Prop default) rides in the defaults object and is NOT repeated in
    // members; `count` (a @State) stays in members and is seeded in the constructor.
    // Positional order: (tag, Cstr, styles?, members?, defaults?, watched?).
    expect(out).toMatch(
      /proxyCustomElement\(\s*"x-counter"\s*,\s*this\s*,\s*undefined\s*,\s*\[\s*"count"\s*\]\s*,\s*\{\s*step\s*:\s*1\s*\}/,
    );
    // @State initializer seeded per-instance; @Prop default is NOT a constructor seed
    expect(out).toMatch(/this\.count\s*=\s*0/);
    expect(out).not.toMatch(/this\.step/);
    // no field declarations remain (they would shadow the reactive accessor)
    expect(out).not.toMatch(/@Prop|@State/);
  });

  it('lists a @Prop without an initializer in members (no default, no seed)', () => {
    const out = compile(`
      import { Component, Prop } from 'stencil-keystone';
      @Component({ name: 'x-p' })
      export class XP { @Prop() label; render() { return null; } }
    `);
    // no initializer → no default object, just a members entry
    expect(out).toMatch(/proxyCustomElement\(\s*"x-p"\s*,\s*this\s*,\s*undefined\s*,\s*\[\s*"label"\s*\]\s*\)/);
    expect(out).not.toMatch(/this\.label\s*=/);
  });
});
