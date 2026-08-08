"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { MagneticButton } from "@/components/motion";

type ApplyResponse = {
  success: boolean;
  status: string;
  message: string;
  demo?: boolean;
  error?: string;
  filledAnswers?: Record<string, string>;
};

export function ApplyButton({
  eventId,
  disabled,
}: {
  eventId: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApplyResponse | null>(null);

  async function handleApply() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId }),
      });
      const data = (await res.json()) as ApplyResponse;
      setResult(data);
    } catch {
      setResult({
        success: false,
        status: "failed",
        message: "Network error — try again",
      });
    } finally {
      setLoading(false);
    }
  }

  const success = result?.success;

  return (
    <div className="space-y-3">
      <MagneticButton
        onClick={handleApply}
        disabled={disabled || loading || success === true}
        className="group relative w-full overflow-hidden rounded-2xl bg-lumen-400 px-6 py-4 text-base font-semibold text-ink-950 shadow-[0_0_40px_rgba(245,166,35,0.25)] transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition duration-700 group-hover:translate-x-full" />
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Scraping form, filling from profile…
            </>
          ) : success ? (
            <>
              <CheckCircle2 className="h-5 w-5" />
              Applied
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5" />
              Apply Automatically
            </>
          )}
        </span>
      </MagneticButton>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4 }}
            className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${
              result.success
                ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20"
                : "bg-rose-500/10 text-rose-200 ring-rose-400/20"
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div>
              <p>{result.message || result.error}</p>
              {result.demo && (
                <p className="mt-1 text-xs opacity-70">
                  Demo submit — application saved locally. Connect a Luma
                  session for live registration.
                </p>
              )}
              {result.filledAnswers &&
                Object.keys(result.filledAnswers).length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs opacity-80">
                    {Object.entries(result.filledAnswers)
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <li key={k}>
                          <span className="opacity-60">{k}:</span> {v.slice(0, 120)}
                          {v.length > 120 ? "…" : ""}
                        </li>
                      ))}
                  </ul>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
