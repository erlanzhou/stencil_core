import { DIST_GLOBAL_STYLES, isBoolean, isOutputTargetDistCustomElements, join } from '@utils';

import type {
  OutputTarget,
  OutputTargetDistCustomElements,
  OutputTargetDistGlobalStyles,
  ValidatedConfig,
} from '../../../declarations';
import { CustomElementsExportBehaviorOptions } from '../../../declarations';
import { getAbsolutePath } from '../config-utils';

/**
 * Validate one or more `dist-custom-elements` output targets. Validation of an output target may involve back-filling
 * fields that are omitted with sensible defaults and/or creating additional supporting output targets that were not
 * explicitly defined by the user
 * @param config the Stencil configuration associated with the project being compiled
 * @param userOutputs the output target(s) specified by the user
 * @returns the validated output target(s)
 */
export const validateCustomElement = (
  config: ValidatedConfig,
  userOutputs: ReadonlyArray<OutputTarget>,
): ReadonlyArray<OutputTargetDistCustomElements | OutputTargetDistGlobalStyles> => {
  const defaultDir = 'dist';

  return userOutputs.filter(isOutputTargetDistCustomElements).reduce(
    (outputs, o) => {
      const outputTarget = {
        ...o,
        dir: getAbsolutePath(config, o.dir || join(defaultDir, 'components')),
      };
      if (!isBoolean(outputTarget.empty)) {
        outputTarget.empty = true;
      }
      if (!isBoolean(outputTarget.externalRuntime)) {
        outputTarget.externalRuntime = true;
      }
      outputTarget.generateTypeDeclarations = false;
      // Export behavior must be defined on the validated target config and must
      // be one of the export behavior valid values
      if (
        outputTarget.customElementsExportBehavior == null ||
        !CustomElementsExportBehaviorOptions.includes(outputTarget.customElementsExportBehavior)
      ) {
        outputTarget.customElementsExportBehavior = 'default';
      }

      // Normalize autoLoader option
      if (outputTarget.autoLoader === true) {
        outputTarget.autoLoader = {
          fileName: 'loader',
          autoStart: true,
        };
      } else if (outputTarget.autoLoader && typeof outputTarget.autoLoader === 'object') {
        outputTarget.autoLoader = {
          fileName: outputTarget.autoLoader.fileName || 'loader',
          autoStart: outputTarget.autoLoader.autoStart !== false,
        };
      }

      outputTarget.copy = [];
      outputs.push(outputTarget);
      outputs.push({
        type: DIST_GLOBAL_STYLES,
        file: join(outputTarget.dir, `${config.fsNamespace}.css`),
      });

      return outputs;
    },
    [] as (OutputTargetDistCustomElements | OutputTargetDistGlobalStyles)[],
  );
};
