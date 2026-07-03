import type { HostElement } from '../internal/types';
import { getHostRef, HOST_FLAGS, registerHost } from './host-ref';
import { proxyComponent, unshadowMembers } from './proxy-component';
import { attachStyles, registerStyle } from './styles';
import type { ComponentRuntimeMeta } from './types';
import { scheduleUpdate } from './update-component';

/**
 * Augment a component constructor so its instances behave as custom elements:
 * define reactive `@Prop`/`@State` accessors, wire the lifecycle callbacks,
 * attach an (open) shadow root, and drive rendering through the kernel. The
 * constructor is mutated in place and returned.
 *
 * Eager profile: the element is the component instance; there is no lazy loading.
 *
 * @param Cstr the component constructor to augment
 * @param cmpMeta runtime metadata for the component
 * @returns the same constructor, augmented
 */
export const proxyCustomElement = <T extends CustomElementConstructor>(
  Cstr: T,
  cmpMeta: ComponentRuntimeMeta,
): T => {
  proxyComponent(Cstr, cmpMeta);

  if (cmpMeta.$style$ != null) {
    registerStyle(cmpMeta.$tagName$, cmpMeta.$style$);
  }

  const proto = Cstr.prototype as Record<string, unknown>;
  const originalConnectedCallback = proto.connectedCallback as ((this: HostElement) => void) | undefined;
  const originalDisconnectedCallback = proto.disconnectedCallback as ((this: HostElement) => void) | undefined;

  proto.connectedCallback = function (this: HostElement): void {
    const hostRef = getHostRef(this) ?? registerHost(this);
    if (!(hostRef.$flags$ & HOST_FLAGS.hasConnected)) {
      hostRef.$flags$ |= HOST_FLAGS.hasConnected;
      unshadowMembers(this, cmpMeta);
      attachShadow(this);
      attachStyles(this, cmpMeta.$tagName$);
      scheduleUpdate(hostRef);
    }
    originalConnectedCallback?.call(this);
  };

  proto.disconnectedCallback = function (this: HostElement): void {
    originalDisconnectedCallback?.call(this);
  };

  Object.defineProperty(Cstr, 'is', { value: cmpMeta.$tagName$, configurable: true });

  return Cstr;
};

/**
 * Attach an open shadow root, reusing one already present (e.g. from a
 * Declarative Shadow DOM template) as long as it is open.
 *
 * @param elm the host element
 */
const attachShadow = (elm: HostElement): void => {
  if (!elm.shadowRoot) {
    elm.attachShadow({ mode: 'open' });
  } else if (elm.shadowRoot.mode !== 'open') {
    throw new Error(`<${elm.tagName.toLowerCase()}>: only open shadow roots are supported`);
  }
};
