"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  Monitor,
  Sparkles,
  XCircle,
} from "lucide-react";
import { MagneticButton } from "@/components/motion";

type ApplyResponse = {
  success: boolean;
  status: string;
  message: string;
  demo?: boolean;
  error?: string;
  filledAnswers?: Record<string, string>;
  lumaUrl?: string;
  browserAssistAvailable?: boolean;
};

export function ApplyButton({
  eventId,
  disabled,
}: {
  eventId: string;
  disabled?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [result, setResult] = useState<ApplyResponse | null>(null);

  async function apply(opts?: { browserAssist?: boolean; autoFallback?: boolean }) {
    const usingBrowser = opts?.browserAssist === true;
    if (usingBrowser) setBrowserLoading(true);
    else setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          browserAssist: usingBrowser,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApplyResponse & {
        error?: string;
      };
      const normalized: ApplyResponse = {
        success: Boolean(data.success),
        status: data.status || (res.ok ? "success" : "failed"),
        message:
          data.message ||
          data.error ||
          (res.ok ? "Submitted" : `Submit failed (HTTP ${res.status})`),
        demo: data.demo,
        error: data.error,
        filledAnswers: data.filledAnswers,
        lumaUrl: data.lumaUrl,
        browserAssistAvailable: data.browserAssistAvailable,
      };
      setResult(normalized);

      const needsBrowser =
        !usingBrowser &&
        opts?.autoFallback !== false &&
        (normalized.status === "needs_verification" ||
          (normalized.browserAssistAvailable && !normalized.success));
      if (needsBrowser) {
        setLoading(false);
        await apply({ browserAssist: true, autoFallback: false });
      }
    } catch {
      setResult({
        success: false,
        status: "failed",
        message: "Network error — try again",
      });
    } finally {
      setLoading(false);
      setBrowserLoading(false);
    }
  }

  const success = result?.success;
  const busy = loading || browserLoading;
  const showBrowser =
    result?.browserAssistAvailable ||
    result?.status === "needs_verification" ||
    result?.status === "failed";

  return (
    <div className="space-y-3">
      <MagneticButton
        onClick={() => apply()}
        disabled={disabled || busy || success === true}
        className="group relative w-full overflow-hidden rounded-2xl bg-lumen-400 px-6 py-4 text-base font-semibold text-ink-950 shadow-[0_0_40px_rgba(245,166,35,0.25)] transition disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent transition duration-700 group-hover:translate-x-full" />
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Trying Luma server submit…
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

      {(showBrowser || !result) && !success && (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => apply({ browserAssist: true })}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-mist-100 transition hover:bg-white/10 disabled:opacity-50"
        >
          {browserLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Browser open — solve captcha, then Register…
            </>
          ) : (
            <>
              <Monitor className="h-4 w-4 text-lumen-300" />
              Browser assist (autofill + you solve captcha)
            </>
          )}
        </button>
      )}

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4 }}
            className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${
              result.success
                ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20"
                : result.status === "needs_verification"
                  ? "bg-amber-500/10 text-amber-100 ring-amber-400/25"
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
              {result.status === "needs_verification" && (
                <p className="mt-2 text-xs opacity-90">
                  Use <strong>Browser assist</strong> — Chromium opens with your
                  LinkedIn answers filled; you solve Cloudflare and click Register.
                </p>
              )}
              {result.demo && (
                <p className="mt-1 text-xs opacity-70">
                  Demo submit — saved locally only.
                </p>
              )}
              {result.filledAnswers &&
                Object.keys(result.filledAnswers).length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs opacity-80">
                    {Object.entries(result.filledAnswers)
                      .slice(0, 8)
                      .map(([k, v]) => (
                        <li key={k}>
                          <span className="opacity-60">{k}:</span>{" "}
                          {v.slice(0, 120)}
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
