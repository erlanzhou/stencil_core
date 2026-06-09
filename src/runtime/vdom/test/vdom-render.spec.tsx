import { BUILD } from '@app-data';

import { h, newVNode } from '../h';
import { isSameVnode, patch, renderVdom } from '../vdom-render';

describe('template elements', () => {
  it('should not apply non-shadow slot relocation even when BUILD.slotRelocation is true', () => {
    const previous = BUILD.slotRelocation;
    BUILD.slotRelocation = true;

    try {
      const hostElm = document.createElement('div');
      const vnode0 = newVNode(null, null);
      vnode0.$elm$ = hostElm;

      patch(vnode0, h('div', null, h('slot', { name: 'start' }, 'fallback')));

      expect(hostElm.querySelector('slot')).not.toBeNull();
      expect(hostElm.querySelector('slot-fb')).toBeNull();
    } finally {
      BUILD.slotRelocation = previous;
    }
  });

  it('should not inject scoped class names even when BUILD.scoped is true', () => {
    const previous = BUILD.scoped;
    BUILD.scoped = true;

    try {
      const hostElm = document.createElement('x-host') as any;
      hostElm['s-sc'] = 'sc-test';

      const hostRef: any = {
        $flags$: 0,
        $cmpMeta$: {
          $flags$: 0,
          $tagName$: 'x-host',
        },
        $hostElement$: hostElm,
      };

      renderVdom(hostRef, h('div', null, 'value'));
      expect(hostElm.querySelector('div')?.classList.contains('sc-test')).toBe(false);
    } finally {
      BUILD.scoped = previous;
    }
  });

  it('should still render text nodes when BUILD.vdomText is false', () => {
    const previous = BUILD.vdomText;
    BUILD.vdomText = false;

    try {
      const hostElm = document.createElement('div');
      const vnode0 = newVNode(null, null);
      vnode0.$elm$ = hostElm;

      patch(vnode0, h('div', null, 'text-content'));

      expect(hostElm.textContent).toBe('text-content');
    } finally {
      BUILD.vdomText = previous;
    }
  });

  it('should render into shadow root even when BUILD.shadowDom is false', () => {
    const previous = BUILD.shadowDom;
    BUILD.shadowDom = false;

    try {
      const hostElm = document.createElement('x-host');
      const shadowRoot = hostElm.attachShadow({ mode: 'open' });

      const hostRef: any = {
        $flags$: 0,
        $cmpMeta$: {
          $flags$: 0,
          $tagName$: 'x-host',
        },
        $hostElement$: hostElm,
      };

      renderVdom(hostRef, h('div', null, 'shadow-content'));

      expect(shadowRoot.textContent).toBe('shadow-content');
      expect(hostElm.textContent).toBe('');
    } finally {
      BUILD.shadowDom = previous;
    }
  });

  it('should append children to template.content, not template directly', () => {
    const hostElm = document.createElement('div');
    const vnode0 = newVNode(null, null);
    vnode0.$elm$ = hostElm;

    // Create a template with children
    const vnode1 = h('div', null, h('template', null, h('span', null, 'Hello'), h('p', null, 'World')));

    patch(vnode0, vnode1);

    const templateEl = hostElm.querySelector('template') as HTMLTemplateElement;
    expect(templateEl).toBeDefined();

    // Children should NOT be direct children of the template element
    expect(templateEl.childNodes.length).toBe(0);

    // Children should be in the template.content DocumentFragment
    expect(templateEl.content.childNodes.length).toBe(2);
    expect((templateEl.content.childNodes[0] as HTMLElement).tagName).toBe('SPAN');
    expect((templateEl.content.childNodes[0] as HTMLElement).textContent).toBe('Hello');
    expect((templateEl.content.childNodes[1] as HTMLElement).tagName).toBe('P');
    expect((templateEl.content.childNodes[1] as HTMLElement).textContent).toBe('World');
  });

  it('should allow cloning template content', () => {
    const hostElm = document.createElement('div');
    const vnode0 = newVNode(null, null);
    vnode0.$elm$ = hostElm;

    const vnode1 = h('div', null, h('template', null, h('div', { class: 'test' }, 'Content to clone')));

    patch(vnode0, vnode1);

    const templateEl = hostElm.querySelector('template') as HTMLTemplateElement;

    // Should be able to clone the content
    const cloned = templateEl.content.cloneNode(true) as DocumentFragment;
    expect(cloned.childNodes.length).toBe(1);
    expect((cloned.childNodes[0] as HTMLElement).className).toBe('test');
    expect((cloned.childNodes[0] as HTMLElement).textContent).toBe('Content to clone');
  });

  it('should update template children correctly', () => {
    const hostElm = document.createElement('div');
    const vnode0 = newVNode(null, null);
    vnode0.$elm$ = hostElm;

    const vnode1 = h('div', null, h('template', null, h('span', null, 'Initial')));
    patch(vnode0, vnode1);

    const templateEl = hostElm.querySelector('template') as HTMLTemplateElement;
    expect(templateEl.content.childNodes.length).toBe(1);
    expect((templateEl.content.childNodes[0] as HTMLElement).textContent).toBe('Initial');

    // Update the template content
    const vnode2 = h('div', null, h('template', null, h('span', null, 'Updated')));
    patch(vnode1, vnode2);

    expect(templateEl.content.childNodes.length).toBe(1);
    expect((templateEl.content.childNodes[0] as HTMLElement).textContent).toBe('Updated');
  });
});

describe('isSameVnode', () => {
  it('should detect objectively same nodes', () => {
    const vnode1: any = {
      $tag$: 'div',
      $key$: '1',
      $elm$: { nodeType: 9 },
    };
    const vnode2: any = {
      $tag$: 'div',
      $key$: '1',
      $elm$: { nodeType: 9 },
    };
    const vnode3: any = {
      $tag$: 'slot',
      $key$: '1',
      $name$: 'my-slot',
      $elm$: { nodeType: 9 },
    };
    const vnode4: any = {
      $tag$: 'slot',
      $name$: 'my-slot',
      $elm$: { nodeType: 9 },
    };
    expect(isSameVnode(vnode1, vnode2)).toBe(true);
    expect(isSameVnode(vnode3, vnode4)).toBe(false);
  });

  it('should add key to old node (e.g. via hydration) on init', () => {
    const vnode1: any = {
      $tag$: 'div',
      $elm$: { nodeType: 9 },
    };
    const vnode2: any = {
      $tag$: 'div',
      $key$: '1',
      $elm$: { nodeType: 9 },
    };
    expect(isSameVnode(vnode1, vnode2)).toBe(false);
    expect(isSameVnode(vnode1, vnode2, true)).toBe(true);
    expect(vnode1.$key$).toBe('1');
  });
});
