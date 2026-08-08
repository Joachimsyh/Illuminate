"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Calendar,
  Check,
  ExternalLink,
  FileText,
  Linkedin,
  MapPin,
  Sparkles,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  FLOATING_CATEGORIES,
  MAX_WRITING_SAMPLES,
  MIN_CHIP_PICKS,
  MIN_WRITING_SAMPLES,
  type FloatingCategoryId,
} from "@/lib/profile-options";
import { CV_ACCEPT } from "@/lib/cv-constants";
import { FadeIn, MagneticButton } from "@/components/motion";
import { formatDateTime } from "@/lib/format-date";

type IcsPreview = {
  uid: string;
  title: string;
  start: string | null;
  location: string | null;
};

type Props = {
  initial: {
    name: string;
    email: string;
    registrationName: string;
    registrationEmail: string;
    locations: string[];
    skills: string[];
    interests: string[];
    rawSource: string;
    writingSamples: string[];
    onboardingStep: number;
    hasLumaConnection: boolean;
    icsPreview: IcsPreview[];
  };
};

const STEPS = [
  { id: 1, label: "LinkedIn", icon: Linkedin },
  { id: 2, label: "Identity", icon: UserRound },
  { id: 3, label: "Luma calendar", icon: Calendar },
  { id: 4, label: "Profile", icon: FileText },
];

