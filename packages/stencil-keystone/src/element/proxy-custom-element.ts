import type { HostElement } from '../internal/types';
import { getHostRef, HOST_FLAGS } from './host-ref';
import { defineReactiveMembers } from './reactive-members';
import { attachStyles, registerStyles } from './styles';
import type { ComponentRuntimeMeta } from './types';
import { scheduleUpdate } from './update-component';

/**
 * Augment a component constructor so its instances behave as custom elements:
 * define reactive `@Prop`/`@State` accessors, wire the lifecycle callbacks,
 * attach an (open) shadow root, and drive rendering through the kernel. The
 * constructor is mutated in place and returned.
 *
 * Eager profile: the element is the component instance; there is no lazy loading.
 * Parameters are positional (ordered by how often the compiler emits them) so the
 * generated call sites stay compact.
 *
 * @param tagName the component's tag name
 * @param Cstr the component constructor to augment
 * @param styles the component's CSS chunks
 * @param members the reactive member names not already implied by `defaults`/`watched`
 * @param defaults default values for `@Prop` members (its keys are also members)
 * @param watched maps a watched property to the method names that `@Watch` it
 * @returns the same constructor, augmented
 */
export const proxyCustomElement = <T extends CustomElementConstructor>(
  tagName: string,
  Cstr: T,
  styles?: string[],
  members?: string[],
  defaults?: Record<string, unknown>,
  watched?: Record<string, string[]>,
): T => {
  const cmpMeta: ComponentRuntimeMeta = {
    $tagName$: tagName,
    $styles$: styles,
    $members$: members,
    $defaults$: defaults,
    $watched$: watched,
  };

  defineReactiveMembers(Cstr, cmpMeta);

  if (styles) {
    registerStyles(tagName, styles);
  }

  const proto = Cstr.prototype as Record<string, unknown>;
  const originalConnectedCallback = proto.connectedCallback as ((this: HostElement) => void) | undefined;
  const originalDisconnectedCallback = proto.disconnectedCallback as ((this: HostElement) => void) | undefined;

  proto.connectedCallback = function (this: HostElement): void {
    // The host reference is registered at construction (the compiler injects
    // `baseConstructor(this)` into the component constructor), so it is
    // guaranteed to exist here.
    const hostRef = getHostRef(this)!;
    if (!(hostRef.$flags$ & HOST_FLAGS.hasConnected)) {
      hostRef.$flags$ |= HOST_FLAGS.hasConnected;
      attachShadow(this);
      attachStyles(this, tagName);
      scheduleUpdate(hostRef);
    }
    originalConnectedCallback?.call(this);
  };

  proto.disconnectedCallback = function (this: HostElement): void {
    originalDisconnectedCallback?.call(this);
  };

  return Cstr;
};

/**
 * Attach an open shadow root, reusing one already present (e.g. from a
 * Declarative Shadow DOM template). A present `shadowRoot` is always open — the
 * getter returns `null` for closed roots — so no mode check is needed.
 *
 * @param elm the host element
 */
const attachShadow = (elm: HostElement): void => {
  if (!elm.shadowRoot) {
    elm.attachShadow({ mode: 'open' });
  }
};
