/** Named slices of one Python program. Markers are comments, so they run as no-ops. */

const OPEN = /^\s*# @@chunk ([A-Za-z0-9_-]+)\s*$/;
const CLOSE = /^\s*# @@end\s*$/;

export function readChunks(source: string): Map<string, string> {
  const chunks = new Map<string, string>();
  const lines = source.split("\n");
  let id: string | null = null;
  let body: string[] = [];
  for (const line of lines) {
    const open = OPEN.exec(line);
    if (open) {
      id = open[1] ?? null;
      body = [];
      continue;
    }
    if (id && CLOSE.test(line)) {
      chunks.set(id, body.join("\n"));
      id = null;
      body = [];
      continue;
    }
    if (id) body.push(line);
  }
  return chunks;
}

/** Replace one marked slice. The markers stay put, so the rest of the program is unchanged. */
export function writeChunk(source: string, id: string, body: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  let skipping = false;
  let found = false;
  const next = body.replace(/\s+$/, "").split("\n");
  for (const line of lines) {
    const open = OPEN.exec(line);
    if (open?.[1] === id) {
      found = true;
      skipping = true;
      out.push(line, ...next);
      continue;
    }
    if (skipping) {
      if (CLOSE.test(line)) {
        skipping = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return found ? out.join("\n") : source;
}

/** Map a 1-based line of the full program to the slice that contains it. */
export function chunkAtLine(source: string, line1: number): { id: string; local: number } | null {
  const lines = source.split("\n");
  let id: string | null = null;
  let local = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const open = OPEN.exec(line);
    if (open) {
      id = open[1] ?? null;
      local = 0;
      continue;
    }
    if (id && CLOSE.test(line)) {
      id = null;
      local = 0;
      continue;
    }
    if (!id) continue;
    local += 1;
    if (index + 1 === line1) return { id, local };
  }
  return null;
}

/** Shared leading indent, so a slice can be shown flush with column 1. */
export function dedent(body: string): { text: string; indent: string } {
  const lines = body.split("\n");
  let indent: string | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = /^[ \t]*/.exec(line)?.[0] ?? "";
    if (indent === null || match.length < indent.length) indent = match;
  }
  if (!indent) return { text: body, indent: "" };
  const pad = indent;
  const text = lines.map((line) => (line.startsWith(pad) ? line.slice(pad.length) : line)).join("\n");
  return { text, indent };
}

export function indentBody(text: string, indent: string): string {
  if (!indent) return text;
  return text
    .split("\n")
    .map((line) => (line.trim() ? indent + line : line))
    .join("\n");
}
