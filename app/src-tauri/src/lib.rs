use std::collections::HashMap;
use std::net::TcpListener;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

mod youtube_login;

use youtube_login::open_youtube_login_window;

struct RuntimeState {
    url: Mutex<Option<String>>,
    sidecar: Mutex<Option<CommandChild>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeHttpRequest {
    url: String,
    method: Option<String>,
    body: Option<String>,
    headers: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeHttpResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

fn local_http_client() -> Result<tauri_plugin_http::reqwest::Client, String> {
    static CLIENT: OnceLock<Result<tauri_plugin_http::reqwest::Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            tauri_plugin_http::reqwest::Client::builder()
                .no_proxy()
                .build()
                .map_err(|e| e.to_string())
        })
        .clone()
}

#[tauri::command]
fn get_runtime_url(state: State<RuntimeState>) -> Result<Option<String>, String> {
    state
        .url
        .lock()
        .map(|guard| guard.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_platform() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

#[tauri::command]
async fn runtime_http(req: RuntimeHttpRequest) -> Result<RuntimeHttpResponse, String> {
    let client = local_http_client()?;
    let method = tauri_plugin_http::reqwest::Method::from_bytes(
        req.method.as_deref().unwrap_or("GET").as_bytes(),
    )
    .map_err(|e| format!("bad method: {e}"))?;

    let mut builder = client.request(method, &req.url);
    if let Some(headers) = req.headers {
        for (key, value) in headers {
            builder = builder.header(key, value);
        }
    }
    if let Some(body) = req.body {
        builder = builder.body(body);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("runtime http request failed: {e}"))?;

    let status = response.status().as_u16();
    let mut headers = HashMap::new();
    for (key, value) in response.headers() {
        if let Ok(value) = value.to_str() {
            headers.insert(key.to_string(), value.to_string());
        }
    }
    let body = response
        .text()
        .await
        .map_err(|e| format!("runtime http read body failed: {e}"))?;

    Ok(RuntimeHttpResponse {
        status,
        headers,
        body,
    })
}

fn parse_ready_line(line: &str) -> Option<u16> {
    let line = line.trim();
    let rest = line.strip_prefix("ORBIT_READY port=")?;
    rest.parse().ok()
}

fn reserve_local_port() -> Result<u16, String> {
    let listener =
        TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind ephemeral port: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("local_addr: {e}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn clear_runtime_url(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.url.lock() {
            *guard = None;
        }
    }
}

fn kill_existing_sidecar(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.sidecar.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn respawn_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    kill_existing_sidecar(app);
    clear_runtime_url(app);
    spawn_runtime(app)
}

fn set_runtime_url(app: &tauri::AppHandle, port: u16) {
    let url = format!("http://127.0.0.1:{port}");
    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.url.lock() {
            *guard = Some(url.clone());
        }
    }
    let _ = app.emit("runtime-ready", url);
}

fn bundled_plugins_dir(app: &tauri::AppHandle) -> Option<String> {
    app.path()
        .resolve("plugins", BaseDirectory::Resource)
        .ok()
        .filter(|p| p.is_dir())
        .map(|p| p.to_string_lossy().into_owned())
}

fn use_external_runtime(app: &tauri::AppHandle) -> bool {
    let url = std::env::var("ORBIT_RUNTIME_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let Some(url) = url else {
        return false;
    };

    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.url.lock() {
            *guard = Some(url.clone());
        }
    }
    eprintln!("[orbit] using external runtime at {url} (ORBIT_RUNTIME_URL)");
    let _ = app.emit("runtime-ready", url);
    true
}

async fn monitor_sidecar(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    app_handle: tauri::AppHandle,
) {
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line_bytes) => {
                let line = String::from_utf8_lossy(&line_bytes);
                for part in line.split('\n') {
                    let part = part.trim();
                    if part.is_empty() {
                        continue;
                    }
                    if let Some(ready_port) = parse_ready_line(part) {
                        set_runtime_url(&app_handle, ready_port);
                    }
                }
            }
            CommandEvent::Stderr(line_bytes) => {
                eprintln!(
                    "[orbit-runtime] {}",
                    String::from_utf8_lossy(&line_bytes).trim()
                );
            }
            CommandEvent::Terminated(payload) => {
                eprintln!(
                    "[orbit] sidecar exited: code={:?} signal={:?}",
                    payload.code, payload.signal
                );
                clear_runtime_url(&app_handle);
                let app = app_handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(1));
                    if let Err(err) = respawn_runtime(&app) {
                        eprintln!("[orbit] sidecar restart failed: {err}");
                    }
                });
                return;
            }
            CommandEvent::Error(err) => {
                eprintln!("[orbit] sidecar error: {err}");
            }
            _ => {}
        }
    }
}

fn wait_for_runtime_ready(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    app_handle: tauri::AppHandle,
) -> Result<u16, String> {
    tauri::async_runtime::block_on(async move {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
        loop {
            tokio::select! {
                _ = tokio::time::sleep_until(deadline) => {
                    return Err("runtime startup timeout (30s)".to_string());
                }
                event = rx.recv() => {
                    match event {
                        None => return Err("runtime channel closed".to_string()),
                        Some(CommandEvent::Stdout(bytes)) => {
                            let line = String::from_utf8_lossy(&bytes);
                            for part in line.split('\n') {
                                if let Some(port) = parse_ready_line(part.trim()) {
                                    tauri::async_runtime::spawn(monitor_sidecar(rx, app_handle));
                                    return Ok(port);
                                }
                            }
                        }
                        Some(CommandEvent::Stderr(bytes)) => {
                            eprintln!(
                                "[orbit-runtime] {}",
                                String::from_utf8_lossy(&bytes).trim()
                            );
                        }
                        Some(CommandEvent::Terminated(payload)) => {
                            return Err(format!(
                                "runtime exited before ready: code={:?}",
                                payload.code
                            ));
                        }
                        Some(CommandEvent::Error(err)) => {
                            return Err(format!("runtime error: {err}"));
                        }
                        _ => {}
                    }
                }
            }
        }
    })
}

fn spawn_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    kill_existing_sidecar(app);

    let port = reserve_local_port()?;

    let mut sidecar = app
        .shell()
        .sidecar("orbit-runtime")
        .map_err(|e| format!("sidecar config: {e}"))?
        .env("ORBIT_PORT", port.to_string());

    if let Some(plugins_dir) = bundled_plugins_dir(app) {
        eprintln!("[orbit] ORBIT_PLUGINS_DIR={plugins_dir}");
        sidecar = sidecar.env("ORBIT_PLUGINS_DIR", plugins_dir);
    }

    let (rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("sidecar spawn: {e}"))?;

    if let Some(state) = app.try_state::<RuntimeState>() {
        if let Ok(mut guard) = state.sidecar.lock() {
            *guard = Some(child);
        }
    }

    let ready_port = wait_for_runtime_ready(rx, app.clone())?;
    eprintln!("[orbit] runtime ready on 127.0.0.1:{ready_port}");
    set_runtime_url(app, ready_port);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .manage(RuntimeState {
            url: Mutex::new(None),
            sidecar: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_url,
            get_app_platform,
            runtime_http,
            open_youtube_login_window
        ])
        .setup(|app| {
            if !use_external_runtime(app.handle()) {
                spawn_runtime(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
