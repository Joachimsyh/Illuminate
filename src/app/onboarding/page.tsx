import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { findLumaConnection, findUserById } from "@/lib/repos";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const user = await findUserById(session.user.id);
  if (!user) redirect("/login");

  const lumaConnection = await findLumaConnection(session.user.id);

  let writingSamples: string[] = [];
  try {
    writingSamples = JSON.parse(user.writingSamples || "[]") as string[];
  } catch {
    writingSamples = [];
  }

  let icsPreview: {
    uid: string;
    title: string;
    start: string | null;
    location: string | null;
  }[] = [];
  try {
    icsPreview = JSON.parse(lumaConnection?.previewJson || "[]");
  } catch {
    icsPreview = [];
  }

  return (
    <OnboardingClient
      initial={{
        name: user.name || "",
        email: user.email || "",
        registrationName: user.registrationName || user.name || "",
        registrationEmail: user.registrationEmail || user.email || "",
        locations: user.location
          ? user.location.split("|").filter(Boolean)
          : [],
        skills: user.skills ? user.skills.split("|").filter(Boolean) : [],
        interests: user.interests
          ? user.interests.split("|").filter(Boolean)
          : [],
        rawSource: user.rawSource || "",
        writingSamples,
        onboardingStep: user.onboardingCompleted ? 4 : user.onboardingStep || 1,
        hasLumaConnection: Boolean(lumaConnection),
        icsPreview,
      }}
    />
  );
}
