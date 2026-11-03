import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Collection, RequestConfig } from "../types";

/** Only characters that are safe for a file name. */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return cleaned || "request";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function enabledPairs(list: { key: string; value: string; enabled: boolean }[]) {
  return list.filter((i) => i.enabled && i.key);
}

function withQuery(config: RequestConfig): string {
  const q = enabledPairs(config.params)
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join("&");
  if (!q) return config.url;
  return `${config.url}${config.url.includes("?") ? "&" : "?"}${q}`;
}

/** Serialize a request as a cURL command. */
export function toCurl(config: RequestConfig): string {
  const parts: string[] = ["curl", "-X", config.method];
  for (const h of enabledPairs(config.headers)) {
    parts.push("-H", shellQuote(`${h.key}: ${h.value}`));
  }
  const auth = config.auth;
  if (auth.type === "bearer" && auth.bearer) {
    parts.push("-H", shellQuote(`Authorization: Bearer ${auth.bearer}`));
  } else if (auth.type === "basic" && auth.user) {
    parts.push("-u", shellQuote(`${auth.user}:${auth.pass}`));
  } else if (auth.type === "apikey" && auth.key && auth.addTo === "header") {
    parts.push("-H", shellQuote(`${auth.key}: ${auth.value}`));
  }
  if (config.body.type === "form") {
    for (const f of enabledPairs(config.body.form)) {
      parts.push("--data-urlencode", shellQuote(`${f.key}=${f.value}`));
    }
  } else if (config.body.type !== "none" && config.body.raw) {
    parts.push("--data-raw", shellQuote(config.body.raw));
  }
  let url = withQuery(config);
  if (auth.type === "apikey" && auth.addTo === "query" && auth.key) {
    url +=
      (url.includes("?") ? "&" : "?") +
      `${encodeURIComponent(auth.key)}=${encodeURIComponent(auth.value)}`;
  }
  parts.push(shellQuote(url));
  if (config.followRedirects) parts.push("--location");
  return parts.join(" ");
}

/** Serialize a request as a raw HTTP message. */
export function toRawHttp(config: RequestConfig): string {
  const lines: string[] = [`${config.method} ${withQuery(config)} HTTP/1.1`];
  for (const h of enabledPairs(config.headers)) {
    lines.push(`${h.key}: ${h.value}`);
  }
  const auth = config.auth;
  if (auth.type === "bearer" && auth.bearer) {
    lines.push(`Authorization: Bearer ${auth.bearer}`);
  } else if (auth.type === "basic" && auth.user) {
    lines.push(`Authorization: Basic ${btoa(`${auth.user}:${auth.pass}`)}`);
  }
  lines.push("");
  if (config.body.type === "form") {
    lines.push(
      enabledPairs(config.body.form)
        .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
        .join("&")
    );
  } else if (config.body.type !== "none" && config.body.raw) {
    lines.push(config.body.raw);
  }
  return lines.join("\n");
}

/** Serialize a request as a Postman v2.1 request object. */
export function toPostmanRequest(config: RequestConfig, name: string) {
  const header = enabledPairs(config.headers).map((h) => ({
    key: h.key,
    value: h.value,
    type: "text",
  }));

  const query = enabledPairs(config.params);
  let url: unknown = config.url;
  if (query.length > 0) {
    const parts = config.url.split("/");
    url = {
      raw: config.url,
      protocol: parts[0] ?? "",
      host: parts[2] ?? "",
      path: parts.slice(3).join("/"),
      query: query.map((p) => ({ key: p.key, value: p.value })),
    };
  }

  let body: Record<string, unknown> | undefined;
  if (config.body.type === "json") {
    body = {
      mode: "raw",
      raw: config.body.raw,
      options: { raw: { language: "json" } },
    };
  } else if (config.body.type === "text") {
    body = { mode: "raw", raw: config.body.raw };
  } else if (config.body.type === "form") {
    body = {
      mode: "urlencoded",
      urlencoded: enabledPairs(config.body.form).map((f) => ({
        key: f.key,
        value: f.value,
        type: "text",
      })),
    };
  }

  const request: Record<string, unknown> = {
    method: config.method,
    header,
    url,
    description: name,
  };
  if (body) request.body = body;

  const auth = config.auth;
  if (auth.type === "bearer") {
    request.auth = {
      type: "bearer",
      bearer: [{ key: "token", value: auth.bearer, type: "string" }],
    };
  } else if (auth.type === "basic") {
    request.auth = {
      type: "basic",
      basic: [
        { key: "username", value: auth.user, type: "string" },
        { key: "password", value: auth.pass, type: "string" },
      ],
    };
  } else if (auth.type === "apikey") {
    request.auth = {
      type: "apikey",
      apikey: [
        { key: "key", value: auth.key, type: "string" },
        { key: "value", value: auth.value, type: "string" },
        { key: "in", value: auth.addTo, type: "string" },
      ],
    };
  }
  return request;
}

/** Serialize a whole collection as a Postman v2.1 collection. */
export function toPostmanCollection(collection: Collection) {
  return {
    info: {
      name: collection.name,
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: collection.requests.map((r) => ({
      name: r.name,
      request: toPostmanRequest(r.config, r.name),
      response: [],
    })),
  };
}

/** Write a document into the app exports folder and reveal it in the file manager. */
export async function exportFile(name: string, content: string): Promise<string> {
  const path = await invoke<string>("export_file", { name, content });
  try {
    await revealItemInDir(path);
  } catch {
    /* revealing is best-effort only */
  }
  return path;
}

/** Copy text to the system clipboard. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
