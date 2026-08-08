import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { extractCvText, MAX_CV_BYTES } from "@/lib/cv-extract";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  if (file.size > MAX_CV_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 12 MB)" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await extractCvText(buffer, file.name || "cv", file.type || "");

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    text: result.text,
    filename: result.filename,
    format: result.format,
    chars: result.text.length,
  });
}
