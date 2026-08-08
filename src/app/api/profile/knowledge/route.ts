import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  listKnowledgeEdges,
  listKnowledgeNodes,
  listProfilePosts,
  findUserProfile,
} from "@/lib/knowledge-repos";
import { getAgentKnowledgeContext } from "@/lib/profile-knowledge";

/** Inspect stored profile + knowledge graph for the signed-in user. */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const [profile, posts, nodes, edges, context] = await Promise.all([
    findUserProfile(userId),
    listProfilePosts(userId),
    listKnowledgeNodes(userId),
    listKnowledgeEdges(userId),
    getAgentKnowledgeContext(userId),
  ]);

  return NextResponse.json({
    profile,
    posts: posts.map((p) => ({
      id: p.id,
      content: p.content,
      contentHash: p.contentHash,
      topics: p.topicsJson,
      createdAt: p.createdAt,
    })),
    knowledgeGraph: {
      nodes: nodes.map((n) => ({
        id: n.id,
        kind: n.kind,
        key: n.key,
        label: n.label,
      })),
      edges: edges.map((e) => ({
        from: e.fromNodeId,
        to: e.toNodeId,
        relation: e.relation,
        weight: e.weight,
      })),
    },
    agentContext: context.text,
  });
}
