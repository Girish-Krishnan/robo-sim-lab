/** Named slices of one Python program. A slice is a top-level function or class. */

interface Block {
  id: string;
  start: number;
  end: number;
}

const OPEN = /^(?:async\s+def|def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/;

function blocks(lines: string[]): Block[] {
  const found: Block[] = [];
  let current: Block | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const open = OPEN.exec(line);
    if (open) {
      if (current) current.end = index;
      current = { id: open[1] ?? "", start: index, end: lines.length };
      found.push(current);
      continue;
    }
    if (!current) continue;
    if (!line.trim() || line.startsWith("#") || /^\s/.test(line)) continue;
    current.end = index;
    current = null;
  }
  return found;
}

export function readChunks(source: string): Map<string, string> {
  const lines = source.split("\n");
  const chunks = new Map<string, string>();
  for (const block of blocks(lines)) {
    chunks.set(block.id, lines.slice(block.start, block.end).join("\n"));
  }
  return chunks;
}

/** Replace one top-level function or class. The rest of the program stays put. */
export function writeChunk(source: string, id: string, body: string): string {
  const lines = source.split("\n");
  const block = blocks(lines).find((item) => item.id === id);
  if (!block) return source;
  const next = body.replace(/\s+$/, "").split("\n");
  return [...lines.slice(0, block.start), ...next, ...lines.slice(block.end)].join("\n");
}

/** Map a 1-based line of the full program to the function or class that contains it. */
export function chunkAtLine(source: string, line1: number): { id: string; local: number } | null {
  const lines = source.split("\n");
  for (const block of blocks(lines)) {
    if (line1 >= block.start + 1 && line1 <= block.end) {
      return { id: block.id, local: line1 - block.start };
    }
  }
  return null;
}

/** 1-based line where a top-level function or class begins. */
export function chunkOpenLine(source: string, id: string): number | null {
  const lines = source.split("\n");
  const block = blocks(lines).find((item) => item.id === id);
  return block ? block.start + 1 : null;
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
