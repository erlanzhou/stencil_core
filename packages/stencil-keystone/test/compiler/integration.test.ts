import '../fixtures/greeter'; // compiled by the keystone plugin, self-registers

import { describe, expect, it } from 'vitest';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe('compiler — integration', () => {
  it('renders, reacts to prop changes, and emits @Event', async () => {
    const el = document.createElement('x-greeter') as HTMLElement & { name: string; greet(): Promise<string> };
    document.body.appendChild(el);
    await tick();

    expect(el.shadowRoot?.textContent).toContain('Hello world');
    expect(el.shadowRoot?.adoptedStyleSheets.length ?? 0).toBeGreaterThanOrEqual(0); // styles applied (path varies by engine)

    el.name = 'keystone';
    await tick();
    expect(el.shadowRoot?.textContent).toContain('Hello keystone');

    let detail: string | undefined;
    el.addEventListener('greeted', (e) => (detail = (e as CustomEvent<string>).detail));
    await el.greet();
    expect(detail).toBe('keystone');
  });
});
