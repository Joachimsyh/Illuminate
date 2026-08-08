import mammoth from "mammoth";
import { MAX_CV_BYTES } from "@/lib/cv-constants";

export { MAX_CV_BYTES, CV_ACCEPT } from "@/lib/cv-constants";

const TEXT_EXT = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "html",
  "htm",
  "xml",
  "tex",
  "rtf",
  "log",
  "tsv",
  "yml",
  "yaml",
]);

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

function looksLikeBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 800));
  let weird = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0) return true;
    if (b < 7 || (b > 14 && b < 32 && b !== 9 && b !== 10 && b !== 13)) weird++;
  }
  return weird / sample.length > 0.3;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeText(buf: Buffer): string {
  // Prefer UTF-8; fall back to latin1 so we still get something
  let text = buf.toString("utf8");
  if (text.includes("\uFFFD")) {
    text = buf.toString("latin1");
  }
  return text.replace(/\u0000/g, "").trim();
}

async function extractPdf(buf: Buffer): Promise<string> {
  // pdf-parse is CJS; dynamic require keeps Next happy
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    data: Buffer
  ) => Promise<{ text: string }>;
  const result = await pdfParse(buf);
  return (result.text || "").trim();
}

async function extractDocx(buf: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: buf });
  return (result.value || "").trim();
}

/** Best-effort ODT text recovery without a zip dependency. */
async function extractOdt(buf: Buffer): Promise<string> {
  const latin = buf.toString("latin1");
  // Pull text:p / text:h payloads if content.xml is stored uncompressed
  const chunks = [
    ...Array.from(latin.matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)),
    ...Array.from(latin.matchAll(/<text:h[^>]*>([\s\S]*?)<\/text:h>/g)),
  ].map((m) => stripHtml(m[1] || ""));

  const joined = chunks.filter((c) => c.length > 2).join("\n").trim();
  if (joined.length >= 20) return joined;

  const text = decodeText(buf);
  const paras = text.match(/[\w][\w\s.,;:'"()\-/&@+]{20,}/g);
  if (paras?.length) return paras.join("\n").trim();
  throw new Error(
    "Could not extract text from ODT. Export as PDF or DOCX and try again."
  );
}

export type CvExtractResult =
  | { ok: true; text: string; filename: string; format: string }
  | { ok: false; error: string };

/**
 * Extract plain text from an uploaded CV in any common format.
 * Unsupported binaries return a clear error (paste still works).
 */
export async function extractCvText(
  buffer: Buffer,
  filename: string,
  mimeType = ""
): Promise<CvExtractResult> {
  if (!buffer.length) {
    return { ok: false, error: "File is empty" };
  }
  if (buffer.length > MAX_CV_BYTES) {
    return { ok: false, error: "File is too large (max 12 MB)" };
  }

  const ext = extOf(filename);
  const mime = mimeType.toLowerCase();
  const name = filename || "upload";

  try {
    if (ext === "pdf" || mime === "application/pdf") {
      const text = await extractPdf(buffer);
      if (text.length < 20) {
        return {
          ok: false,
          error:
            "Could not read text from this PDF (it may be scanned). Paste the text instead.",
        };
      }
      return { ok: true, text, filename: name, format: "pdf" };
    }

    if (
      ext === "docx" ||
      mime.includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      )
    ) {
      const text = await extractDocx(buffer);
      if (text.length < 20) {
        return { ok: false, error: "DOCX had almost no readable text" };
      }
      return { ok: true, text, filename: name, format: "docx" };
    }

    if (ext === "odt") {
      const text = await extractOdt(buffer);
      if (text.length < 20) {
        return { ok: false, error: "ODT had almost no readable text" };
      }
      return { ok: true, text, filename: name, format: "odt" };
    }

    if (ext === "doc" || mime === "application/msword") {
      // Legacy .doc is binary OLE — often not plain-text extractable without native tools
      if (!looksLikeBinary(buffer)) {
        const text = decodeText(buffer);
        if (text.length >= 40) {
          return { ok: true, text, filename: name, format: "doc" };
        }
      }
      return {
        ok: false,
        error:
          "Legacy .doc files aren’t fully supported. Save as .docx or .pdf and upload again.",
      };
    }

    if (
      TEXT_EXT.has(ext) ||
      mime.startsWith("text/") ||
      mime === "application/json" ||
      mime === "application/xml"
    ) {
      let text = decodeText(buffer);
      if (ext === "html" || ext === "htm" || mime.includes("html")) {
        text = stripHtml(text);
      }
      if (ext === "rtf") {
        text = text
          .replace(/\\[a-z]+-?\d* ?/gi, " ")
          .replace(/[{}]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      }
      if (text.length < 20) {
        return { ok: false, error: "File had almost no readable text" };
      }
      return { ok: true, text, filename: name, format: ext || "text" };
    }

    // Unknown: try as text if it doesn't look binary
    if (!looksLikeBinary(buffer)) {
      const text = decodeText(buffer);
      if (text.length >= 40) {
        return { ok: true, text, filename: name, format: ext || "text" };
      }
    }

    // PDF magic bytes without extension
    if (buffer.subarray(0, 4).toString("utf8") === "%PDF") {
      const text = await extractPdf(buffer);
      if (text.length >= 20) {
        return { ok: true, text, filename: name, format: "pdf" };
      }
    }

    // ZIP/DOCX magic
    if (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      (ext === "docx" || mime.includes("wordprocessingml"))
    ) {
      const text = await extractDocx(buffer);
      if (text.length >= 20) {
        return { ok: true, text, filename: name, format: "docx" };
      }
    }

    if (mime.startsWith("image/")) {
      return {
        ok: false,
        error:
          "Image CVs aren’t supported yet (no OCR). Upload a PDF/DOCX or paste the text.",
      };
    }

    return {
      ok: false,
      error: `Couldn’t extract text from .${ext || "this file"}. Try PDF, DOCX, TXT, or paste the text.`,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to read CV file",
    };
  }
}
