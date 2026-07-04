import { createHash, randomBytes } from 'node:crypto';

export const API_KEY_PREFIX = 'gsw_';
const KEY_RANDOM_BYTES = 32;
export const API_KEY_DISPLAY_PREFIX_LENGTH = 8;

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateApiKeySecret(): { secret: string; prefix: string; hash: string } {
  const randomPart = randomBytes(KEY_RANDOM_BYTES).toString('base64url');
  const secret = `${API_KEY_PREFIX}${randomPart}`;
  const prefix = secret.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
  return { secret, prefix, hash: hashApiKey(secret) };
}
