// Shared types for ApiTap.

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export interface KeyValue {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export type BodyType = "none" | "json" | "text" | "form";

export interface RequestBody {
  type: BodyType;
  raw: string;
  form: KeyValue[];
}

export type AuthType = "none" | "bearer" | "basic" | "apikey";

export interface AuthConfig {
  type: AuthType;
  bearer: string;
  user: string;
  pass: string;
  key: string;
  value: string;
  addTo: "header" | "query";
}

export interface RequestConfig {
  method: HttpMethod;
  url: string;
  params: KeyValue[];
  headers: KeyValue[];
  body: RequestBody;
  auth: AuthConfig;
  followRedirects: boolean;
  timeoutMs: number;
}

export interface RequestItem {
  id: string;
  name: string;
  config: RequestConfig;
}

export interface Collection {
  id: string;
  name: string;
  requests: RequestItem[];
  /** Nested sub-collections (folders). */
  children: Collection[];
}

export interface HistoryItem {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  status: number;
  ok: boolean;
  timeMs: number;
  createdAt: number;
  config: RequestConfig;
  /** Set when the request failed before a response was received. */
  error?: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: KeyValue[];
}

export interface ResponseData {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
  timeMs: number;
  size: number;
  ok: boolean;
}

/** One entry of a right-click context menu. */
export interface ContextMenuItem {
  label?: string;
  divider?: boolean;
  danger?: boolean;
  disabled?: boolean;
  action?: () => void;
}
