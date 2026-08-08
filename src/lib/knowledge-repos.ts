import { createHash } from "crypto";
import { execute, newId, query, queryOne } from "@/lib/db";
import {
  KNOWLEDGE_EDGE_SELECT,
  KNOWLEDGE_NODE_SELECT,
  PROFILE_POST_SELECT,
  USER_PROFILE_SELECT,
  type KnowledgeEdgeRow,
  type KnowledgeNodeRow,
  type ProfilePostRow,
  type UserProfileRow,
} from "@/lib/db-types";

export function contentHash(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export async function findUserProfile(
  userId: string
): Promise<UserProfileRow | null> {
  return queryOne<UserProfileRow>(
    `SELECT ${USER_PROFILE_SELECT} FROM user_profiles WHERE user_id = $1`,
    [userId]
  );
}

export async function upsertUserProfile(data: {
  userId: string;
  headline: string | null;
  bio: string | null;
  company: string | null;
  seniority: string | null;
  skills: string[];
  techStack: string[];
  interests: string[];
  locations: string[];
  eventTypes: string[];
  keywords: string[];
  rawSource: string;
  sourceHash: string;
  selectionsHash: string;
  linkedinSnapshotJson?: string;
  agent1Provider: string | null;
  extractedAt: Date | null;
  postsSyncedAt?: Date | null;
  age?: number | null;
  lifeStatus?: string | null;
  placeOfWorkStudy?: string | null;
  agentSummary?: string | null;
}): Promise<UserProfileRow> {
  return (await queryOne<UserProfileRow>(
    `INSERT INTO user_profiles (
       id, user_id, headline, bio, company, seniority,
       skills_json, tech_stack_json, interests_json, locations_json,
       event_types_json, keywords_json, raw_source, source_hash, selections_hash,
       linkedin_snapshot_json, agent1_provider, extracted_at, posts_synced_at,
       age, life_status, place_of_work_study, agent_summary
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
       $20,$21,$22,$23
     )
     ON CONFLICT (user_id) DO UPDATE SET
       headline = EXCLUDED.headline,
       bio = EXCLUDED.bio,
       company = EXCLUDED.company,
       seniority = EXCLUDED.seniority,
       skills_json = EXCLUDED.skills_json,
       tech_stack_json = EXCLUDED.tech_stack_json,
       interests_json = EXCLUDED.interests_json,
       locations_json = EXCLUDED.locations_json,
       event_types_json = EXCLUDED.event_types_json,
       keywords_json = EXCLUDED.keywords_json,
       raw_source = EXCLUDED.raw_source,
       source_hash = EXCLUDED.source_hash,
       selections_hash = EXCLUDED.selections_hash,
       linkedin_snapshot_json = COALESCE(EXCLUDED.linkedin_snapshot_json, user_profiles.linkedin_snapshot_json),
       agent1_provider = EXCLUDED.agent1_provider,
       extracted_at = EXCLUDED.extracted_at,
       posts_synced_at = COALESCE(EXCLUDED.posts_synced_at, user_profiles.posts_synced_at),
       age = COALESCE(EXCLUDED.age, user_profiles.age),
       life_status = COALESCE(EXCLUDED.life_status, user_profiles.life_status),
       place_of_work_study = COALESCE(EXCLUDED.place_of_work_study, user_profiles.place_of_work_study),
       agent_summary = COALESCE(EXCLUDED.agent_summary, user_profiles.agent_summary),
       updated_at = NOW()
     RETURNING ${USER_PROFILE_SELECT}`,
    [
      newId(),
      data.userId,
      data.headline,
      data.bio,
      data.company,
      data.seniority,
      JSON.stringify(data.skills),
      JSON.stringify(data.techStack),
      JSON.stringify(data.interests),
      JSON.stringify(data.locations),
      JSON.stringify(data.eventTypes),
      JSON.stringify(data.keywords),
      data.rawSource,
      data.sourceHash,
      data.selectionsHash,
      data.linkedinSnapshotJson ?? "{}",
      data.agent1Provider,
      data.extractedAt,
      data.postsSyncedAt ?? null,
      data.age ?? null,
      data.lifeStatus ?? null,
      data.placeOfWorkStudy ?? null,
      data.agentSummary ?? null,
    ]
  ))!;
}

/** Manual Knowledge-tab edits (always overwrite). */
export async function updateKnowledgeFields(
  userId: string,
  data: {
    age?: number | null;
    lifeStatus?: string | null;
    placeOfWorkStudy?: string | null;
    agentSummary?: string | null;
  }
): Promise<UserProfileRow> {
  const existing = await findUserProfile(userId);
  if (!existing) {
    return (await queryOne<UserProfileRow>(
      `INSERT INTO user_profiles (
         id, user_id, age, life_status, place_of_work_study, agent_summary
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING ${USER_PROFILE_SELECT}`,
      [
        newId(),
        userId,
        data.age ?? null,
        data.lifeStatus ?? null,
        data.placeOfWorkStudy ?? null,
        data.agentSummary ?? null,
      ]
    ))!;
  }

  const sets: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  const add = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  };
  if ("age" in data) add("age", data.age ?? null);
  if ("lifeStatus" in data) add("life_status", data.lifeStatus ?? null);
  if ("placeOfWorkStudy" in data)
    add("place_of_work_study", data.placeOfWorkStudy ?? null);
  if ("agentSummary" in data) add("agent_summary", data.agentSummary ?? null);

  params.push(userId);
  return (await queryOne<UserProfileRow>(
    `UPDATE user_profiles SET ${sets.join(", ")}
     WHERE user_id = $${params.length}
     RETURNING ${USER_PROFILE_SELECT}`,
    params
  ))!;
}

