"use client";

import { FormEvent, useState, Suspense } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Mail, Sparkles } from "lucide-react";
import { MagneticButton, FadeIn } from "@/components/motion";
import { PasswordInput } from "@/components/password-input";
import { LinkedInAuthButton } from "@/components/linkedin-auth-button";

type Step = "choose" | "password";

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get("error");

  function linkedInErrorMessage(code: string | null): string | null {
    if (!code) return null;
    switch (code) {
      case "OAuthAccountNotLinked":
        return "An account already exists with that email. Sign in with email/password once, or use the same LinkedIn email — linking is enabled; try again.";
      case "OAuthCreateAccount":
        return "Could not create your account from LinkedIn. Try email signup, then link LinkedIn.";
      case "AccessDenied":
        return "LinkedIn access was denied. Approve email/profile permissions and try again.";
      case "Configuration":
        return "LinkedIn is misconfigured. Check LINKEDIN_CLIENT_ID / SECRET and restart the app.";
      case "OAuthCallback":
      case "Callback":
        return "LinkedIn sign-in failed during callback. Confirm the LinkedIn app redirect URI is exactly http://localhost:3000/api/auth/callback/linkedin and that “Sign In with LinkedIn using OpenID Connect” is enabled.";
      default:
        return `LinkedIn sign-in failed (${code}). Confirm redirect URI http://localhost:3000/api/auth/callback/linkedin, then try again.`;
    }
  }

  const [step, setStep] = useState<Step>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"email" | null>(null);
  const [error, setError] = useState<string | null>(
    linkedInErrorMessage(authError)
  );

  function handleEmailContinue(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address");
      return;
    }
    setStep("password");
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading("email");
    setError(null);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    setLoading(null);

    if (result?.error) {
      setError("Incorrect email or password");
      return;
    }

    router.push(result?.url || "/dashboard");
    router.refresh();
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1920&q=80)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink-950/40 via-ink-950/75 to-ink-950" />
        <div className="absolute inset-0 bg-aurora opacity-80" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-5 py-16 lg:flex-row lg:items-center lg:gap-16">
        <div className="flex-1">
          <FadeIn>
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-lumen-400/15 ring-1 ring-lumen-300/40">
              <Sparkles className="h-7 w-7 text-lumen-300" />
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <h1 className="font-display text-5xl tracking-tight text-mist-100 sm:text-6xl lg:text-7xl">
              <span className="shimmer-text">Illuminate</span>
            </h1>
          </FadeIn>
          <FadeIn delay={0.16}>
            <p className="mt-5 max-w-md text-lg text-mist-300">
              Sign in with LinkedIn or email — we prefill Luma registrations
              from your LinkedIn profile.
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={0.2} className="mt-12 w-full max-w-md lg:mt-0">
          <motion.div className="glass rounded-3xl p-7 shadow-2xl shadow-black/40">
            <h2 className="font-display text-2xl text-mist-100">Sign in</h2>
            <p className="mt-1 text-sm text-mist-400">
              LinkedIn or email — pick one.
            </p>

            <AnimatePresence mode="wait">
              {step === "choose" ? (
                <motion.div
                  key="choose"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  className="mt-6 space-y-4"
                >
                  <LinkedInAuthButton
                    callbackUrl="/dashboard"
                    label="Continue with LinkedIn"
                  />

                  <div className="flex items-center gap-3 text-xs text-mist-400">
                    <span className="h-px flex-1 bg-white/10" />
                    or email
                    <span className="h-px flex-1 bg-white/10" />
                  </div>

                  <form onSubmit={handleEmailContinue} className="space-y-3">
                    <label className="block text-xs text-mist-400">
                      Email
                      <div className="relative mt-1.5">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-400" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@company.com"
                          className="w-full rounded-xl border border-white/10 bg-ink-900/80 py-2.5 pl-10 pr-3.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                          required
                        />
                      </div>
                    </label>
                    <MagneticButton
                      type="submit"
                      className="w-full rounded-xl bg-lumen-400 px-4 py-3.5 text-sm font-semibold text-ink-950"
                    >
                      Continue with email
                    </MagneticButton>
                  </form>
                </motion.div>
              ) : (
                <motion.form
                  key="password"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  onSubmit={handlePasswordSubmit}
                  className="mt-6 space-y-3"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setStep("choose");
                      setPassword("");
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-mist-400 hover:text-mist-100"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>

                  <p className="text-sm text-mist-200">
                    Enter password for{" "}
                    <span className="text-lumen-300">{email}</span>
                  </p>

                  <label className="block text-xs text-mist-400">
                    Password
                    <PasswordInput
                      value={password}
                      onChange={setPassword}
                      autoFocus
                      required
                    />
                  </label>

                  <MagneticButton
                    type="submit"
                    disabled={loading !== null}
                    className="w-full rounded-xl bg-lumen-400 px-4 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
                  >
                    {loading === "email" ? "Signing in…" : "Sign in"}
                  </MagneticButton>
                </motion.form>
              )}
            </AnimatePresence>

            {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

            <p className="mt-6 text-center text-sm text-mist-400">
              New here?{" "}
              <Link
                href="/signup"
                className="text-lumen-300 underline-offset-4 hover:underline"
              >
                Create an account
              </Link>
            </p>
          </motion.div>
        </FadeIn>
      </div>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-mist-300">
          Loading…
        </div>
      }
    >
      <LoginFormInner />
    </Suspense>
  );
}
