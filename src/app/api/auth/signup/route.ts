import { NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/password";
import { createUser, findUserByEmail } from "@/lib/repos";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const schema = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
    password: z.string().min(8).max(200),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  try {
    const email = parsed.data.email.toLowerCase();
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await createUser({
      name: parsed.data.name,
      email,
      passwordHash,
      image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(email)}`,
    });

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[signup]", message);
    const dbDown =
      message.includes("ECONNREFUSED") || message.includes("connect");
    return NextResponse.json(
      {
        error: dbDown
          ? "Database is unavailable. Start Postgres (Docker Desktop + npm run db:up), then try again."
          : "Could not create account",
      },
      { status: 503 }
    );
  }
}
