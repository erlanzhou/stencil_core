import { render as runtimeRender } from '../../runtime/render';
import { h as runtimeH } from '../../runtime/vdom/h';
import { renderVdom as runtimeRenderVdom } from '../../runtime/vdom/vdom-render';

import { h, render, renderVdom } from '../index';

describe('render-kernel compatibility', () => {
  it('exposes the same primitives as runtime render shims', () => {
    expect(render).toBe(runtimeRender);
    expect(h).toBe(runtimeH);
    expect(renderVdom).toBe(runtimeRenderVdom);
  });
});

