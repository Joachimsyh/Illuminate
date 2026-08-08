import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import LinkedInProvider from "next-auth/providers/linkedin";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

const hasLinkedIn =
  Boolean(process.env.LINKEDIN_CLIENT_ID) &&
  Boolean(process.env.LINKEDIN_CLIENT_SECRET);

async function recordLoginSession(
  userId: string,
  provider: string,
  meta?: { userAgent?: string | null; ip?: string | null }
) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.loginSession.create({
    data: {
      userId,
      provider,
      userAgent: meta?.userAgent?.slice(0, 500) || null,
      ip: meta?.ip?.slice(0, 100) || null,
      expiresAt,
    },
  });

  // Also keep NextAuth Session row for adapter-backed session history
  await prisma.session.create({
    data: {
      sessionToken: `sess_${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      userId,
      expires: expiresAt,
    },
  });
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    ...(hasLinkedIn
      ? [
          LinkedInProvider({
            clientId: process.env.LINKEDIN_CLIENT_ID!,
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
            authorization: {
              params: {
                scope: "openid profile email",
              },
            },
            issuer: "https://www.linkedin.com/oauth",
            jwks_endpoint: "https://www.linkedin.com/oauth/openid/jwks",
            async profile(profile) {
              return {
                id: profile.sub,
                name: profile.name,
                email: profile.email,
                image: profile.picture,
                linkedinId: profile.sub,
              };
            },
          }),
        ]
      : []),
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

        const user = await prisma.user.findUnique({ where: { email } });
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
      if (!user.id) return true;
      try {
        await recordLoginSession(user.id, account?.provider || "credentials");
      } catch (err) {
        console.error("[auth] failed to store login session", err);
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        token.userId = user.id;
      }

      if (account?.access_token && token.userId) {
        await prisma.oAuthToken.upsert({
          where: { userId: token.userId as string },
          update: {
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            provider: account.provider,
          },
          create: {
            userId: token.userId as string,
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
            provider: account.provider,
          },
        });

        if (account.provider === "linkedin" && account.providerAccountId) {
          await prisma.user.update({
            where: { id: token.userId as string },
            data: { linkedinId: account.providerAccountId },
          });
        }
      }

      if (token.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { onboardingCompleted: true },
        });
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

        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: {
            headline: true,
            company: true,
            location: true,
            bio: true,
            skills: true,
            onboardingCompleted: true,
            agentEnabled: true,
            agentKeywords: true,
          },
        });

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
      // After auth, prefer dashboard; onboarding gate handles first-time users
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
