import {
  isOutputTargetDocsCustom,
} from '@utils';

import type * as d from '../../declarations';
import { generateCustomDocs } from '../docs/custom';
import { generateDocData } from '../docs/generate-doc-data';

/**
 * Generate documentation-related output targets
 * @param config the configuration associated with the current Stencil task run
 * @param compilerCtx the current compiler context
 * @param buildCtx the build context for the current Stencil task run
 */
export const outputDocs = async (
  config: d.ValidatedConfig,
  compilerCtx: d.CompilerCtx,
  buildCtx: d.BuildCtx,
): Promise<void> => {
  if (!config.buildDocs) {
    return;
  }
  const docsOutputTargets = config.outputTargets.filter(
    (o) => isOutputTargetDocsCustom(o),
  );

  if (docsOutputTargets.length === 0) {
    return;
  }

  // ensure all the styles are built first, which parses all the css docs
  await buildCtx.stylesPromise;

  const docsData = await generateDocData(config, compilerCtx, buildCtx);

  await generateCustomDocs(config, docsData, docsOutputTargets);
};
