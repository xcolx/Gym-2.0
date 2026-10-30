// The Markdown of the answers of the Gym-AI, like AIMessageView.swift parses it:
// `AttributedString(markdown:options: .inlineOnlyPreservingWhitespace)` only interprets the inline syntax (bold,
// italic, strikethrough, code and links) and keeps every line break and space. Headings, lists and other blocks stay
// as they are written.

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "code"; text: string }
  | { type: "strong" | "emphasis" | "strikethrough"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const WHITESPACE = /\s/;
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

/** Only links that are safe to open: web and mail */
function isSafeLink(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href);
}

export function parseInlineMarkdown(source: string): InlineNode[] {
  return parseRange(source, 0, source.length);
}

/** The text of the nodes without the formatting, e.g. for tests and accessibility */
export function plainText(nodes: readonly InlineNode[]): string {
  return nodes.map((node) => ("children" in node ? plainText(node.children) : node.text)).join("");
}

function parseRange(s: string, start: number, end: number): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = "";
  const flush = () => {
    if (text) nodes.push({ type: "text", text });
    text = "";
  };
  const push = (node: InlineNode) => {
    flush();
    nodes.push(node);
  };

  let i = start;
  while (i < end) {
    const c = s[i];

    if (c === "\\" && i + 1 < end && ASCII_PUNCTUATION.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }

    if (c === "`") {
      const run = runLength(s, i, end, "`");
      const close = findBacktickRun(s, i + run, end, run);
      if (close !== -1) {
        let code = s.slice(i + run, close).replace(/\n/g, " ");
        if (code.length > 1 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") code = code.slice(1, -1);
        push({ type: "code", text: code });
        i = close + run;
      } else {
        text += "`".repeat(run);
        i += run;
      }
      continue;
    }

    if (c === "[") {
      const link = parseLink(s, i, end);
      if (link) {
        push(link.node);
        i = link.end;
        continue;
      }
    }

    if (c === "<") {
      const match = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(s.slice(i, end));
      if (match) {
        push({ type: "link", href: match[1], children: [{ type: "text", text: match[1] }] });
        i += match[0].length;
        continue;
      }
    }

    if (c === "~" && s[i + 1] === "~" && runLength(s, i, end, "~") === 2) {
      const close = findCloser(s, i + 2, end, "~~");
      if (close !== -1) {
        push({ type: "strikethrough", children: parseRange(s, i + 2, close) });
        i = close + 2;
        continue;
      }
    }

    if (c === "*" || c === "_") {
      const run = runLength(s, i, end, c);
      if (canOpen(s, i, run, end, c)) {
        const emphasis = parseEmphasis(s, i, run, end, c);
        if (emphasis) {
          push(emphasis.node);
          i = emphasis.end;
          continue;
        }
      }
      text += c.repeat(run);
      i += run;
      continue;
    }

    text += c;
    i += 1;
  }
  flush();
  return nodes;
}

function runLength(s: string, i: number, end: number, char: string): number {
  let n = 0;
  while (i + n < end && s[i + n] === char) n += 1;
  return n;
}

function findBacktickRun(s: string, from: number, end: number, length: number): number {
  let i = from;
  while (i < end) {
    if (s[i] === "`") {
      const run = runLength(s, i, end, "`");
      if (run === length) return i;
      i += run;
    } else {
      i += 1;
    }
  }
  return -1;
}

/** A delimiter run can open emphasis if it is followed by a non-space, `_` not inside a word */
function canOpen(s: string, i: number, run: number, end: number, char: string): boolean {
  const next = i + run < end ? s[i + run] : "";
  if (!next || WHITESPACE.test(next)) return false;
  if (char === "_" && i > 0 && ALPHANUMERIC.test(s[i - 1])) return false;
  return true;
}

function canClose(s: string, i: number, run: number, end: number, char: string, start: number): boolean {
  if (i <= start) return false;
  const previous = s[i - 1];
  if (WHITESPACE.test(previous)) return false;
  const next = i + run < end ? s[i + run] : "";
  if (char === "_" && next && ALPHANUMERIC.test(next)) return false;
  return true;
}

/** `*em*`, `**strong**`, `***both***` (and the same with `_`), the closer must be a run of the same length */
function parseEmphasis(
  s: string,
  i: number,
  run: number,
  end: number,
  char: string,
): { node: InlineNode; end: number } | null {
  // A longer run stays literal text
  if (run > 3) return null;
  const contentStart = i + run;
  let j = contentStart;
  while (j < end) {
    if (s[j] === "\\") {
      j += 2;
      continue;
    }
    if (s[j] === "`") {
      const codeRun = runLength(s, j, end, "`");
      const close = findBacktickRun(s, j + codeRun, end, codeRun);
      j = close === -1 ? j + codeRun : close + codeRun;
      continue;
    }
    if (s[j] === char) {
      const closeRun = runLength(s, j, end, char);
      if (closeRun === run && canClose(s, j, closeRun, end, char, contentStart)) {
        const children = parseRange(s, contentStart, j);
        const node: InlineNode =
          run === 3
            ? { type: "strong", children: [{ type: "emphasis", children }] }
            : { type: run === 2 ? "strong" : "emphasis", children };
        return { node, end: j + closeRun };
      }
      j += closeRun;
      continue;
    }
    j += 1;
  }
  return null;
}

function findCloser(s: string, from: number, end: number, delimiter: string): number {
  let j = from;
  while (j < end) {
    if (s[j] === "\\") {
      j += 2;
      continue;
    }
    if (s.startsWith(delimiter, j) && j > from && !WHITESPACE.test(s[j - 1])) return j;
    j += 1;
  }
  return -1;
}

/** `[text](url)` with a safe url, otherwise null (the brackets stay text) */
function parseLink(s: string, i: number, end: number): { node: InlineNode; end: number } | null {
  let depth = 0;
  let j = i;
  for (; j < end; j += 1) {
    if (s[j] === "\\") {
      j += 1;
      continue;
    }
    if (s[j] === "[") depth += 1;
    if (s[j] === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (j >= end || s[j + 1] !== "(") return null;
  const close = s.indexOf(")", j + 2);
  if (close === -1 || close >= end) return null;
  const destination = s.slice(j + 2, close).trim();
  const href = destination.split(/\s+/)[0]?.replace(/^<|>$/g, "") ?? "";
  if (!isSafeLink(href)) return null;
  return { node: { type: "link", href, children: parseRange(s, i + 1, j) }, end: close + 1 };
}
