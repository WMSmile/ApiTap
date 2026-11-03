import type { HttpMethod, KeyValue, RequestConfig } from "../types";
import { defaultConfig, newKeyValue } from "./format";

export interface ImportedRequest {
  name: string;
  config: RequestConfig;
}

export interface ImportedCollection {
  name: string;
  requests: ImportedRequest[];
}

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

/** Split a URL into its base part and its query pairs. */
function splitUrlQuery(url: string): {
  base: string;
  params: { key: string; value: string }[];
} {
  const idx = url.indexOf("?");
  if (idx < 0) return { base: url, params: [] };
  const base = url.slice(0, idx);
  const params = url
    .slice(idx + 1)
    .split("&")
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      if (i < 0) return { key: decodeURIComponent(pair), value: "" };
      return {
        key: decodeURIComponent(pair.slice(0, i)),
        value: decodeURIComponent(pair.slice(i + 1)),
      };
    });
  return { base, params };
}

/**
 * Put the URL into the config and move its query string into the params list,
 * so the backend never appends the same query twice.
 */
function applyUrlWithParams(
  config: RequestConfig,
  urlText: string,
  extra: { key: string; value: string; enabled?: boolean }[] = []
): void {
  const { base, params } = splitUrlQuery(urlText);
  config.url = base;
  for (const p of params) {
    config.params.push(newKeyValue(p.key, p.value));
  }
  for (const p of extra) {
    if (!p.key) continue;
    if (config.params.some((x) => x.key === p.key)) continue;
    config.params.push(newKeyValue(p.key, p.value, p.enabled ?? true));
  }
}

function applyBody(
  config: RequestConfig,
  raw: string | undefined,
  mime?: string
): void {
  if (!raw) return;
  const type = (mime || "").toLowerCase();
  if (type.includes("json")) {
    config.body.type = "json";
    config.body.raw = raw;
  } else if (type.includes("x-www-form-urlencoded")) {
    config.body.type = "form";
    for (const pair of raw.split("&")) {
      if (!pair) continue;
      const idx = pair.indexOf("=");
      const k = idx >= 0 ? pair.slice(0, idx) : pair;
      const v = idx >= 0 ? pair.slice(idx + 1) : "";
      config.body.form.push(
        newKeyValue(decodeURIComponent(k), decodeURIComponent(v))
      );
    }
  } else if (looksLikeJson(raw)) {
    config.body.type = "json";
    config.body.raw = raw;
  } else {
    config.body.type = "text";
    config.body.raw = raw;
  }
}

/* ------------------------------------------------------------------ *
 * Postman Collection v2.x
 * ------------------------------------------------------------------ */

interface PostmanHeader {
  key?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string | string[];
  path?: string | string[];
  query?: { key?: string; value?: string; disabled?: boolean }[];
}

interface PostmanRequest {
  method?: string;
  header?: PostmanHeader[];
  url?: string | PostmanUrl;
  body?: {
    mode?: string;
    raw?: string;
    urlencoded?: { key?: string; value?: string; disabled?: boolean }[];
    formdata?: { key?: string; value?: string; disabled?: boolean }[];
  };
  auth?: {
    type?: string;
    bearer?: { token?: string };
    basic?: { username?: string; password?: string };
    apikey?: { key?: string; value?: string; in?: string };
  };
}

interface PostmanItem {
  name?: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
}

function postmanUrl(raw: string | PostmanUrl | undefined): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  if (raw.raw) return raw.raw;
  const protocol = raw.protocol ? `${raw.protocol}://` : "";
  const host = Array.isArray(raw.host) ? raw.host.join(".") : raw.host || "";
  const path = Array.isArray(raw.path) ? raw.path.join("/") : raw.path || "";
  return `${protocol}${host}${path ? `/${path}` : ""}`;
}

function postmanAuth(
  config: RequestConfig,
  auth?: PostmanRequest["auth"]
): void {
  if (!auth || !auth.type) return;
  switch (auth.type) {
    case "bearer":
      config.auth.type = "bearer";
      config.auth.bearer = auth.bearer?.token ?? "";
      break;
    case "basic":
      config.auth.type = "basic";
      config.auth.user = auth.basic?.username ?? "";
      config.auth.pass = auth.basic?.password ?? "";
      break;
    case "apikey":
      config.auth.type = "apikey";
      config.auth.key = auth.apikey?.key ?? "";
      config.auth.value = auth.apikey?.value ?? "";
      config.auth.addTo = auth.apikey?.in === "query" ? "query" : "header";
      break;
    default:
      break;
  }
}

function postmanToConfig(req: PostmanRequest): RequestConfig {
  const config = defaultConfig();
  config.method = normalizeMethod(req.method);

  config.headers = [];
  for (const h of req.header || []) {
    const key = h.key ?? h.name ?? "";
    if (!key) continue;
    config.headers.push(newKeyValue(key, h.value ?? "", !h.disabled));
  }

  const url = typeof req.url === "object" ? req.url : undefined;
  const queryList = (url?.query || []).map((q) => ({
    key: q.key ?? "",
    value: q.value ?? "",
    enabled: !q.disabled,
  }));
  applyUrlWithParams(config, postmanUrl(req.url), queryList);

  const body = req.body;
  if (body) {
    if (body.mode === "raw") {
      const isJson = looksLikeJson(body.raw ?? "");
      config.body.type = isJson ? "json" : "text";
      config.body.raw = body.raw ?? "";
    } else if (body.mode === "urlencoded" || body.mode === "formdata") {
      config.body.type = "form";
      const list = body.mode === "urlencoded" ? body.urlencoded : body.formdata;
      for (const f of list || []) {
        if (!f.key) continue;
        config.body.form.push(newKeyValue(f.key, f.value ?? "", !f.disabled));
      }
    }
  }

  postmanAuth(config, req.auth);
  return config;
}

