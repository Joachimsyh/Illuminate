import {
  mergeAgent1WithSelections,
  runAgent1Profile,
} from "@/lib/agent1-profile";
import {
  extractLinkedInSocials,
  formatSocialsForAgent,
} from "@/lib/linkedin-socials";
import { skillsToKeywords } from "@/lib/skills";
import { updateUser } from "@/lib/repos";
import {
  contentHash,
  deleteKnowledgeForUser,
  findUserProfile,
  insertProfilePostIfNew,
  listKnowledgeEdges,
  listKnowledgeNodes,
  listProfilePosts,
  touchUserProfileLinkedInSnapshot,
  upsertKnowledgeEdge,
  upsertKnowledgeNode,
  upsertUserProfile,
} from "@/lib/knowledge-repos";
import type { UserProfileRow } from "@/lib/db-types";

function parseJsonArray(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function slugKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function selectionsHash(input: {
  locations: string[];
  interests: string[];
  skills: string[];
}): string {
  return contentHash(
    JSON.stringify({
      locations: [...input.locations].sort(),
      interests: [...input.interests].sort(),
      skills: [...input.skills].sort(),
    })
  );
}

function inferTopics(text: string): string[] {
  const hay = text.toLowerCase();
  const catalog = [
    "ai",
    "ml",
    "crypto",
    "web3",
    "startup",
    "hackathon",
    "design",
    "product",
    "devops",
    "cloud",
    "security",
    "fintech",
    "health",
    "climate",
    "community",
    "networking",
    "founder",
    "engineering",
    "research",
  ];
  return catalog.filter((t) => hay.includes(t)).slice(0, 8);
}

async function rebuildKnowledgeGraph(input: {
  userId: string;
  name?: string | null;
  rawSource?: string | null;
  profile: {
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
    age?: number | null;
    lifeStatus?: string | null;
    placeOfWorkStudy?: string | null;
    agentSummary?: string | null;
  };
  posts: { id: string; content: string; topics: string[] }[];
}): Promise<void> {
  await deleteKnowledgeForUser(input.userId);

  const person = await upsertKnowledgeNode({
    userId: input.userId,
    kind: "person",
    key: "self",
    label: input.name || "User",
    props: {
      headline: input.profile.headline,
      bio: input.profile.bio,
      seniority: input.profile.seniority,
      age: input.profile.age,
      lifeStatus: input.profile.lifeStatus,
      placeOfWorkStudy: input.profile.placeOfWorkStudy,
      agentSummary: input.profile.agentSummary,
    },
  });

  const link = async (
    kind: string,
    values: string[],
    relation: string,
    weight = 1
  ) => {
    for (const value of values) {
      if (!value.trim()) continue;
      const node = await upsertKnowledgeNode({
        userId: input.userId,
        kind,
        key: slugKey(value),
        label: value,
      });
      await upsertKnowledgeEdge({
        userId: input.userId,
        fromNodeId: person.id,
        toNodeId: node.id,
        relation,
        weight,
      });
    }
  };

  if (input.profile.age != null) {
    await link("age", [String(input.profile.age)], "HAS_AGE", 1);
  }
  if (input.profile.lifeStatus) {
    await link("status", [input.profile.lifeStatus], "HAS_STATUS", 1.2);
  }
  if (input.profile.placeOfWorkStudy) {
    await link(
      "place",
      [input.profile.placeOfWorkStudy],
      "WORKS_OR_STUDIES_AT",
      1.3
    );
  }

  await link("skill", input.profile.skills, "HAS_SKILL", 1.2);
  await link("tech", input.profile.techStack, "USES_TECH", 1);
  await link("interest", input.profile.interests, "INTERESTED_IN", 1.1);
  await link("location", input.profile.locations, "BASED_IN", 1);
  await link("event_type", input.profile.eventTypes, "ATTENDS_TYPE", 0.9);
  await link("keyword", input.profile.keywords, "MATCHES_KEYWORD", 0.8);

  if (input.profile.company) {
    const company = await upsertKnowledgeNode({
      userId: input.userId,
      kind: "company",
      key: slugKey(input.profile.company),
      label: input.profile.company,
    });
    await upsertKnowledgeEdge({
      userId: input.userId,
      fromNodeId: person.id,
      toNodeId: company.id,
      relation: "WORKS_AT",
      weight: 1.3,
    });
  }

  // Social links from LinkedIn text → graph (GitHub, Twitter, etc.)
  const socials = extractLinkedInSocials(input.rawSource || "", {});
  const socialPairs: [string, string | null][] = [
    ["linkedin", socials.linkedin],
    ["github", socials.github],
    ["twitter", socials.twitter],
    ["instagram", socials.instagram],
    ["website", socials.website],
    ["portfolio", socials.portfolio],
    ["youtube", socials.youtube],
    ["medium", socials.medium],
  ];
  for (const [kind, url] of socialPairs) {
    if (!url) continue;
    const node = await upsertKnowledgeNode({
      userId: input.userId,
      kind: "social",
      key: `${kind}:${slugKey(url)}`,
      label: url,
      props: { network: kind, url },
    });
    await upsertKnowledgeEdge({
      userId: input.userId,
      fromNodeId: person.id,
      toNodeId: node.id,
      relation: `HAS_${kind.toUpperCase()}`,
      weight: 1.4,
    });
  }

  for (const post of input.posts) {
    const postNode = await upsertKnowledgeNode({
      userId: input.userId,
      kind: "post",
      key: post.id,
      label: post.content.slice(0, 80),
      props: { excerpt: post.content.slice(0, 400) },
    });
    await upsertKnowledgeEdge({
      userId: input.userId,
      fromNodeId: person.id,
      toNodeId: postNode.id,
      relation: "WROTE",
      weight: 1,
    });
    for (const topic of post.topics) {
      const topicNode = await upsertKnowledgeNode({
        userId: input.userId,
        kind: "topic",
        key: slugKey(topic),
        label: topic,
      });
      await upsertKnowledgeEdge({
        userId: input.userId,
        fromNodeId: postNode.id,
        toNodeId: topicNode.id,
        relation: "ABOUT",
        weight: 0.7,
      });
    }
  }
}

export type SyncProfileResult = {
  reused: boolean;
  extracted: boolean;
  newPosts: number;
  provider: "nvidia" | "openrouter" | "cache" | "none";
  profile: UserProfileRow;
};

/**
 * Persist profile to PostgreSQL + knowledge graph.
 * Skips Agent 1 when CV/source + selections hashes are unchanged.
 * Auto-ingests new writing posts into profile_posts and refreshes the graph.
 */
export async function syncUserProfileKnowledge(input: {
  userId: string;
  name?: string | null;
  company?: string | null;
  locations: string[];
  interests: string[];
  skills: string[];
  rawSource: string;
  writingSamples: string[];
  forceExtract?: boolean;
}): Promise<SyncProfileResult> {
  const rawSource = (input.rawSource || "").trim();
  const samples = input.writingSamples
    .map((s) => s.trim())
    .filter((s) => s.length >= 20)
    .slice(0, 8);

  const srcHash = contentHash(rawSource);
  const selHash = selectionsHash({
    locations: input.locations,
    interests: input.interests,
    skills: input.skills,
  });

  const existing = await findUserProfile(input.userId);

  // Ingest posts (only new hashes are inserted)
  let newPosts = 0;
  for (const sample of samples) {
    const { inserted } = await insertProfilePostIfNew({
      userId: input.userId,
      content: sample,
      topics: inferTopics(sample),
    });
    if (inserted) newPosts += 1;
  }
  const posts = await listProfilePosts(input.userId);

  const canReuse =
    !input.forceExtract &&
    existing &&
    existing.sourceHash === srcHash &&
    existing.selectionsHash === selHash &&
    Boolean(existing.extractedAt || rawSource.length < 40);

  let provider: SyncProfileResult["provider"] = "none";
  let extracted = false;
  let merged = {
    skills: input.skills,
    techStack: parseJsonArray(existing?.techStackJson),
    interests: input.interests,
    seniority: existing?.seniority || null,
    eventTypes: parseJsonArray(existing?.eventTypesJson),
    headline: existing?.headline || null,
    bio: existing?.bio || null,
    keywords: skillsToKeywords([
      ...input.skills,
      ...input.interests,
      ...input.locations,
    ])
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean),
    age: existing?.age ?? null,
    lifeStatus: existing?.lifeStatus || null,
    placeOfWorkStudy: existing?.placeOfWorkStudy || null,
    agentSummary: existing?.agentSummary || null,
  };

  if (canReuse && existing) {
    provider = "cache";
    merged = {
      skills: parseJsonArray(existing.skillsJson).length
        ? Array.from(
            new Set([...parseJsonArray(existing.skillsJson), ...input.skills])
          )
        : input.skills,
      techStack: parseJsonArray(existing.techStackJson),
      interests: parseJsonArray(existing.interestsJson).length
        ? Array.from(
            new Set([
              ...parseJsonArray(existing.interestsJson),
              ...input.interests,
            ])
          )
        : input.interests,
      seniority: existing.seniority,
      eventTypes: parseJsonArray(existing.eventTypesJson),
      headline: existing.headline,
      bio: existing.bio,
      keywords: parseJsonArray(existing.keywordsJson).length
        ? parseJsonArray(existing.keywordsJson)
        : merged.keywords,
      age: existing.age,
      lifeStatus: existing.lifeStatus,
      placeOfWorkStudy: existing.placeOfWorkStudy,
      agentSummary: existing.agentSummary,
    };
  } else if (rawSource.length >= 40) {
    try {
      const { profile, provider: p } = await runAgent1Profile({
        locations: input.locations,
        interests: input.interests,
        skills: input.skills,
        rawSource,
      });
      merged = mergeAgent1WithSelections(profile, {
        locations: input.locations,
        interests: input.interests,
        skills: input.skills,
        rawSource,
      });
      // Keep manual Knowledge edits if agent omitted a field
      merged = {
        ...merged,
        age: merged.age ?? existing?.age ?? null,
        lifeStatus: merged.lifeStatus || existing?.lifeStatus || null,
        placeOfWorkStudy:
          merged.placeOfWorkStudy || existing?.placeOfWorkStudy || null,
        agentSummary: merged.agentSummary || existing?.agentSummary || null,
      };
      provider = p;
      extracted = true;
    } catch (err) {
      console.warn(
        "[profile-knowledge] Agent 1 failed, keeping selections:",
        err instanceof Error ? err.message : err
      );
      provider = "none";
    }
  }

  const socials = extractLinkedInSocials(rawSource);
  const profile = await upsertUserProfile({
    userId: input.userId,
    headline: merged.headline,
    bio: merged.bio,
    company: input.company || null,
    seniority: merged.seniority,
    skills: merged.skills,
    techStack: merged.techStack,
    interests: merged.interests,
    locations: input.locations,
    eventTypes: merged.eventTypes,
    keywords: merged.keywords,
    rawSource,
    sourceHash: srcHash,
    selectionsHash: selHash,
    linkedinSnapshotJson: JSON.stringify({
      socials: {
        linkedin: socials.linkedin,
        github: socials.github,
        twitter: socials.twitter,
        instagram: socials.instagram,
        website: socials.website,
        portfolio: socials.portfolio,
        youtube: socials.youtube,
        medium: socials.medium,
      },
      updatedAt: new Date().toISOString(),
    }),
    agent1Provider: provider === "cache" ? existing?.agent1Provider || "cache" : provider,
    extractedAt:
      extracted || existing?.extractedAt
        ? extracted
          ? new Date()
          : existing?.extractedAt || new Date()
        : rawSource.length < 40
          ? new Date()
          : existing?.extractedAt || null,
    postsSyncedAt: new Date(),
    age: merged.age,
    lifeStatus: merged.lifeStatus,
    placeOfWorkStudy: merged.placeOfWorkStudy,
    agentSummary: merged.agentSummary,
  });

  // Keep users table in sync for existing UI / auth session fields
  await updateUser(input.userId, {
    location: input.locations.join("|"),
    skills: merged.skills.join("|"),
    interests: merged.interests.join("|"),
    techStack: merged.techStack.join("|"),
    seniority: merged.seniority,
    eventTypes: merged.eventTypes.join("|"),
    headline: merged.headline,
    bio: merged.bio,
    ...(input.company ? { company: input.company } : {}),
    rawSource,
    writingSamples: JSON.stringify(samples),
    agentKeywords: merged.keywords.join(","),
  });

  // Rebuild graph when profile extracted or new posts arrived
  if (extracted || newPosts > 0 || !canReuse || !existing) {
    await rebuildKnowledgeGraph({
      userId: input.userId,
      name: input.name,
      rawSource,
      profile: {
        headline: merged.headline,
        bio: merged.bio,
        company: input.company || null,
        seniority: merged.seniority,
        skills: merged.skills,
        techStack: merged.techStack,
        interests: merged.interests,
        locations: input.locations,
        eventTypes: merged.eventTypes,
        keywords: merged.keywords,
        age: merged.age,
        lifeStatus: merged.lifeStatus,
        placeOfWorkStudy: merged.placeOfWorkStudy,
        agentSummary: merged.agentSummary,
      },
      posts: posts.map((p) => ({
        id: p.id,
        content: p.content,
        topics: parseJsonArray(p.topicsJson),
      })),
    });
  }

  return {
    reused: Boolean(canReuse),
    extracted,
    newPosts,
    provider,
    profile,
  };
}

