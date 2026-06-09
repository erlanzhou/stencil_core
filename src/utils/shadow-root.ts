import { BUILD } from '@app-data';
import { globalStyles } from '@app-globals';
import { supportsConstructableStylesheets, supportsMutableAdoptedStyleSheets } from '@platform';
import { CMP_FLAGS } from '@utils/constants';

import type * as d from '../declarations';
import { HYDRATED_STYLE_ID } from '../runtime/runtime-constants';
import { createStyleSheetIfNeededAndSupported } from './style';

let globalStyleSheet: CSSStyleSheet | null | undefined;

// Constant scope ID for global styles to enable HMR tracking
const GLOBAL_STYLE_ID = 'sc-global';

export function createShadowRoot(this: HTMLElement, cmpMeta: d.ComponentRuntimeMeta) {
  const opts: ShadowRootInit = { mode: 'open' };

  if (BUILD.shadowDelegatesFocus) {
    opts.delegatesFocus = !!(cmpMeta.$flags$ & CMP_FLAGS.shadowDelegatesFocus);
  }

  if (BUILD.shadowSlotAssignmentManual) {
    const isManual = !!(cmpMeta.$flags$ & CMP_FLAGS.shadowSlotAssignmentManual);
    if (isManual) {
      opts.slotAssignment = 'manual';
    }
  }

  const shadowRoot = this.attachShadow(opts);

  if (!supportsConstructableStylesheets) {
    throw new Error('Constructable stylesheets are required in this runtime profile.');
  }

  // Initialize if undefined, set to CSSStyleSheet or null
  if (globalStyleSheet === undefined) globalStyleSheet = createStyleSheetIfNeededAndSupported(globalStyles) ?? null;

  // Use initialized global stylesheet if available
  if (globalStyleSheet) {
    if (supportsMutableAdoptedStyleSheets) {
      shadowRoot.adoptedStyleSheets.push(globalStyleSheet);
    } else {
      shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, globalStyleSheet];
    }
  } else if (globalStyles) {
    const styleElm = document.createElement('style');
    styleElm.innerHTML = globalStyles;
    if (BUILD.hotModuleReplacement) {
      styleElm.setAttribute(HYDRATED_STYLE_ID, GLOBAL_STYLE_ID);
    }
    shadowRoot.prepend(styleElm);
  }
}
