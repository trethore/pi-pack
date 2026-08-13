import { createConfigMerger } from '@trethore/shared/config/schema.js';

export { hasFields, type ConfigFieldMerger } from '@trethore/shared/config/schema.js';

export const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger('pi-cut');
