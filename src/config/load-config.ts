import { convictSchema } from './convict.schema';
import { resolveGithubAppPrivateKey } from './github-app-key.util';

export function loadConfig() {
  const config = convictSchema;

  const pem = resolveGithubAppPrivateKey();
  if (pem) {
    config.set('githubApp.privateKey', pem);
  }

  config.validate({ allowed: 'strict' });

  const props = config.getProperties();

  if (props.env !== 'test') {
    if (!props.githubApp.appId || !props.githubApp.privateKey || !props.githubApp.webhookSecret) {
      throw new Error(
        'Missing GitHub App config: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (or _BASE64 / _PATH), GITHUB_WEBHOOK_SECRET',
      );
    }
  }

  return props;
}
