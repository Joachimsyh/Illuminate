import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { findUserById } from "@/lib/repos";
import { findUserProfile } from "@/lib/knowledge-repos";
import { LIFE_STATUS_OPTIONS } from "@/lib/profile-options";
import { KnowledgeClient } from "./knowledge-client";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const user = await findUserById(session.user.id);
  if (!user) redirect("/login");

  const profile = await findUserProfile(session.user.id);

  return (
    <KnowledgeClient
      initial={{
        name: user.name || "You",
        age: profile?.age ?? null,
        lifeStatus: profile?.lifeStatus ?? null,
        placeOfWorkStudy: profile?.placeOfWorkStudy ?? null,
        agentSummary: profile?.agentSummary ?? profile?.bio ?? "",
        statusOptions: [...LIFE_STATUS_OPTIONS],
      }}
    />
  );
}
