import type { ApiKeyPrincipal, UserPrincipal } from '@governed-sql/core';

export type Principal = UserPrincipal | ApiKeyPrincipal;

export type ApiBindings = {
  Variables: {
    requestId: string;
    session?: import('@governed-sql/core').SessionPayload;
    principal?: Principal;
  };
};