export async function saveLinkedInOidcSnapshot(
  userId: string,
  snapshot: {
    sub?: string | null;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  }
): Promise<void> {
  await touchUserProfileLinkedInSnapshot(userId, {
    ...snapshot,
    capturedAt: new Date().toISOString(),
  });
}

/**
 * Persist Knowledge-tab edits and refresh related graph nodes.
 */
export async function saveKnowledgeTabFields(input: {
  userId: string;
  name?: string | null;
  age: number | null;
  lifeStatus: string | null;
  placeOfWorkStudy: string | null;
  agentSummary: string | null;
}): Promise<UserProfileRow> {
  const { updateKnowledgeFields } = await import("@/lib/knowledge-repos");
  const profile = await updateKnowledgeFields(input.userId, {
    age: input.age,
    lifeStatus: input.lifeStatus,
    placeOfWorkStudy: input.placeOfWorkStudy,
    agentSummary: input.agentSummary,
  });

  const posts = await listProfilePosts(input.userId);
  await rebuildKnowledgeGraph({
    userId: input.userId,
    name: input.name,
    rawSource: profile.rawSource,
    profile: {
      headline: profile.headline,
      bio: profile.bio,
      company: profile.company,
      seniority: profile.seniority,
      skills: parseJsonArray(profile.skillsJson),
      techStack: parseJsonArray(profile.techStackJson),
      interests: parseJsonArray(profile.interestsJson),
      locations: parseJsonArray(profile.locationsJson),
      eventTypes: parseJsonArray(profile.eventTypesJson),
      keywords: parseJsonArray(profile.keywordsJson),
      age: profile.age,
      lifeStatus: profile.lifeStatus,
      placeOfWorkStudy: profile.placeOfWorkStudy,
      agentSummary: profile.agentSummary,
    },
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      topics: parseJsonArray(p.topicsJson),
    })),
  });

  return profile;
}

