/**
 * yaml-lite — a deliberately small YAML reader for `config/pipeline/endpoints.yml`.
 *
 * The project ships without a YAML dependency, and the pipeline config needs a
 * subset of the language only: block mappings, block sequences, quoted/plain
 * scalars, `#` comments, `- key: value` list items, nested blocks and flat flow
 * collections (`[a, b]` / `{a: b}`). Anything outside that subset throws
 * `YamlLiteError` with the offending line, so a mistake in the config file is a
 * loud failure instead of a silently wrong pipeline.
 *
 * Not supported on purpose: anchors/aliases, multi-line block scalars (`|`, `>`),
 * tags, multiple documents, tabs for indentation.
 */

export class YamlLiteError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = "YamlLiteError";
    this.line = line;
  }
}

type Scalar = string | number | boolean | null;
type Container = Scalar | Container[] | { [key: string]: Container };

interface Token {
  indent: number;
  text: string;
  line: number;
}

const BOOLEANS: Record<string, boolean> = {
  true: true,
  false: false,
  yes: true,
  no: false,
  on: true,
  off: false,
};

/** Removes a trailing `#` comment while leaving `#` inside quotes alone. */
function stripComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === "\\" && quote === '"') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const cleaned = stripComment(lines[i]);
    const trimmed = cleaned.trim();
    if (trimmed === "" || trimmed === "---" || trimmed === "...") continue;
    const indentation = cleaned.slice(0, cleaned.length - cleaned.trimStart().length);
    if (indentation.includes("\t")) throw new YamlLiteError("tabs are not allowed for indentation", lineNo);
    tokens.push({ indent: indentation.length, text: trimmed, line: lineNo });
  }
  return tokens;
}

/** Index of the first top-level `: ` separator, or -1 when the text is a scalar. */
function keySplit(text: string): number {
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      if (char === "\\" && quote === '"') {
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") depth -= 1;
    else if (char === ":" && depth === 0 && (i === text.length - 1 || /\s/.test(text[i + 1]))) return i;
  }
  return -1;
}