function walkPostman(items: PostmanItem[], out: ImportedRequest[]): void {
  for (const item of items || []) {
    if (Array.isArray(item.item) && item.item.length > 0) {
      walkPostman(item.item, out);
    } else if (item.request) {
      out.push({
        name: item.name || item.request.method || "Request",
        config: postmanToConfig(item.request),
      });
    }
  }
}

export function parsePostman(data: any): ImportedCollection {
  const info = data.info ?? {};
  const requests: ImportedRequest[] = [];
  walkPostman(data.item || [], requests);
  return { name: info.name || "Postman Collection", requests };
}

/* ------------------------------------------------------------------ *
 * HAR (HTTP Archive)
 * ------------------------------------------------------------------ */

export function parseHar(data: any): ImportedCollection {
  const entries = data?.log?.entries ?? [];
  const requests: ImportedRequest[] = [];
  for (const entry of entries) {
    const req = entry?.request;
    if (!req) continue;
    const config = defaultConfig();
    config.method = normalizeMethod(req.method);
    config.headers = [];
    for (const h of req.headers || []) {
      if (!h?.name) continue;
      config.headers.push(newKeyValue(h.name, h.value ?? ""));
    }
    const queryList = (req.queryString || []).map((q: any) => ({
      key: q?.name ?? "",
      value: q?.value ?? "",
    }));
    applyUrlWithParams(config, req.url || "", queryList);
    if (req.postData) {
      if (
        Array.isArray(req.postData.params) &&
        req.postData.params.length > 0
      ) {
        config.body.type = "form";
        for (const p of req.postData.params) {
          if (!p?.name) continue;
          config.body.form.push(newKeyValue(p.name, p.value ?? ""));
        }
      } else {
        applyBody(config, req.postData.text, req.postData.mimeType);
      }
    }
    const url = req.url || "";
    const label =
      url.split("?")[0].split("/").filter(Boolean).pop() || req.method;
    requests.push({ name: `${req.method} ${label}`, config });
  }
  return { name: "HAR Import", requests };
}

/* ------------------------------------------------------------------ *
 * OpenAPI / Swagger
 * ------------------------------------------------------------------ */

const PATH_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
];

export function parseOpenApi(data: any): ImportedCollection {
  const info = data.info ?? {};
  const name = info.title || "OpenAPI";

  const servers: any[] = Array.isArray(data.servers) ? data.servers : [];
  let base = servers[0]?.url ?? "";
  if (!base && data.host) {
    const scheme = Array.isArray(data.schemes) ? data.schemes[0] : "https";
    base = `${scheme}://${Array.isArray(data.host) ? data.host.join(".") : data.host}`;
    if (data.basePath) base += data.basePath;
  }
  base = base.replace(/\/$/, "");

  const requests: ImportedRequest[] = [];
  for (const [path, item] of Object.entries(data.paths || {})) {
    if (!item || typeof item !== "object") continue;
    const sharedParams: any[] = (item as any).parameters || [];
    for (const method of PATH_METHODS) {
      const op = (item as any)[method];
      if (!op) continue;
      const config = defaultConfig();
      config.method = normalizeMethod(method);

      let url = `${base}${path}`;
      const allParams = [...sharedParams, ...(op.parameters || [])];
      for (const p of allParams) {
        if (!p?.name) continue;
        if (p.in === "path") {
          const sample =
            p.example ?? p.schema?.example ?? p.schema?.default ?? "1";
          url = url.split(`{${p.name}}`).join(String(sample));
        }
      }
      config.url = url;

      for (const p of allParams) {
        if (!p?.name) continue;
        if (p.in === "header") {
          config.headers.push(newKeyValue(p.name, String(p.example ?? "")));
        } else if (p.in === "query") {
          config.params.push(newKeyValue(p.name, String(p.example ?? "")));
        }
      }

      const jsonSchema = op.requestBody?.content?.["application/json"];
      if (jsonSchema?.example) {
        config.body.type = "json";
        config.body.raw = JSON.stringify(jsonSchema.example, null, 2);
      } else if (jsonSchema?.schema) {
        config.body.type = "json";
        config.body.raw = JSON.stringify(sampleFromSchema(jsonSchema.schema), null, 2);
      }

      requests.push({
        name: op.summary || op.operationId || `${method.toUpperCase()} ${path}`,
        config,
      });
    }
  }
  return { name, requests };
}

/** Build a tiny placeholder body from a JSON schema so the request is runnable. */
function sampleFromSchema(schema: any): unknown {
  if (!schema || typeof schema !== "object") return {};
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  const type = schema.type;
  if (type === "object" || schema.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema.properties || {})) {
      obj[key] = sampleFromSchema(value);
    }
    return obj;
  }
  if (type === "array") {
    return [sampleFromSchema(schema.items)];
  }
  if (type === "integer" || type === "number") return 0;
  if (type === "boolean") return false;
  if (type === "string") return "";
  return {};
}
