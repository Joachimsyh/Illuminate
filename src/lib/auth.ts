import type { NextAuthOptions, Profile } from "next-auth";
import { getServerSession } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PostgresAdapter } from "@/lib/auth-adapter";
import { verifyPassword } from "@/lib/password";
import {
  createLoginSession,
  createSessionRow,
  findUserByEmail,
  findUserById,
  updateUser,
  upsertOAuthToken,
} from "@/lib/repos";
import { saveLinkedInOidcSnapshot } from "@/lib/profile-knowledge";

const hasLinkedIn =
  Boolean(process.env.LINKEDIN_CLIENT_ID) &&
  Boolean(process.env.LINKEDIN_CLIENT_SECRET);

// Node on this machine often fails leaf cert verification; LinkedIn OIDC needs HTTPS.
if (
  (process.env.SSL_NO_VERIFY === "1" ||
    process.env.NODE_ENV !== "production") &&
  process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0"
) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

type LinkedInOidcProfile = Profile & {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
};

/**
 * Custom LinkedIn OIDC provider.
 * next-auth v4's built-in LinkedIn provider still merges legacy /v2/me
 * userinfo settings; new LinkedIn apps only support OpenID Connect.
 */
function LinkedInOidcProvider(): OAuthConfig<LinkedInOidcProfile> {
  return {
    id: "linkedin",
    name: "LinkedIn",
    type: "oauth",
    clientId: process.env.LINKEDIN_CLIENT_ID!,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    issuer: "https://www.linkedin.com/oauth",
    wellKnown:
      "https://www.linkedin.com/oauth/.well-known/openid-configuration",
    authorization: {
      params: { scope: "openid profile email" },
    },
    idToken: true,
    checks: ["state"],
    client: {
      token_endpoint_auth_method: "client_secret_post",
    },
    httpOptions: { timeout: 20000 },
    // Link LinkedIn to an existing email/password account with the same email.
    allowDangerousEmailAccountLinking: true,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name ?? null,
        email: profile.email ?? null,
        image: profile.picture ?? null,
        linkedinId: profile.sub,
      };
    },
  };
}

async function recordLoginSession(
  userId: string,
  provider: string,
  meta?: { userAgent?: string | null; ip?: string | null }
) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await createLoginSession({
    userId,
    provider,
    userAgent: meta?.userAgent?.slice(0, 500) || null,
    ip: meta?.ip?.slice(0, 100) || null,
    expiresAt,
  });

  await createSessionRow({
    sessionToken: `sess_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    userId,
    expires: expiresAt,
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PostgresAdapter(),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  debug: process.env.NODE_ENV === "development",
  providers: [
    ...(hasLinkedIn ? [LinkedInOidcProvider()] : []),
    CredentialsProvider({
      id: "credentials",
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password || "";
        if (!email || !password) return null;

        const user = await findUserByEmail(email);
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Only record after we have a real DB user id (credentials).
      // LinkedIn OAuth profiles use LinkedIn `sub` here — before the adapter
      // creates/links the user — so recording is deferred to the jwt callback.
      if (account?.provider === "credentials" && user.id) {
        try {
          await recordLoginSession(user.id, "credentials");
        } catch (err) {
          console.error("[auth] failed to store login session", err);
        }
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        // Adapter returns DB ids; OAuth profile may briefly expose LinkedIn `sub`.
        let userId = user.id;
        if (userId) {
          const existing = await findUserById(userId);
          if (!existing && user.email) {
            const byEmail = await findUserByEmail(
              user.email.trim().toLowerCase()
            );
            if (byEmail) userId = byEmail.id;
          }
        }
        token.userId = userId;
      }

      if (account?.access_token && token.userId) {
        try {
          await upsertOAuthToken({
            userId: token.userId as string,
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            provider: account.provider,
          });

          if (account.provider === "linkedin" && account.providerAccountId) {
            const dbUser = await findUserById(token.userId as string);
            await updateUser(token.userId as string, {
              linkedinId: account.providerAccountId,
              // Prefill Luma registration identity from LinkedIn OIDC
              registrationName:
                dbUser?.registrationName || user?.name || dbUser?.name || null,
              registrationEmail:
                dbUser?.registrationEmail ||
                user?.email ||
                dbUser?.email ||
                null,
              name: dbUser?.name || user?.name || null,
              email: dbUser?.email || user?.email || null,
              image: dbUser?.image || user?.image || null,
            });
            await saveLinkedInOidcSnapshot(token.userId as string, {
              sub: account.providerAccountId,
              name: user?.name || dbUser?.name || null,
              email: user?.email || dbUser?.email || null,
              picture: user?.image || dbUser?.image || null,
            });
            try {
              await recordLoginSession(token.userId as string, "linkedin");
            } catch (err) {
              console.error("[auth] failed to store linkedin login session", err);
            }
          }
        } catch (err) {
          // Never fail the whole sign-in because of profile/token side effects.
          console.error("[auth] linkedin post-login enrichment failed", err);
        }
      }

      if (token.userId) {
        const dbUser = await findUserById(token.userId as string);
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;

        if (trigger === "update" && dbUser) {
          token.onboardingCompleted = dbUser.onboardingCompleted;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;

        const dbUser = await findUserById(token.userId as string);

        if (dbUser) {
          session.user.headline = dbUser.headline;
          session.user.company = dbUser.company;
          session.user.location = dbUser.location;
          session.user.bio = dbUser.bio;
          session.user.skills = dbUser.skills
            ? dbUser.skills.split("|").filter(Boolean)
            : [];
          session.user.onboardingCompleted = dbUser.onboardingCompleted;
          session.user.agentEnabled = dbUser.agentEnabled;
          session.user.agentKeywords = dbUser.agentKeywords;
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        if (url === "/login" || url.startsWith("/login?")) {
          return `${baseUrl}/dashboard`;
        }
        return `${baseUrl}${url}`;
      }
      try {
        const parsed = new URL(url);
        if (parsed.origin === baseUrl) return url;
      } catch {
        /* ignore */
      }
      return `${baseUrl}/dashboard`;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function getSession() {
  return getServerSession(authOptions);
}

export function isLinkedInEnabled() {
  return hasLinkedIn;
}