/**
 * Compact knowledge context for agents (apply / discovery / drafting).
 * Agents must treat this graph text as the primary source of truth.
 */
export async function getAgentKnowledgeContext(userId: string): Promise<{
  text: string;
  profile: UserProfileRow | null;
  nodeCount: number;
  edgeCount: number;
  posts: string[];
  keywords: string[];
  interests: string[];
  locations: string[];
}> {
  const profile = await findUserProfile(userId);
  const nodes = await listKnowledgeNodes(userId);
  const edges = await listKnowledgeEdges(userId);
  const posts = await listProfilePosts(userId);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const person = nodes.find((n) => n.kind === "person" && n.key === "self");

  const related = (relation: string) =>
    edges
      .filter((e) => e.relation === relation && e.fromNodeId === person?.id)
      .map((e) => byId.get(e.toNodeId)?.label)
      .filter(Boolean) as string[];

  const skills =
    related("HAS_SKILL").length > 0
      ? related("HAS_SKILL")
      : parseJsonArray(profile?.skillsJson);
  const tech =
    related("USES_TECH").length > 0
      ? related("USES_TECH")
      : parseJsonArray(profile?.techStackJson);
  const interests =
    related("INTERESTED_IN").length > 0
      ? related("INTERESTED_IN")
      : parseJsonArray(profile?.interestsJson);
  const locations =
    related("BASED_IN").length > 0
      ? related("BASED_IN")
      : parseJsonArray(profile?.locationsJson);
  const keywords =
    related("MATCHES_KEYWORD").length > 0
      ? related("MATCHES_KEYWORD")
      : parseJsonArray(profile?.keywordsJson);
  const eventTypes =
    related("ATTENDS_TYPE").length > 0
      ? related("ATTENDS_TYPE")
      : parseJsonArray(profile?.eventTypesJson);
  const places = related("WORKS_OR_STUDIES_AT");
  const companies = related("WORKS_AT");
  const statuses = related("HAS_STATUS");
  const socialFromGraph = {
    linkedin: related("HAS_LINKEDIN")[0] || null,
    github: related("HAS_GITHUB")[0] || null,
    twitter: related("HAS_TWITTER")[0] || null,
    instagram: related("HAS_INSTAGRAM")[0] || null,
    website: related("HAS_WEBSITE")[0] || null,
    portfolio: related("HAS_PORTFOLIO")[0] || null,
    youtube: related("HAS_YOUTUBE")[0] || null,
    medium: related("HAS_MEDIUM")[0] || null,
  };
  const socialsFromText = extractLinkedInSocials(profile?.rawSource || "");
  const socialBlock = formatSocialsForAgent({
    linkedin: socialFromGraph.linkedin || socialsFromText.linkedin,
    github: socialFromGraph.github || socialsFromText.github,
    twitter: socialFromGraph.twitter || socialsFromText.twitter,
    x: socialFromGraph.twitter || socialsFromText.twitter,
    instagram: socialFromGraph.instagram || socialsFromText.instagram,
    website: socialFromGraph.website || socialsFromText.website,
    portfolio: socialFromGraph.portfolio || socialsFromText.portfolio,
    youtube: socialFromGraph.youtube || socialsFromText.youtube,
    medium: socialFromGraph.medium || socialsFromText.medium,
    byLabel: {},
  });

  const wrote = edges
    .filter((e) => e.relation === "WROTE" && e.fromNodeId === person?.id)
    .map((e) => byId.get(e.toNodeId))
    .filter(Boolean);

  const lines = [
    "USER KNOWLEDGE GRAPH (primary source for agents — prefer graph edges over freeform guesses)",
    person?.label ? `Person: ${person.label}` : null,
    profile?.headline ? `Headline: ${profile.headline}` : null,
    profile?.age != null ? `Age: ${profile.age}` : null,
    statuses[0] || profile?.lifeStatus
      ? `Status: ${statuses[0] || profile?.lifeStatus}`
      : null,
    places[0] || profile?.placeOfWorkStudy
      ? `Place of work/study: ${places[0] || profile?.placeOfWorkStudy}`
      : null,
    companies[0] || profile?.company
      ? `Company: ${companies[0] || profile?.company}`
      : null,
    profile?.seniority ? `Seniority: ${profile.seniority}` : null,
    profile?.agentSummary
      ? `Agent summary (first person):\n${profile.agentSummary}`
      : profile?.bio
        ? `Bio:\n${profile.bio}`
        : null,
    `Social links (from LinkedIn — use EXACTLY for GitHub/Twitter/website fields):\n${socialBlock}`,
    `HAS_SKILL: ${skills.join(", ") || "(none)"}`,
    `USES_TECH: ${tech.join(", ") || "(none)"}`,
    `INTERESTED_IN: ${interests.join(", ") || "(none)"}`,
    `BASED_IN: ${locations.join(", ") || "(none)"}`,
    `ATTENDS_TYPE: ${eventTypes.join(", ") || "(none)"}`,
    `MATCHES_KEYWORD: ${keywords.join(", ") || "(none)"}`,
    wrote.length
      ? `WROTE posts (${wrote.length}):\n${wrote
          .slice(0, 5)
          .map((n, i) => {
            const excerpt =
              (n?.propsJson &&
                (() => {
                  try {
                    const p = JSON.parse(n.propsJson) as { excerpt?: string };
                    return p.excerpt || n?.label || "";
                  } catch {
                    return n?.label || "";
                  }
                })()) ||
              n?.label ||
              "";
            return `${i + 1}. ${excerpt.slice(0, 320)}`;
          })
          .join("\n")}`
      : posts.length
        ? `Recent posts (${posts.length}):\n${posts
            .slice(0, 5)
            .map((p, i) => `${i + 1}. ${p.content.slice(0, 280)}`)
            .join("\n")}`
        : null,
    `Graph size: ${nodes.length} nodes / ${edges.length} edges`,
  ].filter(Boolean);

  return {
    text: lines.join("\n"),
    profile,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    posts: posts.map((p) => p.content),
    keywords,
    interests,
    locations,
  };
}
