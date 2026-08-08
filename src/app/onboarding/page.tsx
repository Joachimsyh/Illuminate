import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { OnboardingClient } from "./onboarding-client";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  return (
    <OnboardingClient
      name={session.user.name?.split(" ")[0] || "there"}
      initialSkills={session.user.skills || []}
      editing={Boolean(session.user.onboardingCompleted)}
    />
  );
}
