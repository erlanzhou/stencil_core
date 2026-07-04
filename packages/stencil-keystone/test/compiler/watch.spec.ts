import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Watch', () => {
  it('collects watched methods and strips the decorator', () => {
    const out = compile(`
      import { Component, Prop, Watch } from 'stencil-keystone';
      @Component({ name: 'x-w' })
      export class XW {
        @Prop() value = 0;
        @Watch('value') onValueChange(n, o) { console.log(n, o); }
        render() { return null; }
      }
    `);

    // watched object is the 5th positional arg (styles undefined, members present)
    expect(out).toMatch(/proxyCustomElement\(\s*"x-w"\s*,\s*XW\s*,\s*undefined\s*,\s*\[\s*"value"\s*\]\s*,\s*\{\s*"value"\s*:\s*\[\s*"onValueChange"\s*\]\s*\}/);
    // method body preserved, decorator gone
    expect(out).toContain('onValueChange');
    expect(out).not.toContain('@Watch');
  });
});
