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
