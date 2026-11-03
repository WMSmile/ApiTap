import { invoke } from "@tauri-apps/api/core";
import type { Environment, RequestConfig, ResponseData } from "../types";
import { resolveConfig } from "./format";

interface RustKeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

interface RustPayload {
  method: string;
  url: string;
  params: RustKeyValue[];
  headers: RustKeyValue[];
  bodyType: string;
  bodyRaw: string;
  bodyForm: RustKeyValue[];
  authType: string;
  authBearer: string;
  authUser: string;
  authPass: string;
  authKey: string;
  authValue: string;
  authAddTo: string;
  followRedirects: boolean;
  timeoutMs: number;
}

function toRustKV(list: { key: string; value: string; enabled: boolean }[]): RustKeyValue[] {
  return list.map((k) => ({ key: k.key, value: k.value, enabled: k.enabled }));
}

/** Build the payload understood by the Rust `send_request` command. */
export function buildPayload(
  config: RequestConfig,
  env: Environment | null
): RustPayload {
  const c = resolveConfig(config, env);
  return {
    method: c.method,
    url: c.url,
    params: toRustKV(c.params),
    headers: toRustKV(c.headers),
    bodyType: c.body.type,
    bodyRaw: c.body.raw,
    bodyForm: toRustKV(c.body.form),
    authType: c.auth.type,
    authBearer: c.auth.bearer,
    authUser: c.auth.user,
    authPass: c.auth.pass,
    authKey: c.auth.key,
    authValue: c.auth.value,
    authAddTo: c.auth.addTo,
    followRedirects: c.followRedirects,
    timeoutMs: c.timeoutMs,
  };
}

/** Send an HTTP request via the Rust backend. */
export async function sendRequest(
  config: RequestConfig,
  env: Environment | null
): Promise<ResponseData> {
  return invoke<ResponseData>("send_request", {
    payload: buildPayload(config, env),
  });
}

export async function getData(key: string): Promise<string | null> {
  return invoke<string | null>("get_data", { key });
}

export async function setData(key: string, value: string): Promise<void> {
  await invoke("set_data", { key, value });
}
