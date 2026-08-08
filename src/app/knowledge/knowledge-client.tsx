"use client";

import { useState, useTransition, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Brain, Briefcase, Calendar, MapPin, Save } from "lucide-react";
import { FadeIn, MagneticButton } from "@/components/motion";

function Divider() {
  return (
    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />
  );
}

function Block({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="py-8">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lumen-400/15 ring-1 ring-lumen-300/25">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl text-mist-100">{title}</h2>
          <p className="mt-1 text-sm text-mist-400">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function KnowledgeClient({
  initial,
}: {
  initial: {
    name: string;
    age: number | null;
    lifeStatus: string | null;
    placeOfWorkStudy: string | null;
    agentSummary: string;
    statusOptions: string[];
  };
}) {
  const [age, setAge] = useState(initial.age?.toString() ?? "");
  const [lifeStatus, setLifeStatus] = useState(initial.lifeStatus ?? "");
  const [place, setPlace] = useState(initial.placeOfWorkStudy ?? "");
  const [summary, setSummary] = useState(initial.agentSummary ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    setMessage(null);

    const trimmedAge = age.trim();
    let ageValue: number | null = null;
    if (trimmedAge) {
      const n = Number(trimmedAge);
      if (!Number.isInteger(n) || n < 13 || n > 100) {
        setError("Age must be a whole number between 13 and 100");
        return;
      }
      ageValue = n;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/knowledge", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            age: ageValue,
            lifeStatus: lifeStatus || null,
            placeOfWorkStudy: place.trim() || null,
            agentSummary: summary.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Could not save knowledge");
          return;
        }
        setAge(data.age != null ? String(data.age) : "");
        setLifeStatus(data.lifeStatus || "");
        setPlace(data.placeOfWorkStudy || "");
        setSummary(data.agentSummary || "");
        setMessage("Knowledge updated — agents will use this next.");
      } catch {
        setError("Network error — try again");
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <FadeIn>
        <p className="text-sm uppercase tracking-[0.2em] text-lumen-300/80">
          Knowledge
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight text-mist-100 sm:text-5xl">
          {initial.name}&apos;s graph
        </h1>
        <p className="mt-3 max-w-xl text-mist-300">
          Editable facts agents use for Luma registration and matching. Changes
          save to PostgreSQL and refresh your knowledge graph.
        </p>
      </FadeIn>

      <div className="glass mt-10 rounded-3xl px-6 sm:px-8">
        <Block
          icon={<Calendar className="h-5 w-5 text-lumen-300" />}
          title="Age"
          subtitle="Optional. Only set if you’re comfortable sharing it."
        >
          <input
            type="number"
            min={13}
            max={100}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            placeholder="e.g. 24"
            className="w-full max-w-xs rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
          />
        </Block>

        <Divider />

        <Block
          icon={<Briefcase className="h-5 w-5 text-lumen-300" />}
          title="Status"
          subtitle="Student, employed, founder, and similar."
        >
          <div className="flex flex-wrap gap-2">
            {initial.statusOptions.map((opt) => {
              const active = lifeStatus === opt;
              return (
                <motion.button
                  key={opt}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setLifeStatus(active ? "" : opt)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-lumen-400 text-ink-950"
                      : "bg-white/5 text-mist-200 ring-1 ring-white/15 hover:bg-white/10"
                  }`}
                >
                  {opt}
                </motion.button>
              );
            })}
          </div>
        </Block>

        <Divider />

        <Block
          icon={<MapPin className="h-5 w-5 text-lumen-300" />}
          title="Place of work / study"
          subtitle="Company, university, lab, or school."
        >
          <input
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="e.g. Imperial College London / Acme AI"
            className="w-full rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
          />
        </Block>

        <Divider />

        <Block
          icon={<Brain className="h-5 w-5 text-lumen-300" />}
          title="Agent summarization"
          subtitle="Drafted by Agent 1 in first person from your LinkedIn / CV — edit freely. Agents read this via your knowledge graph."
        >
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={6}
            placeholder="A short professional summary agents will use when filling forms and matching events…"
            className="w-full resize-y rounded-xl border border-white/10 bg-ink-900/80 px-3.5 py-3 text-sm leading-relaxed text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
          />
        </Block>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-[1.25rem] text-sm">
          {error && <p className="text-rose-300">{error}</p>}
          {message && !error && <p className="text-emerald-300">{message}</p>}
        </div>
        <MagneticButton
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-lumen-400 px-6 py-3 text-sm font-semibold text-ink-950 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isPending ? "Saving…" : "Save knowledge"}
        </MagneticButton>
      </div>
    </div>
  );
}
