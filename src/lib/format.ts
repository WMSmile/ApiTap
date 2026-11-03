import type {
  AuthConfig,
  Environment,
  KeyValue,
  RequestConfig,
  RequestBody,
} from "../types";

/** Generate a unique id (UUID when available, fallback otherwise). */
export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Deep clone a plain JSON-serializable value. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function newKeyValue(key = "", value = "", enabled = true): KeyValue {
  return { id: uid(), key, value, enabled };
}

export function defaultBody(): RequestBody {
  return { type: "none", raw: "", form: [] };
}

export function defaultAuth(): AuthConfig {
  return {
    type: "none",
    bearer: "",
    user: "",
    pass: "",
    key: "",
    value: "",
    addTo: "header",
  };
}

export function defaultConfig(): RequestConfig {
  return {
    method: "GET",
    url: "",
    params: [],
    headers: [newKeyValue("Content-Type", "application/json", false)],
    body: defaultBody(),
    auth: defaultAuth(),
    followRedirects: true,
    timeoutMs: 30000,
  };
}

/**
 * Resolve `{{variable}}` placeholders inside a string using the active
 * environment variables.
 */
export function resolve(text: string, env: Environment | null): string {
  if (!env || !text) return text;
  const map = new Map<string, string>();
  for (const v of env.variables) {
    if (v.key) map.set(v.key, v.value);
  }
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) =>
    map.has(key) ? (map.get(key) as string) : `{{${key}}}`
  );
}

/** Apply environment variable resolution to a full request config. */
export function resolveConfig(
  config: RequestConfig,
  env: Environment | null
): RequestConfig {
  const r = (s: string) => resolve(s, env);
  return {
    method: config.method,
    url: r(config.url),
    params: config.params.map((p) => ({
      ...p,
      key: r(p.key),
      value: r(p.value),
    })),
    headers: config.headers.map((h) => ({
      ...h,
      key: r(h.key),
      value: r(h.value),
    })),
    body: {
      type: config.body.type,
      raw: r(config.body.raw),
      form: config.body.form.map((f) => ({
        ...f,
        key: r(f.key),
        value: r(f.value),
      })),
    },
    auth: {
      ...config.auth,
      bearer: r(config.auth.bearer),
      user: r(config.auth.user),
      pass: r(config.auth.pass),
      key: r(config.auth.key),
      value: r(config.auth.value),
    },
    followRedirects: config.followRedirects,
    timeoutMs: config.timeoutMs,
  };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Try to parse a string as JSON. */
export function tryParseJson(text: string): {
  ok: boolean;
  value: unknown;
} {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: null };
  }
}

/**
 * Syntax highlight a JSON string into HTML. The input is expected to be
 * valid JSON (pretty-printed by the caller).
 */
export function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "json-number";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        cls = "json-boolean";
      } else if (/null/.test(match)) {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
