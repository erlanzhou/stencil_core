import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Method', () => {
  it('strips the decorator and keeps the method intact', () => {
    const out = compile(`
      import { Component, Method } from 'stencil-keystone';
      @Component({ name: 'x-m' })
      export class XM {
        @Method() async open() { return 42; }
        render() { return null; }
      }
    `);

    // decorator should not be applied (no __esDecorate for this method)
    expect(out).not.toContain('_open_decorators');
    expect(out).not.toContain('Method()');
    expect(out).toMatch(/async open\(\)/);
    // no metadata, no createEvent import triggered
    expect(out).toMatch(/proxyCustomElement\(\s*"x-m"\s*,\s*this\s*\)/);
    expect(out).not.toContain('createEvent');
  });
});
