import type {
  Adapter,
  AdapterAccount,
  AdapterSession,
  AdapterUser,
  VerificationToken,
} from "next-auth/adapters";
import { execute, newId, queryOne } from "@/lib/db";
import { USER_SELECT, type UserRow } from "@/lib/db-types";

function toAdapterUser(row: UserRow): AdapterUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email || "",
    emailVerified: row.emailVerified,
    image: row.image,
  };
}

export function PostgresAdapter(): Adapter {
  return {
    async createUser(user: Omit<AdapterUser, "id">) {
      const id = newId();
      const row = await queryOne<UserRow>(
        `INSERT INTO users (id, name, email, email_verified, image)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${USER_SELECT}`,
        [
          id,
          user.name ?? null,
          user.email ?? null,
          user.emailVerified ?? null,
          user.image ?? null,
        ]
      );
      return toAdapterUser(row!);
    },

    async getUser(id) {
      const row = await queryOne<UserRow>(
        `SELECT ${USER_SELECT} FROM users WHERE id = $1`,
        [id]
      );
      return row ? toAdapterUser(row) : null;
    },

    async getUserByEmail(email) {
      const row = await queryOne<UserRow>(
        `SELECT ${USER_SELECT} FROM users WHERE email = $1`,
        [email]
      );
      return row ? toAdapterUser(row) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const row = await queryOne<UserRow>(
        `SELECT ${USER_SELECT}
         FROM users u
         JOIN accounts a ON a.user_id = u.id
         WHERE a.provider = $1 AND a.provider_account_id = $2`,
        [provider, providerAccountId]
      );
      return row ? toAdapterUser(row) : null;
    },

    async updateUser(user) {
      const row = await queryOne<UserRow>(
        `UPDATE users SET
           name = COALESCE($2, name),
           email = COALESCE($3, email),
           email_verified = COALESCE($4, email_verified),
           image = COALESCE($5, image),
           updated_at = NOW()
         WHERE id = $1
         RETURNING ${USER_SELECT}`,
        [
          user.id,
          user.name ?? null,
          user.email ?? null,
          user.emailVerified ?? null,
          user.image ?? null,
        ]
      );
      return toAdapterUser(row!);
    },

    async linkAccount(account: AdapterAccount) {
      await execute(
        `INSERT INTO accounts (
           id, user_id, type, provider, provider_account_id,
           refresh_token, access_token, expires_at, token_type, scope, id_token, session_state
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (provider, provider_account_id) DO NOTHING`,
        [
          newId(),
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          account.refresh_token ?? null,
          account.access_token ?? null,
          account.expires_at ?? null,
          account.token_type ?? null,
          account.scope ?? null,
          account.id_token ?? null,
          account.session_state ?? null,
        ]
      );
      return account as AdapterAccount;
    },

    async createSession({ sessionToken, userId, expires }) {
      const row = await queryOne<{
        sessionToken: string;
        userId: string;
        expires: Date;
      }>(
        `INSERT INTO sessions (id, session_token, user_id, expires)
         VALUES ($1, $2, $3, $4)
         RETURNING session_token AS "sessionToken", user_id AS "userId", expires`,
        [newId(), sessionToken, userId, expires]
      );
      return row as AdapterSession;
    },

    async getSessionAndUser(sessionToken) {
      const session = await queryOne<{
        sessionToken: string;
        userId: string;
        expires: Date;
      }>(
        `SELECT session_token AS "sessionToken", user_id AS "userId", expires
         FROM sessions WHERE session_token = $1`,
        [sessionToken]
      );
      if (!session) return null;
      const user = await queryOne<UserRow>(
        `SELECT ${USER_SELECT} FROM users WHERE id = $1`,
        [session.userId]
      );
      if (!user) return null;
      return {
        session: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        },
        user: toAdapterUser(user),
      };
    },

    async updateSession(session) {
      const row = await queryOne<AdapterSession>(
        `UPDATE sessions SET
           expires = COALESCE($2, expires)
         WHERE session_token = $1
         RETURNING session_token AS "sessionToken", user_id AS "userId", expires`,
        [session.sessionToken, session.expires ?? null]
      );
      return row ?? undefined;
    },

    async deleteSession(sessionToken) {
      await execute(`DELETE FROM sessions WHERE session_token = $1`, [
        sessionToken,
      ]);
    },

    async createVerificationToken(token) {
      await execute(
        `INSERT INTO verification_tokens (identifier, token, expires)
         VALUES ($1, $2, $3)
         ON CONFLICT (identifier, token) DO UPDATE SET expires = EXCLUDED.expires`,
        [token.identifier, token.token, token.expires]
      );
      return token as VerificationToken;
    },

    async useVerificationToken({ identifier, token }) {
      const row = await queryOne<VerificationToken>(
        `DELETE FROM verification_tokens
         WHERE identifier = $1 AND token = $2
         RETURNING identifier, token, expires`,
        [identifier, token]
      );
      return row;
    },
  };
}
