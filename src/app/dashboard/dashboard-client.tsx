"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Sparkles,
  XCircle,
} from "lucide-react";
import { FadeIn, MagneticButton, Stagger, StaggerItem } from "@/components/motion";

type Application = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventUrl: string;
  eventDate: string | null;
  status: string;
  message: string | null;
  appliedAt: string;
};

type Props = {
  user: {
    name: string;
    email: string;
    image: string | null;
    headline: string | null;
    company: string | null;
    bio: string | null;
    location: string | null;
    agentEnabled: boolean;
    agentKeywords: string;
    skills: string[];
  };
  stats: { total: number; success: number; pending: number; failed: number };
  applications: Application[];
  eventsHref: string;
};

const statusIcon = {
  success: CheckCircle2,
  pending: Clock,
  failed: XCircle,
  already_applied: CheckCircle2,
};

export function DashboardClient({ user, stats, applications, eventsHref }: Props) {
  const [agentEnabled, setAgentEnabled] = useState(user.agentEnabled);
  const [keywords, setKeywords] = useState(user.agentKeywords);
  const [agentMsg, setAgentMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveAgent(runNow = false) {
    setSaving(true);
    setAgentMsg(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentEnabled,
          agentKeywords: keywords,
          runNow,
        }),
      });
      const data = await res.json();
      if (runNow && data.run) {
        setAgentMsg(
          `Agent ran: ${data.run.successes} success / ${data.run.applicationsAttempted} attempted`
        );
      } else {
        setAgentMsg("Agent settings saved");
      }
    } catch {
      setAgentMsg("Failed to update agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <FadeIn>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-lumen-300/80">
              Dashboard
            </p>
            <h1 className="mt-2 font-display text-4xl tracking-tight text-mist-100 sm:text-5xl">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-2 max-w-lg text-mist-300">
              Your LinkedIn profile fuels auto-filled Luma registrations.
              Browse events and apply in one click.
            </p>
          </div>
          <Link href={eventsHref}>
            <MagneticButton className="inline-flex items-center gap-2 rounded-xl bg-lumen-400 px-5 py-3 text-sm font-semibold text-ink-950 shadow-[0_0_30px_rgba(245,166,35,0.2)]">
              Browse events <ArrowRight className="h-4 w-4" />
            </MagneticButton>
          </Link>
        </div>
      </FadeIn>

      <Stagger className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Applications", value: stats.total, accent: "text-mist-100" },
          { label: "Registered", value: stats.success, accent: "text-emerald-300" },
          { label: "Pending", value: stats.pending, accent: "text-amber-300" },
          { label: "Failed", value: stats.failed, accent: "text-rose-300" },
        ].map((s) => (
          <StaggerItem key={s.label}>
            <motion.div
              whileHover={{ y: -3 }}
              className="glass rounded-2xl px-5 py-4"
            >
              <p className="text-xs uppercase tracking-wider text-mist-400">
                {s.label}
              </p>
              <p className={`mt-2 font-display text-3xl ${s.accent}`}>
                {s.value}
              </p>
            </motion.div>
          </StaggerItem>
        ))}
      </Stagger>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <FadeIn delay={0.15}>
          <section className="glass rounded-3xl p-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-lumen-300" />
              <h2 className="font-display text-xl text-mist-100">
                Recent applications
              </h2>
            </div>

            {applications.length === 0 ? (
              <div className="mt-8 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-lumen-300/60" />
                <p className="mt-3 text-mist-300">No applications yet</p>
                <Link
                  href={eventsHref}
                  className="mt-2 inline-block text-sm text-lumen-300 underline-offset-4 hover:underline"
                >
                  Find an event to auto-apply
                </Link>
              </div>
            ) : (
              <ul className="mt-5 space-y-3">
                {applications.map((app, i) => {
                  const Icon =
                    statusIcon[app.status as keyof typeof statusIcon] || Clock;
                  return (
                    <motion.li
                      key={app.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5"
                    >
                      <div>
                        <Link
                          href={`/events/${app.eventId}`}
                          className="font-medium text-mist-100 hover:text-lumen-300"
                        >
                          {app.eventTitle}
                        </Link>
                        <p className="mt-0.5 text-xs text-mist-400">
                          {new Date(app.appliedAt).toLocaleString()} ·{" "}
                          {app.message}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs capitalize ${
                          app.status === "success"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : app.status === "failed"
                              ? "bg-rose-500/15 text-rose-300"
                              : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {app.status.replace("_", " ")}
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </section>
        </FadeIn>

        <FadeIn delay={0.22}>
          <section className="glass rounded-3xl p-6">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-lumen-300" />
              <h2 className="font-display text-xl text-mist-100">Agent mode</h2>
            </div>
            <p className="mt-2 text-sm text-mist-400">
              Match keywords and auto-apply to new events on a schedule.
            </p>

            <label className="mt-5 flex cursor-pointer items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5">
              <span className="text-sm text-mist-100">Enable agent</span>
              <button
                type="button"
                role="switch"
                aria-checked={agentEnabled}
                onClick={() => setAgentEnabled((v) => !v)}
                className={`relative h-6 w-11 rounded-full transition ${
                  agentEnabled ? "bg-lumen-400" : "bg-ink-600"
                }`}
              >
                <motion.span
                  layout
                  className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
                  animate={{ left: agentEnabled ? 22 : 2 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              </button>
            </label>

            <label className="mt-4 block text-xs text-mist-400">
              Keywords (comma-separated)
              <input
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
              />
            </label>

            <div className="mt-4 flex flex-col gap-2">
              <MagneticButton
                onClick={() => saveAgent(false)}
                disabled={saving}
                className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-mist-100 ring-1 ring-white/10 disabled:opacity-60"
              >
                Save settings
              </MagneticButton>
              <MagneticButton
                onClick={() => saveAgent(true)}
                disabled={saving}
                className="rounded-xl bg-lumen-400 px-4 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
              >
                {saving ? "Running…" : "Run agent now"}
              </MagneticButton>
            </div>

            {agentMsg && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-3 text-xs text-mist-300"
              >
                {agentMsg}
              </motion.p>
            )}

            <div className="mt-6 border-t border-white/5 pt-5">
              <p className="text-xs uppercase tracking-wider text-mist-400">
                Profile used for forms
              </p>
              <p className="mt-2 text-sm text-mist-100">{user.headline || "—"}</p>
              <p className="text-sm text-mist-400">
                {[user.company, user.location].filter(Boolean).join(" · ") ||
                  user.email}
              </p>
              {user.skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {user.skills.slice(0, 8).map((skill) => (
                    <span
                      key={skill}
                      className="rounded-lg bg-lumen-400/10 px-2 py-1 text-[11px] text-lumen-200 ring-1 ring-lumen-300/20"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
              <Link
                href="/onboarding"
                className="mt-3 inline-block text-xs text-lumen-300 underline-offset-4 hover:underline"
              >
                Edit interests
              </Link>
            </div>
          </section>
        </FadeIn>
      </div>
    </div>
  );
}
