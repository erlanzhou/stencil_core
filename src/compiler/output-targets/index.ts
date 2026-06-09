import type { RollupCache } from 'rollup';

import type * as d from '../../declarations';
import { outputCustomElements } from './dist-custom-elements';
import { outputDocs } from './output-docs';

export const generateOutputTargets = async (
  config: d.ValidatedConfig,
  compilerCtx: d.CompilerCtx,
  buildCtx: d.BuildCtx,
) => {
  const timeSpan = buildCtx.createTimeSpan('generate outputs started', true);

  compilerCtx.changedModules.clear();

  invalidateRollupCaches(compilerCtx);

  await Promise.all([outputCustomElements(config, compilerCtx, buildCtx)]);

  await Promise.all([
    // docs are generated after runtime outputs so it can inspect emitted
    // component metadata.
    outputDocs(config, compilerCtx, buildCtx),
  ]);

  timeSpan.finish('generate outputs finished');
};

const invalidateRollupCaches = (compilerCtx: d.CompilerCtx) => {
  const invalidatedIds = compilerCtx.changedFiles;
  compilerCtx.rollupCache.forEach((cache: RollupCache) => {
    cache.modules.forEach((mod) => {
      if (mod.transformDependencies.some((id) => invalidatedIds.has(id))) {
        mod.originalCode = null;
      }
    });
  });
};
