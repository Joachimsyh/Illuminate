import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Let the page itself decide; JWT may not have onboarding flag.
    // Soft gate: send first-time users toward onboarding from protected areas
    // unless they're already there.
    if (
      path !== "/onboarding" &&
      token?.onboardingCompleted === false
    ) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => Boolean(token),
    },
  }
);

export const config = {
  matcher: ["/dashboard/:path*", "/events/:path*", "/onboarding", "/profile"],
};
