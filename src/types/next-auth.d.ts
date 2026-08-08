import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      headline?: string | null;
      company?: string | null;
      location?: string | null;
      bio?: string | null;
      skills?: string[];
      onboardingCompleted?: boolean;
      agentEnabled?: boolean;
      agentKeywords?: string | null;
    };
  }

  interface User {
    linkedinId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    onboardingCompleted?: boolean;
  }
}
