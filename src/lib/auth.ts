import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import LinkedInProvider from "next-auth/providers/linkedin";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";

const hasLinkedIn =
  Boolean(process.env.LINKEDIN_CLIENT_ID) &&
  Boolean(process.env.LINKEDIN_CLIENT_SECRET);

const demoMode = process.env.DEMO_MODE === "true" || !hasLinkedIn;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
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
    ...(demoMode
      ? [
          CredentialsProvider({
            id: "demo",
            name: "Demo Login",
            credentials: {
              name: { label: "Name", type: "text" },
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              const name = credentials?.name?.trim() || "Demo Builder";
              const email =
                credentials?.email?.trim() || "demo@illuminate.dev";

              const user = await prisma.user.upsert({
                where: { email },
                update: { name },
                create: {
                  email,
                  name,
                  headline: "Full-stack engineer · Hackathon builder",
                  company: "Illuminate",
                  location: "Remote",
                  bio: "Building with Illuminate — auto-apply to Luma events.",
                  linkedinId: `demo-${email}`,
                  image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
                  onboardingCompleted: false,
                  skills: "",
                },
              });

              await prisma.oAuthToken.upsert({
                where: { userId: user.id },
                update: {
                  accessToken: `demo-token-${user.id}`,
                  provider: "demo",
                },
                create: {
                  userId: user.id,
                  accessToken: `demo-token-${user.id}`,
                  provider: "demo",
                },
              });

              return {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
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

      if (token.userId && (user || account || trigger === "update")) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { onboardingCompleted: true },
        });
        token.onboardingCompleted = dbUser?.onboardingCompleted ?? false;
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
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        /* ignore */
      }
      return `${baseUrl}/onboarding`;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function getSession() {
  return getServerSession(authOptions);
}

export function isDemoMode() {
  return demoMode;
}

export function isLinkedInEnabled() {
  return hasLinkedIn;
}
