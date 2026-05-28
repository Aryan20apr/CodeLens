import { readFileSync } from 'fs';
import { resolve } from 'path';

export function resolveGithubAppPrivateKey(): string {
  const inline = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (inline) {
    return inline.replace(/\\n/g, '\n');
  }

  const b64 = process.env.GITHUB_APP_PRIVATE_KEY_BASE64?.trim();
  if (b64) {
    return Buffer.from(b64, 'base64').toString('utf8');
  }

  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH?.trim();
  if (keyPath) {
    return readFileSync(resolve(keyPath), 'utf8');
  }

  return '';
}
