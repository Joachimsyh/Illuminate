"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import {
  MAX_SKILLS,
  MIN_SKILLS,
  SKILL_CATEGORIES,
} from "@/lib/skills";
import { FadeIn, MagneticButton } from "@/components/motion";

export function OnboardingClient({
  name,
  initialSkills,
  editing = false,
}: {
  name: string;
  initialSkills: string[];
  editing?: boolean;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [selected, setSelected] = useState<string[]>(initialSkills);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeCategory, setActiveCategory] = useState(SKILL_CATEGORIES[0].id);

  const category = useMemo(
    () => SKILL_CATEGORIES.find((c) => c.id === activeCategory) || SKILL_CATEGORIES[0],
    [activeCategory]
  );

  function toggle(skill: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= MAX_SKILLS) {
        setError(`You can pick up to ${MAX_SKILLS} interests`);
        return prev;
      }
      return [...prev, skill];
    });
  }

  function submit() {
    if (selected.length < MIN_SKILLS) {
      setError(`Pick at least ${MIN_SKILLS} interests to continue`);
      return;
    }

    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save interests");
        return;
      }
      await update();
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-5 py-12">
      <FadeIn>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-lumen-400/10 px-3 py-1 text-xs text-lumen-300 ring-1 ring-lumen-300/30">
          <Sparkles className="h-3.5 w-3.5" />
          {editing ? "Update your profile" : "Welcome to Illuminate"}
        </div>
        <h1 className="mt-4 font-display text-4xl tracking-tight text-mist-100 sm:text-5xl">
          {editing ? "Edit your interests" : `What are you into, ${name}?`}
        </h1>
        <p className="mt-3 max-w-xl text-mist-300">
          Pick a few skills and interests so we can match you with the right Luma
          events — just like setting up your profile on Fiverr or LinkedIn.
        </p>
      </FadeIn>

      <FadeIn delay={0.1} className="mt-8">
        <div className="flex flex-wrap gap-2">
          {SKILL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-full px-4 py-2 text-sm transition ${
                activeCategory === cat.id
                  ? "bg-lumen-400 text-ink-950"
                  : "bg-white/5 text-mist-300 ring-1 ring-white/10 hover:bg-white/10"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </FadeIn>

      <FadeIn delay={0.15}>
        <AnimatePresence mode="wait">
          <motion.div
            key={category.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="mt-6 flex flex-wrap gap-2.5"
          >
            {category.skills.map((skill) => {
              const active = selected.includes(skill);
              return (
                <motion.button
                  key={skill}
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  onClick={() => toggle(skill)}
                  className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm transition ${
                    active
                      ? "bg-lumen-400/20 text-lumen-100 ring-1 ring-lumen-300/50"
                      : "bg-ink-900/70 text-mist-200 ring-1 ring-white/10 hover:ring-white/20"
                  }`}
                >
                  {active && <Check className="h-3.5 w-3.5" />}
                  {skill}
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </FadeIn>

      <FadeIn delay={0.2} className="mt-10">
        <div className="glass sticky bottom-6 rounded-3xl p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-mist-100">
                {selected.length} selected
                <span className="text-mist-400">
                  {" "}
                  · choose {MIN_SKILLS}–{MAX_SKILLS}
                </span>
              </p>
              {selected.length > 0 && (
                <p className="mt-1 line-clamp-2 text-xs text-mist-400">
                  {selected.join(" · ")}
                </p>
              )}
              {error && <p className="mt-1 text-xs text-rose-300">{error}</p>}
            </div>
            <MagneticButton
              onClick={submit}
              disabled={isPending || selected.length < MIN_SKILLS}
              className="rounded-2xl bg-lumen-400 px-6 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
            >
              {isPending
                ? "Saving…"
                : editing
                  ? "Save interests"
                  : "Continue to Illuminate"}
            </MagneticButton>
          </div>

          {/* Progress bar */}
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-lumen-400"
              initial={false}
              animate={{
                width: `${Math.min(100, (selected.length / MIN_SKILLS) * 100)}%`,
              }}
              transition={{ type: "spring", stiffness: 200, damping: 24 }}
            />
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
