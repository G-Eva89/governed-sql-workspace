import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { LoginResponse } from '@governed-sql/schemas';
import type { AppDatabase } from '@governed-sql/db';
import { memberships, organizations, users } from '@governed-sql/db';
import { AppError } from '../errors.js';
import { createSessionToken, verifySessionToken, type SessionPayload } from './session.js';

export class AuthService {
  constructor(private readonly db: AppDatabase['db']) {}

  async login(email: string, password: string): Promise<{ token: string; session: LoginResponse }> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !(await compare(password, user.passwordHash))) {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password');
    }

    const [membership] = await this.db
      .select({
        role: memberships.role,
        orgId: memberships.orgId,
        orgName: organizations.name,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.orgId, organizations.id))
      .where(eq(memberships.userId, user.id))
      .limit(1);

    if (!membership) {
      throw new AppError('FORBIDDEN', 'User is not assigned to an organization');
    }

    const session: SessionPayload = {
      userId: user.id,
      orgId: membership.orgId,
      role: membership.role,
      email: user.email,
    };

    const token = await createSessionToken(session);

    return {
      token,
      session: {
        user: {
          id: user.id,
          email: user.email,
        },
        org: {
          id: membership.orgId,
          name: membership.orgName,
        },
        role: membership.role,
      },
    };
  }

  async verifySession(token: string): Promise<SessionPayload> {
    return verifySessionToken(token);
  }

  async getCurrentUser(session: SessionPayload): Promise<LoginResponse> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user) {
      throw new AppError('UNAUTHORIZED', 'User no longer exists');
    }

    const [membership] = await this.db
      .select({
        role: memberships.role,
        orgId: memberships.orgId,
        orgName: organizations.name,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.orgId, organizations.id))
      .where(eq(memberships.userId, user.id))
      .limit(1);

    if (!membership || membership.orgId !== session.orgId) {
      throw new AppError('FORBIDDEN', 'Organization membership not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      org: {
        id: membership.orgId,
        name: membership.orgName,
      },
      role: membership.role,
    };
  }
}
