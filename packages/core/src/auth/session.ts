import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '../errors.js';

export const SESSION_COOKIE_NAME = 'gsw_session';
const SESSION_ISSUER = 'governed-sql-workspace';
const SESSION_AUDIENCE = 'governed-sql-api';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type SessionPayload = {
  userId: string;
  orgId: string;
  role: 'admin' | 'member';
  email: string;
};

function getSessionSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('INTERNAL_ERROR', 'SESSION_SECRET is required in production');
    }
    return new TextEncoder().encode('dev-only-session-secret-change-me');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({
    orgId: payload.orgId,
    role: payload.role,
    email: payload.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    const userId = payload.sub;
    const orgId = payload.orgId;
    const role = payload.role;
    const email = payload.email;

    if (
      typeof userId !== 'string' ||
      typeof orgId !== 'string' ||
      (role !== 'admin' && role !== 'member') ||
      typeof email !== 'string'
    ) {
      throw new AppError('UNAUTHORIZED', 'Invalid session token');
    }

    return { userId, orgId, role, email };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('UNAUTHORIZED', 'Invalid or expired session');
  }
}

export function getSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function getClearSessionCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Lax';
  path: string;
  maxAge: number;
} {
  return {
    ...getSessionCookieOptions(),
    maxAge: 0,
  };
}
