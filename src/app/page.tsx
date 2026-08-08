import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Always land on dashboard after login; middleware sends first-timers to onboarding
  redirect("/dashboard");
}
