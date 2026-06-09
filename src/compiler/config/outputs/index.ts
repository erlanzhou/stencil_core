import { buildError, isOutputTargetDocsCustom, isValidConfigOutputTarget, VALID_CONFIG_OUTPUT_TARGETS } from '@utils';

import type * as d from '../../../declarations';
import { validateCustomElement } from './validate-custom-element';
import { validateDocs } from './validate-docs';

export const validateOutputTargets = (config: d.ValidatedConfig, diagnostics: d.Diagnostic[]) => {
  const userOutputs = (config.outputTargets || []).slice();

  userOutputs.forEach((outputTarget) => {
    if (!isValidConfigOutputTarget(outputTarget.type)) {
      const err = buildError(diagnostics);
      err.messageText = `Invalid outputTarget type "${
        outputTarget.type
      }". Valid outputTarget types include: ${VALID_CONFIG_OUTPUT_TARGETS.map((t) => `"${t}"`).join(', ')}`;
    }
  });

  config.outputTargets = [
    ...validateCustomElement(config, userOutputs),
    ...validateDocs(config, diagnostics, userOutputs).filter(isOutputTargetDocsCustom),
  ];
};
