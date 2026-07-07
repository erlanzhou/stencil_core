import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Event', () => {
  it('seeds the field with createEvent and imports it', () => {
    const out = compile(`
      import { Component, Event, EventEmitter } from 'stencil-keystone';
      @Component({ name: 'x-e' })
      export class XE {
        @Event() saved: EventEmitter<string>;
        render() { return null; }
      }
    `);

    expect(out).toMatch(/this\.saved\s*=\s*createEvent\(this,\s*"saved"\)/);
    expect(out).toContain('createEvent');
    // not a reactive member, not in metadata
    expect(out).not.toMatch(/\[\s*"saved"\s*\]/);
    expect(out).toMatch(/proxyCustomElement\(\s*"x-e"\s*,\s*this\s*\)/);
  });
});
