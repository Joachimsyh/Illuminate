"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Monitor,
  Sparkles,
  XCircle,
} from "lucide-react";
import { FadeIn, MagneticButton, Stagger, StaggerItem } from "@/components/motion";
import { formatDateTime } from "@/lib/format-date";

type Application = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventUrl: string;
  eventDate: string | null;
  status: string;
  message: string | null;
  appliedAt: string;
  answers: Record<string, string> | null;
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

type ProgressLine = {
  id: string;
  phase: string;
  message: string;
  status?: string;
  at: string;
};

const statusIcon = {
  success: CheckCircle2,
  pending: Clock,
  failed: XCircle,
  already_applied: CheckCircle2,
  needs_verification: Clock,
  paid_manual: Clock,
};

function phaseTone(phase: string, status?: string) {
  if (phase === "error" || status === "failed") return "text-rose-300";
  if (status === "success" || status === "already_applied")
    return "text-emerald-300";
  if (status === "needs_verification" || status === "pending")
    return "text-amber-200";
  if (phase === "finished") return "text-lumen-200";
  return "text-mist-300";
}

export function DashboardClient({
  user,
  stats,
  applications,
  eventsHref,
}: Props) {
  const [agentEnabled, setAgentEnabled] = useState(user.agentEnabled);
  const [keywords, setKeywords] = useState(user.agentKeywords);
  const [agentMsg, setAgentMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressLine[]>([]);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [assistId, setAssistId] = useState<string | null>(null);
  const [assistMsg, setAssistMsg] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const lineId = useRef(0);

  useEffect(() => {
    if (!logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress]);

  function storeAnswersForEvent(
    eventId: string,
    answers: Record<string, string> | null
  ) {
    if (!answers || typeof window === "undefined") return;
    try {
      sessionStorage.setItem(
        `illuminate:answers:${eventId}`,
        JSON.stringify(answers)
      );
    } catch {
      /* ignore quota */
    }
  }

  async function finishVerification(app: Application) {
    setAssistId(app.id);
    setAssistMsg(null);
    storeAnswersForEvent(app.eventId, app.answers);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: app.eventId,
          answers: app.answers || undefined,
          browserAssist: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      setAssistMsg(
        data.message ||
          data.error ||
          (data.success
            ? "Registered on Luma"
            : "Browser assist finished — check the Chromium window")
      );
    } catch {
      setAssistMsg("Could not open browser assist — try the event page link");
    } finally {
      setAssistId(null);
    }
  }

  function pushProgress(line: Omit<ProgressLine, "id">) {
    lineId.current += 1;
    setProgress((prev) => [
      ...prev.slice(-40),
      { ...line, id: `p-${lineId.current}` },
    ]);
    setLiveStatus(line.message);
  }

  async function saveAgent() {
    setSaving(true);
    setAgentMsg(null);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentEnabled,
          agentKeywords: keywords,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setAgentMsg("Agent settings saved");
    } catch {
      setAgentMsg("Failed to update agent");
    } finally {
      setSaving(false);
    }
  }

  async function runAgentNow() {
    setRunning(true);
    setSaving(true);
    setAgentMsg(null);
    setProgress([]);
    setLiveStatus("Connecting…");
    lineId.current = 0;

    try {
      await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentEnabled: true,
          agentKeywords: keywords,
        }),
      });
      if (!agentEnabled) setAgentEnabled(true);

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentEnabled: true,
          agentKeywords: keywords,
          runNow: true,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Agent failed (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let summary: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(6)) as {
              type: string;
              phase?: string;
              message?: string;
              status?: string;
              at?: string;
              run?: {
                successes: number;
                failures: number;
                applicationsAttempted: number;
              };
            };

            if (data.type === "progress" || data.type === "hello") {
              pushProgress({
                phase: data.phase || "started",
                message: data.message || "…",
                status: data.status,
                at: data.at || new Date().toISOString(),
              });
            } else if (data.type === "done" && data.run) {
              summary = `Finished: ${data.run.successes} success / ${data.run.failures} other / ${data.run.applicationsAttempted} attempted`;
              setAgentMsg(summary);
            } else if (data.type === "error") {
              pushProgress({
                phase: "error",
                message: data.message || "Agent error",
                at: new Date().toISOString(),
              });
              setAgentMsg(data.message || "Agent error");
            }
          } catch {
            /* ignore bad SSE chunk */
          }
        }
      }

      if (!summary) setAgentMsg("Agent finished");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to run agent";
      pushProgress({
        phase: "error",
        message,
        at: new Date().toISOString(),
      });
      setAgentMsg(message);
    } finally {
      setRunning(false);
      setSaving(false);
      setLiveStatus(null);
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
          {
            label: "Registered",
            value: stats.success,
            accent: "text-emerald-300",
          },
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
                  const needsVerification = app.status === "needs_verification";
                  const assisting = assistId === app.id;
                  return (
                    <motion.li
                      key={app.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.05 * i }}
                      className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <a
                            href={app.eventUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-mist-100 hover:text-lumen-200"
                          >
                            {app.eventTitle}
                          </a>
                          <p className="mt-1 text-xs text-mist-400">
                            {formatDateTime(app.appliedAt)}
                            {app.message
                              ? ` · ${app.message.slice(0, 80)}`
                              : ""}
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] capitalize ${
                            needsVerification
                              ? "bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/25"
                              : "bg-white/5 text-mist-300"
                          }`}
                        >
                          <Icon className="h-3 w-3" />
                          {app.status.replace(/_/g, " ")}
                        </span>
                      </div>

                      {needsVerification && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={assisting || assistId !== null}
                            onClick={() => finishVerification(app)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-lumen-400 px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-lumen-300 disabled:opacity-60"
                          >
                            {assisting ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Opening filled Luma…
                              </>
                            ) : (
                              <>
                                <Monitor className="h-3.5 w-3.5" />
                                Finish captcha (autofilled)
                              </>
                            )}
                          </button>
                          <Link
                            href={`/events/${encodeURIComponent(app.eventId)}?assist=1`}
                            onClick={() =>
                              storeAnswersForEvent(app.eventId, app.answers)
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-mist-100 transition hover:bg-white/10"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-lumen-300" />
                            Open filled form
                          </Link>
                        </div>
                      )}
                    </motion.li>
                  );
                })}
              </ul>
            )}

            {assistMsg && (
              <p className="mt-3 text-xs text-mist-300">{assistMsg}</p>
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
              Match keywords and auto-apply to new events. Progress shows live
              while a run is active.
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
                onClick={() => saveAgent()}
                disabled={saving || running}
                className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-mist-100 ring-1 ring-white/10 disabled:opacity-60"
              >
                Save settings
              </MagneticButton>
              <MagneticButton
                onClick={() => runAgentNow()}
                disabled={saving || running}
                className="rounded-xl bg-lumen-400 px-4 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
              >
                {running ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Agent running…
                  </span>
                ) : (
                  "Run agent now"
                )}
              </MagneticButton>
            </div>

            {(running || progress.length > 0) && (
              <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-white/10">
                <div className="flex items-center justify-between gap-2 border-b border-white/5 bg-white/[0.04] px-3 py-2">
                  <p className="text-[11px] uppercase tracking-wider text-mist-400">
                    Live progress
                  </p>
                  {running && (
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-lumen-200">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lumen-300 opacity-60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-lumen-300" />
                      </span>
                      Working
                    </span>
                  )}
                </div>
                {liveStatus && running && (
                  <p className="border-b border-white/5 bg-lumen-400/5 px-3 py-2 text-xs text-lumen-100">
                    {liveStatus}
                  </p>
                )}
                <div
                  ref={logRef}
                  className="max-h-56 space-y-1.5 overflow-y-auto bg-ink-950/50 px-3 py-2"
                >
                  <AnimatePresence initial={false}>
                    {progress.map((line) => (
                      <motion.p
                        key={line.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`text-[11px] leading-snug ${phaseTone(
                          line.phase,
                          line.status
                        )}`}
                      >
                        <span className="mr-1.5 opacity-40">
                          {new Date(line.at).toLocaleTimeString()}
                        </span>
                        {line.message}
                      </motion.p>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}

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
            </div>
          </section>
        </FadeIn>
      </div>
    </div>
  );
}
