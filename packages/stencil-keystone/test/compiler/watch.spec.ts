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

    // `value` is a @Prop default AND watched, so it appears in neither members
    // (it's covered by both) — members is empty. Order: styles, members, defaults, watched.
    expect(out).toMatch(
      /proxyCustomElement\(\s*"x-w"\s*,\s*this\s*,\s*undefined\s*,\s*undefined\s*,\s*\{\s*value\s*:\s*0\s*\}\s*,\s*\{\s*"value"\s*:\s*\[\s*"onValueChange"\s*\]\s*\}/,
    );
    // method body preserved, decorator gone
    expect(out).toContain('onValueChange');
    expect(out).not.toContain('@Watch');
  });
});