export async function touchUserProfileLinkedInSnapshot(
  userId: string,
  snapshot: Record<string, unknown>
): Promise<void> {
  const existing = await findUserProfile(userId);
  if (existing) {
    await execute(
      `UPDATE user_profiles
       SET linkedin_snapshot_json = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [userId, JSON.stringify(snapshot)]
    );
    return;
  }
  await execute(
    `INSERT INTO user_profiles (id, user_id, linkedin_snapshot_json)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       linkedin_snapshot_json = EXCLUDED.linkedin_snapshot_json,
       updated_at = NOW()`,
    [newId(), userId, JSON.stringify(snapshot)]
  );
}

export async function listProfilePosts(
  userId: string
): Promise<ProfilePostRow[]> {
  return query<ProfilePostRow>(
    `SELECT ${PROFILE_POST_SELECT} FROM profile_posts
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
}

export async function insertProfilePostIfNew(data: {
  userId: string;
  content: string;
  source?: string;
  topics?: string[];
}): Promise<{ row: ProfilePostRow; inserted: boolean }> {
  const hash = contentHash(data.content);
  const existing = await queryOne<ProfilePostRow>(
    `SELECT ${PROFILE_POST_SELECT} FROM profile_posts
     WHERE user_id = $1 AND content_hash = $2`,
    [data.userId, hash]
  );
  if (existing) return { row: existing, inserted: false };

  const row = await queryOne<ProfilePostRow>(
    `INSERT INTO profile_posts (id, user_id, content, content_hash, source, topics_json)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${PROFILE_POST_SELECT}`,
    [
      newId(),
      data.userId,
      data.content.trim(),
      hash,
      data.source || "writing_sample",
      JSON.stringify(data.topics || []),
    ]
  );
  return { row: row!, inserted: true };
}

export async function upsertKnowledgeNode(data: {
  userId: string;
  kind: string;
  key: string;
  label: string;
  props?: Record<string, unknown>;
}): Promise<KnowledgeNodeRow> {
  return (await queryOne<KnowledgeNodeRow>(
    `INSERT INTO knowledge_nodes (id, user_id, kind, key, label, props_json)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, kind, key) DO UPDATE SET
       label = EXCLUDED.label,
       props_json = EXCLUDED.props_json,
       updated_at = NOW()
     RETURNING ${KNOWLEDGE_NODE_SELECT}`,
    [
      newId(),
      data.userId,
      data.kind,
      data.key,
      data.label,
      JSON.stringify(data.props || {}),
    ]
  ))!;
}

export async function upsertKnowledgeEdge(data: {
  userId: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
  weight?: number;
  props?: Record<string, unknown>;
}): Promise<void> {
  await execute(
    `INSERT INTO knowledge_edges (
       id, user_id, from_node_id, to_node_id, relation, weight, props_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, from_node_id, to_node_id, relation) DO UPDATE SET
       weight = EXCLUDED.weight,
       props_json = EXCLUDED.props_json`,
    [
      newId(),
      data.userId,
      data.fromNodeId,
      data.toNodeId,
      data.relation,
      data.weight ?? 1,
      JSON.stringify(data.props || {}),
    ]
  );
}

export async function deleteKnowledgeForUser(userId: string): Promise<void> {
  await execute(`DELETE FROM knowledge_edges WHERE user_id = $1`, [userId]);
  await execute(`DELETE FROM knowledge_nodes WHERE user_id = $1`, [userId]);
}

export async function listKnowledgeNodes(
  userId: string
): Promise<KnowledgeNodeRow[]> {
  return query<KnowledgeNodeRow>(
    `SELECT ${KNOWLEDGE_NODE_SELECT} FROM knowledge_nodes WHERE user_id = $1`,
    [userId]
  );
}

export async function listKnowledgeEdges(
  userId: string
): Promise<KnowledgeEdgeRow[]> {
  return query<KnowledgeEdgeRow>(
    `SELECT ${KNOWLEDGE_EDGE_SELECT} FROM knowledge_edges WHERE user_id = $1`,
    [userId]
  );
}
