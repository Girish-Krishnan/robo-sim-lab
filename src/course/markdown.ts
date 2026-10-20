import katex from "katex";

/** Render lesson markdown, including `$` / `$$` math and inline SVG. */
export function renderMarkdown(source: string): string {
  const parts = source.split("```");
  const blocks: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      const raw = parts[i] ?? "";
      const newline = raw.indexOf("\n");
      const code = newline === -1 ? raw : raw.slice(newline + 1);
      blocks.push(`<pre><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`);
    } else {
      blocks.push(renderProse(parts[i] ?? ""));
    }
  }
  return blocks.join("\n");
}

function renderProse(source: string): string {
  const math: string[] = [];
  const marked = source
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => {
      math.push(katex.renderToString(String(tex).trim(), { displayMode: true, throwOnError: false }));
      return `\n\n@@MATH${math.length - 1}@@\n\n`;
    })
    .replace(/\$([^$\n]+?)\$/g, (_, tex: string) => {
      math.push(katex.renderToString(String(tex).trim(), { displayMode: false, throwOnError: false }));
      return `@@MATH${math.length - 1}@@`;
    });
  const restore = (text: string) => text.replace(/@@MATH(\d+)@@/g, (_, index: string) => math[Number(index)] ?? "");
  const lines = marked.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (trimmed.startsWith("<svg") || trimmed.startsWith("<div")) {
      const tag = trimmed.startsWith("<svg") ? "svg" : "div";
      const chunk = [line];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").includes(`</${tag}>`)) {
        chunk.push(lines[i] ?? "");
        i += 1;
      }
      if (i < lines.length) chunk.push(lines[i] ?? "");
      i += 1;
      out.push(`<div class="diagram">${chunk.join("\n")}</div>`);
      continue;
    }
    if (trimmed === "") {
      i += 1;
      continue;
    }
    if (/^@@MATH\d+@@$/.test(trimmed)) {
      out.push(`<div class="math-block">${restore(trimmed)}</div>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      out.push(`<h3>${inline(trimmed.slice(4), restore)}</h3>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      out.push(`<h2>${inline(trimmed.slice(3), restore)}</h2>`);
      i += 1;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      out.push(`<h1>${inline(trimmed.slice(2), restore)}</h1>`);
      i += 1;
      continue;
    }
    if (/^\d+\.\s/.test(trimmed) || /^[-*]\s/.test(trimmed)) {
      const ordered = /^\d+\.\s/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const item = (lines[i] ?? "").trim();
        const match = ordered ? /^\d+\.\s/.test(item) : /^[-*]\s/.test(item);
        if (!match) break;
        items.push(`<li>${inline(item.replace(/^\d+\.\s/, "").replace(/^[-*]\s/, ""), restore)}</li>`);
        i += 1;
      }
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && !isBoundary(lines[i] ?? "")) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    out.push(`<p>${inline(para.join(" "), restore)}</p>`);
  }
  return out.join("\n");
}

function isBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return true;
  if (trimmed.startsWith("<svg") || trimmed.startsWith("<div")) return true;
  if (/^#{1,3}\s/.test(trimmed)) return true;
  if (/^\d+\.\s/.test(trimmed) || /^[-*]\s/.test(trimmed)) return true;
  if (/^@@MATH\d+@@$/.test(trimmed)) return true;
  return false;
}

function inline(text: string, restore: (value: string) => string): string {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, (_, code: string) => `<code>${code}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, href: string) => {
    const safe = /^(https?:\/\/|#[\w./-]*)$/.test(href) ? href : "#/sandbox";
    return `<a href="${safe}">${label}</a>`;
  });
  return restore(html);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
