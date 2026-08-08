"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Linkedin, Sparkles, Zap, Shield, Bot } from "lucide-react";
import { MagneticButton, FadeIn } from "@/components/motion";

export default function LoginPage() {
  const [name, setName] = useState("Demo Builder");
  const [email, setEmail] = useState("demo@illuminate.dev");
  const [loading, setLoading] = useState<"linkedin" | "demo" | null>(null);

  async function handleLinkedIn() {
    setLoading("linkedin");
    await signIn("linkedin", { callbackUrl: "/onboarding" });
  }

  async function handleDemo(e: FormEvent) {
    e.preventDefault();
    setLoading("demo");
    await signIn("demo", {
      name,
      email,
      callbackUrl: "/onboarding",
      redirect: true,
    });
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
            <motion.div
              animate={{ rotate: [0, 6, -4, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-lumen-400/15 ring-1 ring-lumen-300/40"
            >
              <Sparkles className="h-7 w-7 text-lumen-300" />
            </motion.div>
          </FadeIn>

          <FadeIn delay={0.08}>
            <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-mist-100 sm:text-6xl lg:text-7xl">
              <span className="shimmer-text">Illuminate</span>
            </h1>
          </FadeIn>

          <FadeIn delay={0.16}>
            <p className="mt-5 max-w-md text-lg text-mist-300 text-balance">
              Auto-apply to Luma events from your LinkedIn profile — pick your
              interests, we handle the rest.
            </p>
          </FadeIn>

          <FadeIn delay={0.24}>
            <ul className="mt-10 space-y-3 text-sm text-mist-300">
              {[
                { icon: Zap, text: "Scrapes form fields + CSRF tokens live" },
                { icon: Shield, text: "OAuth only — never stores passwords" },
                { icon: Bot, text: "Matches events to your skills & interests" },
              ].map(({ icon: Icon, text }, i) => (
                <motion.li
                  key={text}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className="flex items-center gap-3"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                    <Icon className="h-4 w-4 text-lumen-300" />
                  </span>
                  {text}
                </motion.li>
              ))}
            </ul>
          </FadeIn>
        </div>

        <FadeIn delay={0.2} className="mt-12 w-full max-w-md lg:mt-0">
          <motion.div
            whileHover={{ y: -4 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
            className="glass rounded-3xl p-7 shadow-2xl shadow-black/40"
          >
            <h2 className="font-display text-2xl text-mist-100">Sign in</h2>
            <p className="mt-1 text-sm text-mist-400">
              Continue with LinkedIn, then choose your interests.
            </p>

            <MagneticButton
              onClick={handleLinkedIn}
              disabled={loading !== null}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A66C2] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#004182] disabled:opacity-60"
            >
              <Linkedin className="h-4 w-4" />
              {loading === "linkedin" ? "Redirecting…" : "Continue with LinkedIn"}
            </MagneticButton>

            <p className="mt-3 text-[11px] leading-relaxed text-mist-400">
              LinkedIn redirect URI must be exactly:{" "}
              <code className="break-all rounded bg-white/5 px-1 text-mist-200">
                http://localhost:3000/api/auth/callback/linkedin
              </code>
            </p>

            <div className="my-5 flex items-center gap-3 text-xs text-mist-400">
              <span className="h-px flex-1 bg-white/10" />
              or try demo
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleDemo} className="space-y-3">
              <label className="block text-xs text-mist-400">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none ring-lumen-400/40 focus:ring-2"
                />
              </label>
              <label className="block text-xs text-mist-400">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none ring-lumen-400/40 focus:ring-2"
                />
              </label>
              <MagneticButton
                type="submit"
                disabled={loading !== null}
                className="w-full rounded-xl bg-lumen-400 px-4 py-3.5 text-sm font-semibold text-ink-950 shadow-[0_0_30px_rgba(245,166,35,0.2)] disabled:opacity-60"
              >
                {loading === "demo" ? "Entering…" : "Enter with demo"}
              </MagneticButton>
            </form>
          </motion.div>
        </FadeIn>
      </div>
    </div>
  );
}
