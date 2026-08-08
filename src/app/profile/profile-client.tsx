"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Upload, X } from "lucide-react";
import { motion } from "framer-motion";
import {
  EVENT_INTERESTS,
  EVENT_LOCATIONS,
  PROFILE_SKILLS,
} from "@/lib/profile-options";
import { CV_ACCEPT } from "@/lib/cv-constants";
import { FadeIn, MagneticButton } from "@/components/motion";

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-lumen-400 text-ink-950"
          : "bg-white/5 text-mist-200 ring-1 ring-white/15 hover:bg-white/10"
      }`}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {label}
    </motion.button>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="py-8">
      <h2 className="font-display text-2xl text-mist-100">{title}</h2>
      <p className="mt-1 text-sm text-mist-400">{subtitle}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Divider() {
  return <div className="h-px w-full bg-gradient-to-r from-transparent via-white/15 to-transparent" />;
}

export function ProfileClient({
  initial,
}: {
  initial: {
    name: string;
    email: string;
    image: string | null;
    locations: string[];
    interests: string[];
    skills: string[];
    rawSource: string;
  };
}) {
  const [locations, setLocations] = useState(initial.locations);
  const [interests, setInterests] = useState(initial.interests);
  const [skills, setSkills] = useState(initial.skills);
  const [rawSource, setRawSource] = useState(initial.rawSource);
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggle(
    list: string[],
    setList: (v: string[]) => void,
    value: string
  ) {
    setList(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
    );
  }

  async function uploadCvFile(file: File) {
    setError(null);
    setCvUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/onboarding/cv", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not read that file");
        return;
      }
      setRawSource(data.text || "");
      setCvFileName(data.filename || file.name);
    } catch {
      setError("Upload failed — try again or paste the text");
    } finally {
      setCvUploading(false);
    }
  }

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locations,
          interests,
          skills,
          rawSource,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save profile");
        return;
      }
      setMessage("Profile saved");
      setCvFileName(null);
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <FadeIn>
        <div className="flex items-center gap-4">
          {initial.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={initial.image}
              alt=""
              className="h-16 w-16 rounded-full ring-2 ring-lumen-400/30"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-lumen-400/20 text-xl font-semibold text-lumen-200 ring-2 ring-lumen-400/30">
              {(initial.name || initial.email || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-lumen-300/80">
              Profile
            </p>
            <h1 className="font-display text-4xl tracking-tight text-mist-100">
              {initial.name || "Your profile"}
            </h1>
            <p className="mt-1 text-sm text-mist-400">{initial.email}</p>
          </div>
        </div>
        <p className="mt-4 text-mist-300">
          Update locations, interests, skills, and CV anytime — no need to redo
          onboarding.
        </p>
      </FadeIn>

      <div className="mt-6 rounded-[2rem] bg-ink-900/80 px-6 ring-1 ring-white/10 sm:px-9">
        <Section
          title="Locations"
          subtitle="Cities we should prioritize for Luma events."
        >
          <div className="flex flex-wrap gap-2">
            {EVENT_LOCATIONS.map((loc) => (
              <Chip
                key={loc}
                label={loc}
                active={locations.includes(loc)}
                onClick={() => toggle(locations, setLocations, loc)}
              />
            ))}
          </div>
        </Section>

        <Divider />

        <Section
          title="Interests"
          subtitle="Topics for the events we match you to."
        >
          <div className="flex flex-wrap gap-2">
            {EVENT_INTERESTS.map((topic) => (
              <Chip
                key={topic}
                label={topic}
                active={interests.includes(topic)}
                onClick={() => toggle(interests, setInterests, topic)}
              />
            ))}
          </div>
        </Section>

        <Divider />

        <Section
          title="Skills"
          subtitle="Roles that best describe you."
        >
          <div className="flex flex-wrap gap-2">
            {PROFILE_SKILLS.map((skill) => (
              <Chip
                key={skill}
                label={skill}
                active={skills.includes(skill)}
                onClick={() => toggle(skills, setSkills, skill)}
              />
            ))}
          </div>
        </Section>

        <Divider />

        <Section
          title="CV / LinkedIn profile"
          subtitle="Optional — upload a file or paste text. Used to enrich matching."
        >
          <label
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const file = e.dataTransfer.files?.[0];
              if (file) void uploadCvFile(file);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-ink-950/50 px-4 py-7 text-center transition hover:border-lumen-400/40"
          >
            <input
              type="file"
              accept={CV_ACCEPT}
              className="hidden"
              disabled={cvUploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadCvFile(file);
                e.target.value = "";
              }}
            />
            <Upload className="h-5 w-5 text-lumen-300" />
            <span className="text-sm text-mist-200">
              {cvUploading ? "Reading your CV…" : "Drop a file or click to upload"}
            </span>
            <span className="text-xs text-mist-400">
              PDF, DOCX, TXT, and other text-based files
            </span>
          </label>

          {cvFileName && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 ring-1 ring-emerald-400/20">
              <span className="truncate">Loaded from {cvFileName}</span>
              <button
                type="button"
                onClick={() => {
                  setCvFileName(null);
                  setRawSource("");
                }}
                className="rounded-full p-1 hover:bg-white/10"
                aria-label="Clear CV"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <textarea
            value={rawSource}
            onChange={(e) => {
              setRawSource(e.target.value);
              if (cvFileName) setCvFileName(null);
            }}
            rows={7}
            placeholder="Optional — paste your CV / LinkedIn About + Experience…"
            className="mt-3 w-full rounded-2xl border border-white/10 bg-ink-950/80 px-3.5 py-3 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
          />
        </Section>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <MagneticButton
          onClick={save}
          disabled={isPending}
          className="rounded-full bg-lumen-400 px-6 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save profile"}
        </MagneticButton>
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-rose-300">{error}</p>}
      </div>
    </div>
  );
}
