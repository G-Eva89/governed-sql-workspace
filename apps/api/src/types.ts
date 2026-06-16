import type { SessionPayload } from '@governed-sql/core';

export type ApiBindings = {
  Variables: {
    requestId: string;
    session?: SessionPayload;
  };
};
