import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/repos";
import { ProfileClient } from "./profile-client";

export const dynamic = "force-dynamic";

function splitPipe(value: string | null | undefined): string[] {
  return value ? value.split("|").filter(Boolean) : [];
}

export default async function ProfilePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const user = await findUserById(session.user.id);
  if (!user) redirect("/login");

  return (
    <ProfileClient
      initial={{
        name: user.name || "",
        email: user.email || "",
        image: user.image || null,
        locations: splitPipe(user.location),
        interests: splitPipe(user.interests),
        skills: splitPipe(user.skills),
        rawSource: user.rawSource || "",
      }}
    />
  );
}
