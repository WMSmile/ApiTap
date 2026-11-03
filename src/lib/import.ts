import type { HttpMethod, KeyValue, RequestConfig } from "../types";
import { defaultConfig, newKeyValue } from "./format";
import {
  parseHar,
  parseOpenApi,
  parsePostman,
  type ImportedRequest,
} from "./importer";

const METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
];

function normalizeMethod(m?: string): HttpMethod {
  const v = (m || "GET").toUpperCase();
  return (METHODS as string[]).includes(v) ? (v as HttpMethod) : "GET";
}

function stripQuotes(s: string): string {
  s = s.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/** Detect whether a raw body is JSON so the editor can switch to JSON mode. */
function looksLikeJson(s: string): boolean {
  const t = s.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === " " || c === "\t" || c === "\n") {
      if (cur) {
        tokens.push(cur);
        cur = "";
      }
    } else {
      cur += c;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function applyAuthHeader(
  config: RequestConfig,
  key: string,
  value: string
): boolean {
  if (key.toLowerCase() !== "authorization") return false;
  if (value.startsWith("Bearer ")) {
    config.auth.type = "bearer";
    config.auth.bearer = value.slice(7).trim();
    return true;
  }
  if (value.startsWith("Basic ")) {
    try {
      const decoded = atob(value.slice(6).trim());
      const idx = decoded.indexOf(":");
      config.auth.type = "basic";
      config.auth.user = idx >= 0 ? decoded.slice(0, idx) : decoded;
      config.auth.pass = idx >= 0 ? decoded.slice(idx + 1) : "";
    } catch {
      /* ignore malformed basic auth */
    }
    return true;
  }
  return false;
}

function parseCurl(input: string): RequestConfig {
  const config = defaultConfig();
  const text = input.replace(/\\\s*\n\s*/g, " ").trim();
  const tokens = tokenize(text);

  let method: HttpMethod | null = null;
  let url = "";
  const headers: KeyValue[] = [];
  const forms: KeyValue[] = [];
  let body = "";
  let bodyType: "none" | "raw" = "none";
  let hasForm = false;
  let follow = false;

  const addHeader = (raw?: string) => {
    if (!raw) return;
    const idx = raw.indexOf(":");
    if (idx < 0) return;
    const k = raw.slice(0, idx).trim();
    const v = raw.slice(idx + 1).trim();
    if (!applyAuthHeader(config, k, v)) headers.push(newKeyValue(k, v));
  };
  const addForm = (raw?: string) => {
    if (!raw) return;
    const idx = raw.indexOf("=");
    if (idx < 0) {
      forms.push(newKeyValue(raw.trim(), ""));
    } else {
      forms.push(newKeyValue(raw.slice(0, idx).trim(), raw.slice(idx + 1).trim()));
    }
    hasForm = true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === "curl") continue;

    if (tok.startsWith("--")) {
      const eq = tok.indexOf("=");
      let name = eq >= 0 ? tok.slice(2, eq) : tok.slice(2);
      let val = eq >= 0 ? tok.slice(eq + 1) : "";
      const next = () => (val || (val = tokens[++i]));
      switch (name) {
        case "request":
          method = normalizeMethod(val || tokens[++i]);
          break;
        case "url":
          next();
          url = val;
          break;
        case "header":
          next();
          addHeader(val);
          break;
        case "data":
        case "data-raw":
        case "data-binary":
        case "data-urlencode":
          next();
          body = val;
          bodyType = "raw";
          break;
        case "form":
          next();
          addForm(val);
          break;
        case "user": {
          next();
          const [u, p] = val.split(":");
          config.auth.type = "basic";
          config.auth.user = u;
          config.auth.pass = p ?? "";
          break;
        }
        case "cookie":
          next();
          addHeader(`Cookie: ${val}`);
          break;
        case "location":
          follow = true;
          break;
        default:
          break;
      }
    } else if (tok.startsWith("-")) {
      const flags = tok.slice(1);
      for (let j = 0; j < flags.length; j++) {
        const c = flags[j];
        if (c === "X") method = normalizeMethod(tokens[++i]);
        else if (c === "d") {
          body = tokens[++i];
          bodyType = "raw";
        } else if (c === "H") addHeader(tokens[++i]);
        else if (c === "u") {
          const up = tokens[++i].split(":");
          config.auth.type = "basic";
          config.auth.user = up[0];
          config.auth.pass = up[1] ?? "";
        } else if (c === "b") addHeader(`Cookie: ${tokens[++i]}`);
        else if (c === "F" || c === "f") addForm(tokens[++i]);
        else if (c === "L") follow = true;
        else if (c === "G" && !method) method = "GET";
        // -k / -I and others are ignored intentionally
      }
    } else if (!url && /^https?:\/\//i.test(tok)) {
      url = tok;
    }
  }

  config.method = method ?? (hasForm || bodyType === "raw" ? "POST" : "GET");
  config.url = stripQuotes(url);
  config.headers = headers;
  config.followRedirects = follow;
  if (hasForm) {
    config.body.type = "form";
    config.body.form = forms;
  } else if (bodyType === "raw") {
    config.body.type = looksLikeJson(body) ? "json" : "text";
    config.body.raw = body;
  } else {
    config.body.type = "none";
  }
  return config;
}

function parseRawHttp(input: string): RequestConfig {
  const config = defaultConfig();
  const lines = input.split(/\r?\n/);
  const first = lines.shift() || "";
  const m = first.match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(\S+)(?:\s+HTTP\/\d(?:\.\d)?)?/i
  );
  if (m) {
    config.method = normalizeMethod(m[1]);
    config.url = m[2];
  }
  let i = 0;
  // Start from a clean header list so the imported request has no leftovers.
  config.headers = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      break;
    }
    const idx = line.indexOf(":");
    if (idx >= 0) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (!applyAuthHeader(config, k, v)) config.headers.push(newKeyValue(k, v));
    }
  }
  const body = lines.slice(i).join("\n").trim();
  if (body) {
    config.body.type = looksLikeJson(body) ? "json" : "text";
    config.body.raw = body;
  }
  return config;
}

