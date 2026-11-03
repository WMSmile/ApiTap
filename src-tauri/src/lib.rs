// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use tauri::Manager;

/// A key/value pair used for query params, headers and form body.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeyValue {
    key: String,
    value: String,
    enabled: bool,
}

/// The request payload sent from the frontend.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RequestPayload {
    method: String,
    url: String,
    params: Vec<KeyValue>,
    headers: Vec<KeyValue>,
    body_type: String,
    body_raw: String,
    body_form: Vec<KeyValue>,
    auth_type: String,
    auth_bearer: String,
    auth_user: String,
    auth_pass: String,
    auth_key: String,
    auth_value: String,
    auth_add_to: String,
    follow_redirects: bool,
    timeout_ms: u64,
}

/// The response returned to the frontend.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResponsePayload {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
    time_ms: u128,
    size: usize,
    ok: bool,
}

/// Perform an HTTP request from Rust (avoids webview CORS restrictions).
#[tauri::command]
async fn send_request(payload: RequestPayload) -> Result<ResponsePayload, String> {
    let timeout = Duration::from_millis(payload.timeout_ms.clamp(1, 600_000));
    let client = reqwest::Client::builder()
        .timeout(timeout)
        .redirect(if payload.follow_redirects {
            reqwest::redirect::Policy::limited(20)
        } else {
            reqwest::redirect::Policy::none()
        })
        .build()
        .map_err(|e| e.to_string())?;

    let method = match payload.method.to_uppercase().as_str() {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "PATCH" => reqwest::Method::PATCH,
        "DELETE" => reqwest::Method::DELETE,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        other => return Err(format!("不支持的请求方法: {other}")),
    };

    // Append enabled query params to the URL.
    let mut url = url::Url::parse(&payload.url).map_err(|e| format!("无效的 URL: {e}"))?;
    {
        let mut qp = url.query_pairs_mut();
        for p in payload.params.iter().filter(|p| p.enabled && !p.key.is_empty()) {
            qp.append_pair(&p.key, &p.value);
        }
    }

    // Apply API-key-in-query authentication (mutates the URL before building).
    if payload.auth_type.as_str() == "apikey" && payload.auth_add_to == "query" {
        let key = payload.auth_key.trim();
        let value = payload.auth_value.trim();
        if !key.is_empty() {
            url.query_pairs_mut().append_pair(key, value);
        }
    }

    let mut rb = client.request(method.clone(), url.as_str());

    // Apply headers.
    let mut has_content_type = false;
    for h in payload
        .headers
        .iter()
        .filter(|h| h.enabled && !h.key.is_empty())
    {
        if h.key.to_lowercase() == "content-type" {
            has_content_type = true;
        }
        rb = rb.header(&h.key, &h.value);
    }

    // Apply authentication (header-based).
    match payload.auth_type.as_str() {
        "bearer" => {
            let token = payload.auth_bearer.trim();
            if !token.is_empty() {
                rb = rb.header("Authorization", format!("Bearer {token}"));
            }
        }
        "basic" => {
            let cred = format!("{}:{}", payload.auth_user, payload.auth_pass);
            let enc = base64::engine::general_purpose::STANDARD.encode(cred);
            rb = rb.header("Authorization", format!("Basic {enc}"));
        }
        "apikey" => {
            if payload.auth_add_to != "query" {
                let key = payload.auth_key.trim();
                let value = payload.auth_value.trim();
                if !key.is_empty() {
                    rb = rb.header(key, value);
                }
            }
        }
        _ => {}
    }

    // Apply request body.
    if matches!(
        method,
        reqwest::Method::POST
            | reqwest::Method::PUT
            | reqwest::Method::PATCH
            | reqwest::Method::DELETE
    ) {
        match payload.body_type.as_str() {
            "json" => {
                if !has_content_type {
                    rb = rb.header("Content-Type", "application/json");
                }
                rb = rb.body(payload.body_raw);
            }
            "text" => {
                if !has_content_type {
                    rb = rb.header("Content-Type", "text/plain");
                }
                rb = rb.body(payload.body_raw);
            }
            "form" => {
                if !has_content_type {
                    rb = rb.header("Content-Type", "application/x-www-form-urlencoded");
                }
                let mut ser = url::form_urlencoded::Serializer::new(String::new());
                for f in payload
                    .body_form
                    .iter()
                    .filter(|f| f.enabled && !f.key.is_empty())
                {
                    ser.append_pair(&f.key, &f.value);
                }
                rb = rb.body(ser.finish());
            }
            _ => {}
        }
    }

    let start = Instant::now();
    let resp = rb.send().await.map_err(|e| e.to_string())?;
    let elapsed = start.elapsed();

    let status = resp.status();
    let status_code = status.as_u16();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers: Vec<(String, String)> = resp
        .headers()
        .iter()
        .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let body = String::from_utf8_lossy(&bytes).to_string();
    let size = bytes.len();

    Ok(ResponsePayload {
        status: status_code,
        status_text,
        headers,
        body,
        time_ms: elapsed.as_millis(),
        size,
        ok: status.is_success(),
    })
}

/// Read a persisted JSON document from the app config directory.
#[tauri::command]
fn get_data(app: tauri::AppHandle, key: String) -> Option<String> {
    let dir = app.path().app_config_dir().ok()?;
    let path = dir.join(format!("{}.json", sanitize_key(&key)));
    std::fs::read_to_string(path).ok()
}

/// Persist a JSON document into the app config directory.
#[tauri::command]
fn set_data(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", sanitize_key(&key)));
    std::fs::write(path, value).map_err(|e| e.to_string())
}

/// Write an exported document to the app config `exports` directory.
/// Returns the absolute path of the written file.
#[tauri::command]
fn export_file(app: tauri::AppHandle, name: String, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let path = dir.join(if safe.is_empty() { "export.txt".into() } else { safe });
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Only allow safe characters in storage filenames.
fn sanitize_key(key: &str) -> String {
    key.chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            send_request,
            get_data,
            set_data,
            export_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
