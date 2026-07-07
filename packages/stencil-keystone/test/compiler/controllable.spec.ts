import { describe, expect, it } from 'vitest';

import { transform } from '../../src/compiler/index';

const compile = (src: string) => transform(src, 'test.tsx')?.code ?? '';

describe('compiler — @Controllable', () => {
  it('emits the merge tuple and omits the merged names from members', () => {
    const out = compile(`
      import { Component, Prop, State, Event, EventEmitter, Controllable } from 'stencil-keystone';
      @Component({ name: 'x-collapse' })
      export class XCollapse {
        @Prop() collapsed?: boolean;
        @Prop() defaultCollapsed?: boolean;
        @Event() ksCollapsedChange: EventEmitter<boolean>;
        @Controllable('collapsed', 'defaultCollapsed', 'ksCollapsedChange')
        @State() internalCollapsed?: boolean;
        render() { return null; }
      }
    `);

    // all three merged member names are folded into the runtime member set, so
    // `members` is empty; the config rides as the 7th positional arg.
    expect(out).toMatch(
      /proxyCustomElement\(\s*"x-collapse"\s*,\s*this\s*,\s*undefined\s*,\s*undefined\s*,\s*undefined\s*,\s*undefined\s*,\s*\[\s*\[\s*"internalCollapsed"\s*,\s*"collapsed"\s*,\s*"defaultCollapsed"\s*,\s*"ksCollapsedChange"\s*\]\s*\]/,
    );
    // decorator and its compile-time-only import are stripped
    expect(out).not.toContain('@Controllable');
    expect(out).not.toMatch(/import[^;]*\bControllable\b/);
  });

  it('emits null for the event when none is given', () => {
    const out = compile(`
      import { Component, Prop, State, Controllable } from 'stencil-keystone';
      @Component({ name: 'x-noevt' })
      export class XNoEvt {
        @Prop() value?: string;
        @Prop() defaultValue?: string;
        @Controllable('value', 'defaultValue', null) @State() merged?: string;
        render() { return null; }
      }
    `);
    expect(out).toMatch(/\[\s*"merged"\s*,\s*"value"\s*,\s*"defaultValue"\s*,\s*null\s*\]/);
  });

  it('throws when the controlled prop declares a default', () => {
    const src = `
      import { Component, Prop, State, Controllable } from 'stencil-keystone';
      @Component({ name: 'x-bad' })
      export class XBad {
        @Prop() collapsed = false;
        @Prop() defaultCollapsed?: boolean;
        @Controllable('collapsed', 'defaultCollapsed', null) @State() merged?: boolean;
        render() { return null; }
      }
    `;
    expect(() => transform(src, 'bad.tsx')).toThrow(/must not declare a default/);
  });
});