/** Parse a pasted cURL command or raw HTTP request into a RequestConfig. */
export function parseRequest(input: string): RequestConfig {
  // Tolerate a leading shell prompt such as `$ curl ...`
  const text = input.trim().replace(/^\$\s+/, "").trim();
  if (/^curl(\s|$)/i.test(text)) return parseCurl(text);
  if (
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+HTTP\/\d(\.\d)?$/im.test(
      text
    )
  ) {
    return parseRawHttp(text);
  }
  if (/^https?:\/\//i.test(text)) {
    const c = defaultConfig();
    c.url = text;
    return c;
  }
  // Fallback: try as curl anyway
  return parseCurl(text);
}

/* ------------------------------------------------------------------ *
 * Format detection dispatcher
 * ------------------------------------------------------------------ */

export type ImportFormat = "curl" | "http" | "url" | "postman" | "har" | "openapi";

export type ImportResult =
  | { kind: "single"; format: ImportFormat; config: RequestConfig }
  | {
      kind: "collection";
      format: ImportFormat;
      name: string;
      requests: ImportedRequest[];
    };

/** Detect the pasted content type and parse it accordingly. */
export function parseImport(input: string): ImportResult {
  const text = input.trim().replace(/^\$\s+/, "").trim();
  if (!text) return { kind: "single", format: "curl", config: defaultConfig() };

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const data = JSON.parse(text);
      if (data?.log?.entries) {
        const col = parseHar(data);
        return {
          kind: "collection",
          format: "har",
          name: col.name,
          requests: col.requests,
        };
      }
      if (data?.openapi || data?.swagger) {
        const col = parseOpenApi(data);
        return {
          kind: "collection",
          format: "openapi",
          name: col.name,
          requests: col.requests,
        };
      }
      if (data?.item && (data.info || data.variable)) {
        const col = parsePostman(data);
        return {
          kind: "collection",
          format: "postman",
          name: col.name,
          requests: col.requests,
        };
      }
    } catch {
      /* not valid JSON, fall through to text parsing */
    }
  }

  if (/^curl(\s|$)/i.test(text)) {
    return { kind: "single", format: "curl", config: parseCurl(text) };
  }
  if (
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+HTTP\/\d(\.\d)?$/im.test(
      text
    )
  ) {
    return {
      kind: "single",
      format: "http",
      config: parseRawHttp(text),
    };
  }
  if (/^https?:\/\//i.test(text)) {
    const c = defaultConfig();
    c.url = text;
    return { kind: "single", format: "url", config: c };
  }
  return { kind: "single", format: "curl", config: parseCurl(text) };
}
