import { createConfigMerger } from '@trethore/pi-shared/config/schema.js';

export { hasFields, type ConfigFieldMerger } from '@trethore/pi-shared/config/schema.js';

export const { mergeField, mergeSection } = createConfigMerger('pi-cut');