function RoundedOption({
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
      className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-lumen-400 text-ink-950 shadow-[0_0_24px_rgba(245,166,35,0.25)]"
          : "bg-white/5 text-mist-200 ring-1 ring-white/15 hover:bg-white/10 hover:text-mist-100"
      }`}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {label}
    </motion.button>
  );
}

function FloatingCategoryPage({
  categoryId,
  selected,
  onToggle,
  onBack,
  onContinue,
  canContinue,
  index,
  total,
}: {
  categoryId: FloatingCategoryId;
  selected: string[];
  onToggle: (value: string) => void;
  onBack?: () => void;
  onContinue: () => void;
  canContinue: boolean;
  index: number;
  total: number;
}) {
  const category = FLOATING_CATEGORIES.find((c) => c.id === categoryId)!;

  return (
    <motion.div
      key={categoryId}
      initial={{ opacity: 0, y: 28, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 280, damping: 26 }}
      className="relative overflow-hidden rounded-[2rem] bg-ink-900/90 p-7 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-xl sm:p-9"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-lumen-400/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-44 w-44 rounded-full bg-sky-500/10 blur-3xl" />

      <div className="relative">
        <p className="text-xs uppercase tracking-[0.2em] text-lumen-300/80">
          {index + 1} / {total}
        </p>
        <h2 className="mt-2 font-display text-3xl tracking-tight text-mist-100">
          {category.title}
        </h2>
        <p className="mt-2 text-sm text-mist-400">{category.subtitle}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          {category.options.map((option) => (
            <RoundedOption
              key={option}
              label={option}
              active={selected.includes(option)}
              onClick={() => onToggle(option)}
            />
          ))}
        </div>

        <p className="mt-5 text-xs text-mist-400">
          {selected.length} selected · pick at least {MIN_CHIP_PICKS}
        </p>

        <div className="mt-8 flex gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-full px-5 py-3 text-sm text-mist-400 hover:text-mist-100"
            >
              Back
            </button>
          )}
          <MagneticButton
            onClick={onContinue}
            disabled={!canContinue}
            className="flex-1 rounded-full bg-lumen-400 px-5 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-40"
          >
            Continue
          </MagneticButton>
        </div>
      </div>
    </motion.div>
  );
}

export function OnboardingClient({ initial }: Props) {
  const router = useRouter();
  const { update } = useSession();
  const [step, setStep] = useState(
    Math.min(4, Math.max(1, initial.onboardingStep || 1))
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [registrationName, setRegistrationName] = useState(
    initial.registrationName
  );
  const [registrationEmail, setRegistrationEmail] = useState(
    initial.registrationEmail
  );

  const [icsUrl, setIcsUrl] = useState("");
  const [icsPreview, setIcsPreview] = useState<IcsPreview[]>(
    initial.icsPreview || []
  );
  const [icsConnected, setIcsConnected] = useState(initial.hasLumaConnection);

  // Floating category sub-pages inside step 4
  const [floatPage, setFloatPage] = useState<0 | 1 | 2 | 3>(0);
  const [locations, setLocations] = useState(initial.locations);
  const [interests, setInterests] = useState(initial.interests);
  const [skills, setSkills] = useState(initial.skills);
  const [rawSource, setRawSource] = useState(initial.rawSource);
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [writingSamples, setWritingSamples] = useState<string[]>(
    initial.writingSamples.length ? initial.writingSamples : ["", "", ""]
  );

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

  const progress = useMemo(() => (step / 4) * 100, [step]);

  function toggle(
    list: string[],
    setList: (v: string[]) => void,
    value: string
  ) {
    setList(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
    );
  }

  function saveIdentity() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 2,
          registrationName,
          registrationEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save identity");
        return;
      }
      setStep(3);
    });
  }

  function validateIcs(urlOverride?: string) {
    const url = (urlOverride ?? icsUrl).trim();
    setError(null);
    if (!url) {
      setError("Paste your Luma ICS link first");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/onboarding/ics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ icsUrl: url }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Invalid calendar link");
          setIcsConnected(false);
          setIcsPreview([]);
          return;
        }
        setIcsPreview(data.events || []);
        setIcsConnected(true);
        setError(null);
      } catch {
        setError("Network error while validating calendar link");
        setIcsConnected(false);
      }
    });
  }

  function saveProfile() {
    setError(null);
    if (!locations.length || !interests.length || !skills.length) {
      setError("Select location, interests, and skills first");
      setFloatPage(0);
      return;
    }

    startTransition(async () => {
      const samples = writingSamples.map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: 4,
          locations,
          interests,
          skills,
          rawSource,
          writingSamples: samples,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save profile");
        return;
      }
      await update();
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto min-h-screen max-w-3xl px-5 py-10">
      <FadeIn>
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-lumen-400/10 px-3 py-1 text-xs text-lumen-300 ring-1 ring-lumen-300/30">
          <Sparkles className="h-3.5 w-3.5" />
          Onboarding
        </div>
        <h1 className="mt-3 font-display text-4xl tracking-tight text-mist-100">
          Set up Illuminate
        </h1>
        <p className="mt-2 text-mist-400">
          Choose your cities, interests, and skills — then connect Luma.
        </p>
      </FadeIn>

      <div className="mt-8">
        <div className="flex justify-between gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step === s.id;
            const done = step > s.id;
            return (
              <div key={s.id} className="flex-1 text-center">
                <div
                  className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ring-1 ${
                    active || done
                      ? "bg-lumen-400/20 text-lumen-200 ring-lumen-300/40"
                      : "bg-white/5 text-mist-400 ring-white/10"
                  }`}
                >
                  {done ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>
                <p
                  className={`mt-2 text-[11px] ${
                    active ? "text-mist-100" : "text-mist-400"
                  }`}
                >
                  {s.label}
                </p>
              </div>
            );
          })}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/5">
          <motion.div
            className="h-full rounded-full bg-lumen-400"
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
          />
        </div>

        {(step > 1 || (step === 4 && floatPage > 0)) && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (step === 4 && floatPage > 0) {
                setFloatPage((p) => (p - 1) as 0 | 1 | 2 | 3);
                return;
              }
              if (step > 1) {
                if (step === 4) setFloatPage(0);
                setStep((s) => s - 1);
              }
            }}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-mist-400 transition hover:text-mist-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}
      </div>

      <div className="mt-8">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass rounded-[2rem] p-7 sm:p-9"
            >
              <h2 className="font-display text-2xl text-mist-100">
                Signed in
              </h2>
              <p className="mt-2 text-sm text-mist-400">
                Name and email from your account — editable next for Luma
                registrations.
              </p>
              <div className="mt-6 rounded-2xl bg-white/[0.03] px-4 py-4 ring-1 ring-white/10">
                <p className="text-sm text-mist-100">
                  {initial.name || "Your name"}
                </p>
                <p className="mt-1 text-sm text-mist-400">
                  {initial.email || "email@example.com"}
                </p>
              </div>
              <MagneticButton
                onClick={() => setStep(2)}
                className="mt-6 w-full rounded-full bg-lumen-400 px-5 py-3.5 text-sm font-semibold text-ink-950"
              >
                Continue
              </MagneticButton>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass space-y-4 rounded-[2rem] p-7 sm:p-9"
            >
              <h2 className="font-display text-2xl text-mist-100">
                Confirm registration identity
              </h2>
              <p className="text-sm text-mist-400">
                We&apos;ll use this to register you for events. It goes to event
                hosts exactly as typed.
              </p>
              <label className="block text-xs text-mist-400">
                Full name
                <input
                  value={registrationName}
                  onChange={(e) => setRegistrationName(e.target.value)}
                  className="mt-1.5 w-full rounded-full border border-white/10 bg-ink-900/80 px-4 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                />
              </label>
              <label className="block text-xs text-mist-400">
                Email
                <input
                  type="email"
                  value={registrationEmail}
                  onChange={(e) => setRegistrationEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-full border border-white/10 bg-ink-900/80 px-4 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-full px-4 py-3 text-sm text-mist-400 hover:text-mist-100"
                >
                  Back
                </button>
                <MagneticButton
                  onClick={saveIdentity}
                  disabled={isPending}
                  className="flex-1 rounded-full bg-lumen-400 px-5 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
                >
                  {isPending ? "Saving…" : "Continue"}
                </MagneticButton>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass space-y-4 rounded-[2rem] p-7 sm:p-9"
            >
              <h2 className="font-display text-2xl text-mist-100">
                Connect Luma calendar
              </h2>
              <p className="text-sm text-mist-400">
                This link lets us read your Luma calendar. Keep it private — you
                can reset it in Luma at any time.
              </p>

              <a
                href="https://lu.ma/signin?next=/settings"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-3 text-sm text-lumen-300 ring-1 ring-white/10 hover:bg-white/10"
              >
                Get my Luma sync link
                <ExternalLink className="h-3.5 w-3.5" />
              </a>

              <div className="rounded-2xl bg-ink-900/50 p-4 text-xs leading-relaxed text-mist-400 ring-1 ring-white/10">
                <p className="font-medium text-mist-200">How to find it</p>
                <ol className="mt-2 list-decimal space-y-1 pl-4">
                  <li>Open Luma Settings → Calendar sync</li>
                  <li>Copy your personal ICS feed URL</li>
                  <li>Paste it below — we validate it immediately</li>
                </ol>
              </div>

              <label className="block text-xs text-mist-400">
                Paste ICS URL
                <input
                  value={icsUrl}
                  onChange={(e) => {
                    setIcsUrl(e.target.value);
                    setIcsConnected(false);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData("text");
                    if (pasted.trim()) {
                      // Let the value update, then validate the pasted URL
                      setTimeout(() => {
                        setIcsUrl(pasted.trim());
                        validateIcs(pasted.trim());
                      }, 0);
                    }
                  }}
                  placeholder="https://api.luma.com/ics/get?entity=user&id=icssk-…"
                  className="mt-1.5 w-full rounded-full border border-white/10 bg-ink-900/80 px-4 py-2.5 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                />
              </label>

              <MagneticButton
                onClick={() => validateIcs()}
                disabled={isPending || !icsUrl.trim()}
                className="w-full rounded-full bg-white/10 px-5 py-3 text-sm font-medium text-mist-100 ring-1 ring-white/10 disabled:opacity-60"
              >
                {isPending ? "Checking…" : "Validate calendar link"}
              </MagneticButton>

              {!icsConnected && (
                <p className="text-xs text-mist-400">
                  Click <span className="text-mist-200">Validate calendar link</span>{" "}
                  before continuing — pasting alone is not enough.
                </p>
              )}

              {icsConnected && (
                <div className="rounded-2xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/20">
                  <p className="text-sm text-emerald-200">
                    Connected — {icsPreview.length} event
                    {icsPreview.length === 1 ? "" : "s"} found
                  </p>
                  <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-xs text-mist-300">
                    {icsPreview.slice(0, 8).map((ev) => (
                      <li key={ev.uid}>
                        <span className="text-mist-100">{ev.title}</span>
                        {ev.start && (
                          <span className="text-mist-400">
                            {" "}
                            · {formatDateTime(ev.start)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-full px-4 py-3 text-sm text-mist-400 hover:text-mist-100"
                >
                  Back
                </button>
                <MagneticButton
                  onClick={() => {
                    if (!icsConnected) {
                      setError("Validate a working Luma ICS link first");
                      return;
                    }
                    setError(null);
                    setFloatPage(0);
                    setStep(4);
                  }}
                  className="flex-1 rounded-full bg-lumen-400 px-5 py-3.5 text-sm font-semibold text-ink-950"
                >
                  Continue to preferences
                </MagneticButton>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative min-h-[420px]"
            >
              <AnimatePresence mode="wait">
                {floatPage === 0 && (
                  <FloatingCategoryPage
                    categoryId="location"
                    selected={locations}
                    onToggle={(v) => toggle(locations, setLocations, v)}
                    onContinue={() => {
                      if (locations.length < MIN_CHIP_PICKS) {
                        setError("Pick at least one city");
                        return;
                      }
                      setError(null);
                      setFloatPage(1);
                    }}
                    canContinue={locations.length >= MIN_CHIP_PICKS}
                    index={0}
                    total={3}
                  />
                )}

                {floatPage === 1 && (
                  <FloatingCategoryPage
                    categoryId="interests"
                    selected={interests}
                    onToggle={(v) => toggle(interests, setInterests, v)}
                    onBack={() => setFloatPage(0)}
                    onContinue={() => {
                      if (interests.length < MIN_CHIP_PICKS) {
                        setError("Pick at least one interest");
                        return;
                      }
                      setError(null);
                      setFloatPage(2);
                    }}
                    canContinue={interests.length >= MIN_CHIP_PICKS}
                    index={1}
                    total={3}
                  />
                )}

                {floatPage === 2 && (
                  <FloatingCategoryPage
                    categoryId="skills"
                    selected={skills}
                    onToggle={(v) => toggle(skills, setSkills, v)}
                    onBack={() => setFloatPage(1)}
                    onContinue={() => {
                      if (skills.length < MIN_CHIP_PICKS) {
                        setError("Pick at least one skill");
                        return;
                      }
                      setError(null);
                      setFloatPage(3);
                    }}
                    canContinue={skills.length >= MIN_CHIP_PICKS}
                    index={2}
                    total={3}
                  />
                )}

                {floatPage === 3 && (
                  <motion.div
                    key="extras"
                    initial={{ opacity: 0, y: 28, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 280, damping: 26 }}
                    className="relative space-y-6 overflow-hidden rounded-[2rem] bg-ink-900/90 p-7 shadow-2xl shadow-black/50 ring-1 ring-white/10 backdrop-blur-xl sm:p-9"
                  >
                    <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-lumen-400/15 blur-3xl" />

                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-lumen-300/80">
                        Almost done
                      </p>
                      <h2 className="mt-2 font-display text-3xl text-mist-100">
                        Your picks
                      </h2>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {locations.map((x) => (
                        <span
                          key={x}
                          className="inline-flex items-center gap-1 rounded-full bg-lumen-400/15 px-3 py-1.5 text-xs text-lumen-200"
                        >
                          <MapPin className="h-3 w-3" />
                          {x}
                        </span>
                      ))}
                      {interests.map((x) => (
                        <span
                          key={x}
                          className="rounded-full bg-sky-400/15 px-3 py-1.5 text-xs text-sky-200"
                        >
                          {x}
                        </span>
                      ))}
                      {skills.map((x) => (
                        <span
                          key={x}
                          className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-mist-200"
                        >
                          {x}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm text-mist-100">
                        CV / LinkedIn profile{" "}
                        <span className="text-xs text-mist-400">
                          (optional · upload or paste)
                        </span>
                      </p>

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
                        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-ink-950/50 px-4 py-7 text-center transition hover:border-lumen-400/40 hover:bg-ink-950/80"
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
                          {cvUploading
                            ? "Reading your CV…"
                            : "Drop a file here or click to upload"}
                        </span>
                        <span className="max-w-sm text-xs text-mist-400">
                          PDF, DOCX, DOC, ODT, TXT, MD, RTF, HTML, CSV, JSON —
                          and other text-based files (max 12 MB)
                        </span>
                      </label>

                      {cvFileName && (
                        <div className="flex items-center justify-between gap-2 rounded-full bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 ring-1 ring-emerald-400/20">
                          <span className="truncate">
                            Loaded from {cvFileName}
                            {rawSource
                              ? ` · ${rawSource.length.toLocaleString()} chars`
                              : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCvFileName(null);
                              setRawSource("");
                            }}
                            className="rounded-full p-1 hover:bg-white/10"
                            aria-label="Clear uploaded CV"
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
                        rows={5}
                        placeholder="Optional — paste your CV / LinkedIn About + Experience…"
                        className="w-full rounded-2xl border border-white/10 bg-ink-950/80 px-3.5 py-3 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                      />
                    </div>

                    <div>
                      <p className="text-sm text-mist-100">
                        LinkedIn posts for voice{" "}
                        <span className="text-xs text-mist-400">
                          (optional · {MIN_WRITING_SAMPLES}+ recommended)
                        </span>
                      </p>
                      <div className="mt-3 space-y-3">
                        {writingSamples.map((sample, index) => (
                          <textarea
                            key={index}
                            value={sample}
                            onChange={(e) => {
                              const next = [...writingSamples];
                              next[index] = e.target.value;
                              setWritingSamples(next);
                            }}
                            rows={2}
                            placeholder={`LinkedIn post ${index + 1}`}
                            className="w-full rounded-2xl border border-white/10 bg-ink-950/80 px-3.5 py-3 text-sm text-mist-100 outline-none focus:ring-2 focus:ring-lumen-400/40"
                          />
                        ))}
                      </div>
                      {writingSamples.length < MAX_WRITING_SAMPLES && (
                        <button
                          type="button"
                          onClick={() =>
                            setWritingSamples([...writingSamples, ""])
                          }
                          className="mt-2 text-xs text-lumen-300 hover:underline"
                        >
                          + Add another post
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setFloatPage(2)}
                        className="rounded-full px-4 py-3 text-sm text-mist-400 hover:text-mist-100"
                      >
                        Back
                      </button>
                      <MagneticButton
                        onClick={saveProfile}
                        disabled={isPending}
                        className="flex-1 rounded-full bg-lumen-400 px-5 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
                      >
                        {isPending ? "Building profile…" : "Finish setup"}
                      </MagneticButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      </div>
    </div>
  );
}
