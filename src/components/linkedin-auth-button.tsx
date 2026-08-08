"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Linkedin } from "lucide-react";
import { MagneticButton } from "@/components/motion";

export function LinkedInAuthButton({
  callbackUrl = "/dashboard",
  label = "Continue with LinkedIn",
}: {
  callbackUrl?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      // Confirm provider is registered before redirecting
      const res = await fetch("/api/auth/providers");
      const providers = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!providers.linkedin) {
        setError(
          "LinkedIn sign-in is not configured. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET, then restart the app."
        );
        setLoading(false);
        return;
      }
      await signIn("linkedin", { callbackUrl });
    } catch {
      setError("Could not start LinkedIn sign-in. Try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <MagneticButton
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0A66C2] px-4 py-3.5 text-sm font-semibold text-white hover:bg-[#004182] disabled:opacity-60"
      >
        <Linkedin className="h-4 w-4" />
        {loading ? "Redirecting to LinkedIn…" : label}
      </MagneticButton>
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </div>
  );
}
