import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findUserById, updateUser } from "@/lib/repos";
import { runAgentCycle, type AgentProgressEvent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

const settingsSchema = z.object({
  agentEnabled: z.boolean().optional(),
  agentKeywords: z.string().optional(),
  runNow: z.boolean().optional(),
  /** Stream live progress as SSE when running. */
  stream: z.boolean().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await findUserById(session.user.id);
  const user = row
    ? { agentEnabled: row.agentEnabled, agentKeywords: row.agentKeywords }
    : null;

  return NextResponse.json({ agent: user });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => ({}));
  const parsed = settingsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (
    parsed.data.agentEnabled !== undefined ||
    parsed.data.agentKeywords !== undefined
  ) {
    await updateUser(session.user.id, {
      ...(parsed.data.agentEnabled !== undefined
        ? { agentEnabled: parsed.data.agentEnabled }
        : {}),
      ...(parsed.data.agentKeywords !== undefined
        ? { agentKeywords: parsed.data.agentKeywords }
        : {}),
    });
  }

  if (parsed.data.runNow && parsed.data.stream) {
    const userId = session.user.id;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
          );
        };

        try {
          send({ type: "hello", message: "Connected — agent starting" });
          const run = await runAgentCycle({
            userId,
            onProgress: async (event: AgentProgressEvent) => {
              send({ type: "progress", ...event });
            },
          });
          send({ type: "done", run });
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "Agent failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  let run = null;
  if (parsed.data.runNow) {
    run = await runAgentCycle({ userId: session.user.id });
  }

  const row = await findUserById(session.user.id);
  const user = row
    ? { agentEnabled: row.agentEnabled, agentKeywords: row.agentKeywords }
    : null;

  return NextResponse.json({ agent: user, run });
}
