import { buildError, isFunction, isOutputTargetDocsCustom } from '@utils';

import type * as d from '../../../declarations';

export const validateDocs = (_config: d.ValidatedConfig, diagnostics: d.Diagnostic[], userOutputs: d.OutputTarget[]) => {
  const docsOutputs: d.OutputTarget[] = [];

  const customDocsOutputs = userOutputs.filter(isOutputTargetDocsCustom);
  customDocsOutputs.forEach((customDocsOutput) => {
    docsOutputs.push(validateCustomDocsOutputTarget(diagnostics, customDocsOutput));
  });

  return docsOutputs;
};

const validateCustomDocsOutputTarget = (diagnostics: d.Diagnostic[], outputTarget: d.OutputTargetDocsCustom) => {
  if (!isFunction(outputTarget.generator)) {
    const err = buildError(diagnostics);
    err.messageText = `docs-custom outputTarget missing the "generator" function`;
  }

  outputTarget.strict = !!outputTarget.strict;
  return outputTarget;
};
