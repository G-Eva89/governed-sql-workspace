import { AppError } from '@governed-sql/core';

export function resolveConnectionId(
  scopes: string[],
  inputConnectionId: string | undefined,
  defaultConnectionId: string | undefined,
): string {
  if (inputConnectionId) {
    return inputConnectionId;
  }

  if (defaultConnectionId) {
    return defaultConnectionId;
  }

  const concreteScopes = scopes.filter((scope) => scope !== '*');
  if (concreteScopes.length === 1) {
    return concreteScopes[0]!;
  }

  throw new AppError(
    'BAD_REQUEST',
    'connectionId is required when the API key is org-wide or scoped to multiple connections',
  );
}
