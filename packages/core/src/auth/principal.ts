export type UserPrincipal = {
  type: 'user';
  id: string;
  orgId: string;
  role: 'admin' | 'member';
};

export type ApiKeyPrincipal = {
  type: 'api_key';
  id: string;
  orgId: string;
  scopes: string[];
};

export type Principal = UserPrincipal | ApiKeyPrincipal;
