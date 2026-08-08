"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";
import { MagneticButton } from "@/components/motion";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; id?: string; to?: string }
  | { kind: "error"; message: string };

export default function TestEmailPage() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleSend() {
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/test-email", { method: "POST" });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        id?: string;
        to?: string;
      };

      if (!res.ok || !data.success) {
        setStatus({
          kind: "error",
          message: data.error || `Request failed (${res.status})`,
        });
        return;
      }

      setStatus({ kind: "success", id: data.id, to: data.to });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-3xl p-8"
      >
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-lumen-400/15 ring-1 ring-lumen-300/30">
          <Mail className="h-5 w-5 text-lumen-300" />
        </div>
        <h1 className="font-display text-3xl text-mist-100">Resend test</h1>
        <p className="mt-2 text-sm text-mist-400">
          Sends a simple HTML email via the Resend API to verify your key is
          working.
        </p>

        <MagneticButton
          onClick={handleSend}
          disabled={status.kind === "loading"}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-lumen-400 px-5 py-3.5 text-sm font-semibold text-ink-950 disabled:opacity-60"
        >
          {status.kind === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            "Send Test Email"
          )}
        </MagneticButton>

        {status.kind === "success" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-400/20"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p>Email sent successfully.</p>
              {status.to && (
                <p className="mt-1 text-xs opacity-80">To: {status.to}</p>
              )}
              {status.id && (
                <p className="mt-0.5 text-xs opacity-80">ID: {status.id}</p>
              )}
            </div>
          </motion.div>
        )}

        {status.kind === "error" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 flex items-start gap-2 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/20"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{status.message}</p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
