"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { MagneticButton, FadeIn } from "@/components/motion";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create account");
        setLoading(false);
        return;
      }

      const signInResult = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (signInResult?.error) {
        router.push("/login");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error — try again");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-aurora" />
      <div className="absolute inset-0 bg-ink-950/80" />

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
        <FadeIn>
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-lumen-400/15 ring-1 ring-lumen-300/30">
            <Sparkles className="h-5 w-5 text-lumen-300" />
          </div>
          <h1 className="font-display text-4xl text-mist-100">Join Illuminate</h1>
          <p className="mt-2 text-sm text-mist-400">
            Create an account with email, or{" "}
            <Link href="/login" className="text-lumen-300 hover:underline">
              sign in with LinkedIn
            </Link>
            .
          </p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <motion.form
            onSubmit={handleSubmit}
            className="glass mt-8 space-y-3 rounded-3xl p-7"
          >
            <label className="block text-xs text-mist-400">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
              />
            </label>
            <label className="block text-xs text-mist-400">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
              />
            </label>
            <label className="block text-xs text-mist-400">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
              />
            </label>
            <label className="block text-xs text-mist-400">
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
              />
            </label>

            {error && <p className="text-sm text-rose-300">{error}</p>}

            <MagneticButton
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-lumen-400 px-4 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
            >
              {loading ? "Creating account…" : "Sign up"}
            </MagneticButton>

            <p className="text-center text-sm text-mist-400">
              Already have an account?{" "}
              <Link href="/login" className="text-lumen-300 hover:underline">
                Sign in
              </Link>
            </p>
          </motion.form>
        </FadeIn>
      </div>
    </div>
  );
}