function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let quote: string | null = null;
  let depth = 0;
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (quote) {
      current += char;
      if (char === "\\" && quote === '"') {
        current += body[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") depth -= 1;
    if (char === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim() !== "") out.push(current.trim());
  return out;
}

export function parseScalar(raw: string, line: number): Scalar {
  const text = raw.trim();
  if (text === "" || text === "~" || text === "null" || text === "Null" || text === "NULL") return null;
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    try {
      return JSON.parse(text) as string;
    } catch {
      throw new YamlLiteError(`invalid double-quoted string ${text}`, line);
    }
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  // Refuse (loudly) the constructs yaml-lite does not implement, instead of
  // storing them as strings and letting the pipeline believe a URL was set.
  if (/^[&*|>!%@`]/.test(text)) {
    throw new YamlLiteError(
      `unsupported YAML construct «${text.slice(0, 12)}» (anchors, aliases, block scalars and tags are not part of yaml-lite)`,
      line,
    );
  }
  const lowered = text.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BOOLEANS, lowered)) return BOOLEANS[lowered];
  if (/^[+-]?\d+$/.test(text)) {
    const n = Number(text);
    if (Number.isSafeInteger(n)) return n;
  }
  if (/^[+-]?(\d+\.\d+|\d+)([eE][+-]?\d+)?$/.test(text)) {
    const n = Number(text);
    if (Number.isFinite(n)) return n;
  }
  return text;
}

/** Reads a value that may be a scalar, a flat `[a, b]` list or a flat `{a: b}` map. */
function readValue(raw: string, line: number): Container {
  const text = raw.trim();
  if (text === "") return null;
  if (text.startsWith("[") && text.endsWith("]")) {
    const body = text.slice(1, -1).trim();
    if (body === "") return [];
    return splitTopLevel(body).map((part) => parseScalar(part, line));
  }
  if (text.startsWith("{") && text.endsWith("}")) {
    const body = text.slice(1, -1).trim();
    const out: { [key: string]: Container } = {};
    if (body === "") return out;
    for (const part of splitTopLevel(body)) {
      const at = keySplit(part);
      if (at < 0) throw new YamlLiteError(`expected "key: value" inside ${text}`, line);
      const key = String(parseScalar(part.slice(0, at), line) ?? "");
      out[key] = readValue(part.slice(at + 1), line);
    }
    return out;
  }
  return parseScalar(text, line);
}

function isSequenceItem(text: string): boolean {
  return text === "-" || text.startsWith("- ");
}

function assign(target: Record<string, Container>, key: string, value: Container, line: number): void {
  if (Object.prototype.hasOwnProperty.call(target, key)) {
    throw new YamlLiteError(`duplicate key "${key}"`, line);
  }
  target[key] = value;
}

/** Reads consecutive `key: value` entries at one indentation into `target`. */
function readMappingEntries(
  tokens: Token[],
  start: number,
  indent: number,
  target: Record<string, Container>,
): number {
  let i = start;
  while (i < tokens.length && tokens[i].indent === indent && !isSequenceItem(tokens[i].text)) {
    const token = tokens[i];
    const at = keySplit(token.text);
    if (at < 0) throw new YamlLiteError(`expected "key: value" but found "${token.text}"`, token.line);
    const keyText = token.text.slice(0, at);
    const key = String(parseScalar(keyText, token.line) ?? "");
    if (key === "") throw new YamlLiteError("empty mapping key", token.line);
    const rest = token.text.slice(at + 1).trim();
    if (rest === "") {
      const next = tokens[i + 1];
      if (next && next.indent > indent) {
        const parsed = parseBlock(tokens, i + 1, next.indent);
        assign(target, key, parsed.value, token.line);
        i = parsed.next;
      } else {
        assign(target, key, null, token.line);
        i += 1;
      }
      continue;
    }
    assign(target, key, readValue(rest, token.line), token.line);
    i += 1;
  }
  return i;
}

function parseSequence(tokens: Token[], start: number, indent: number): { value: Container[]; next: number } {
  const items: Container[] = [];
  let i = start;
  while (i < tokens.length && tokens[i].indent === indent && isSequenceItem(tokens[i].text)) {
    const token = tokens[i];
    const rest = token.text === "-" ? "" : token.text.slice(2).trim();
    if (rest === "") {
      const next = tokens[i + 1];
      if (next && next.indent > indent) {
        const parsed = parseBlock(tokens, i + 1, next.indent);
        items.push(parsed.value);
        i = parsed.next;
      } else {
        items.push(null);
        i += 1;
      }
      continue;
    }
    const at = keySplit(rest);
    if (at < 0) {
      items.push(readValue(rest, token.line));
      i += 1;
      continue;
    }
    // `- key: value` opens a mapping whose remaining keys sit on later lines.
    const item: Record<string, Container> = {};
    const key = String(parseScalar(rest.slice(0, at), token.line) ?? "");
    const value = rest.slice(at + 1).trim();
    if (value === "") {
      const next = tokens[i + 1];
      if (next && next.indent > indent) {
        const parsed = parseBlock(tokens, i + 1, next.indent);
        assign(item, key, parsed.value, token.line);
        i = parsed.next;
      } else {
        assign(item, key, null, token.line);
        i += 1;
      }
    } else {
      assign(item, key, readValue(value, token.line), token.line);
      i += 1;
    }
    while (i < tokens.length && tokens[i].indent > indent) {
      const next = tokens[i];
      if (isSequenceItem(next.text)) {
        throw new YamlLiteError(`unexpected list item inside a mapping (indent ${next.indent})`, next.line);
      }
      i = readMappingEntries(tokens, i, next.indent, item);
    }
    items.push(item);
  }
  return { value: items, next: i };
}

function parseBlock(tokens: Token[], start: number, indent: number): { value: Container; next: number } {
  const token = tokens[start];
  if (!token) return { value: null, next: start };
  if (token.indent !== indent) {
    throw new YamlLiteError(`inconsistent indentation (expected ${indent}, found ${token.indent})`, token.line);
  }
  if (isSequenceItem(token.text)) return parseSequence(tokens, start, indent);
  if (keySplit(token.text) < 0) return { value: readValue(token.text, token.line), next: start + 1 };
  const root: Record<string, Container> = {};
  const next = readMappingEntries(tokens, start, indent, root);
  return { value: root, next };
}

/** Parses a YAML subset. Throws {@link YamlLiteError} on anything unsupported. */
export function parseYaml(source: string): Container {
  const tokens = tokenize(source);
  if (tokens.length === 0) return {};
  const { value, next } = parseBlock(tokens, 0, tokens[0].indent);
  if (next < tokens.length) {
    const token = tokens[next];
    throw new YamlLiteError(`unexpected content after the document (indent ${token.indent})`, token.line);
  }
  return value;
}

/** Convenience wrapper: parses and guarantees the document is a mapping. */
export function parseYamlMap(source: string): Record<string, Container> {
  const value = parseYaml(source);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new YamlLiteError("the pipeline config must be a mapping at the top level", 1);
  }
  return value as Record<string, Container>;
}
