import { convictSchema } from './convict.schema';

export function loadConfig() {
  const config = convictSchema;
  config.validate({ allowed: 'strict' });
  return config.getProperties();
}
