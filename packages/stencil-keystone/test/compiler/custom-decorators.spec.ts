import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

// Under legacy decorators, the compiler strips only its OWN decorators and leaves
// custom ones to run at runtime. `proxyCustomElement` is emitted inside a `static {}`
// block so it defines the reactive accessors DURING class definition — before TS's
// `__decorate` — letting a legacy decorator wrap the accessor it just created.
describe('compiler — custom (legacy) decorators', () => {
  it('preserves a custom decorator co-located with @Prop; proxyCustomElement runs in a static block', () => {
    const out = compile(`
      import { Component, Prop } from 'stencil-keystone';
      import { FormReconcile } from './form';
      @Component({ name: 'x-f' })
      export class XF {
        @Prop() @FormReconcile('value') value = 0;
        render() { return null; }
      }
    `);
    // proxyCustomElement moved into a static block (runs before __decorate)
    expect(out).toMatch(/static\s*\{\s*proxyCustomElement\(\s*"x-f"\s*,\s*this\s*,/);
    // the custom decorator is preserved (lowered to __decorate on the prototype)
    expect(out).toMatch(/__decorate\(\s*\[\s*FormReconcile\('value'\)\s*\]\s*,\s*XF\.prototype\s*,\s*"value"/);
    // @Prop stripped, its default kept
    expect(out).not.toContain('@Prop');
    expect(out).toMatch(/\{\s*value\s*:\s*0\s*\}/);
    // the custom decorator's import is preserved
    expect(out).toContain("from './form'");
  });

  it('preserves a custom decorator co-located with @Watch on a method', () => {
    const out = compile(`
      import { Component, Prop, Watch } from 'stencil-keystone';
      import { Bind } from './bind';
      @Component({ name: 'x-b' })
      export class XB {
        @Prop() value = 0;
        @Watch('value') @Bind() onValue() {}
        render() { return null; }
      }
    `);
    expect(out).toMatch(/__decorate\(\s*\[\s*Bind\(\)\s*\]\s*,\s*XB\.prototype\s*,\s*"onValue"/);
    expect(out).not.toContain('@Watch');
  });

  it('preserves a custom class decorator', () => {
    const out = compile(`
      import { Component } from 'stencil-keystone';
      import { Track } from './track';
      @Track()
      @Component({ name: 'x-t' })
      export class XT { render() { return null; } }
    `);
    expect(out).not.toContain('@Component');
    expect(out).toMatch(/__decorate\(\s*\[\s*Track\(\)\s*\]\s*,\s*XT\s*\)/);
  });
});
