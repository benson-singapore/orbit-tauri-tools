use std::sync::Mutex;

use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

struct RuntimeState {
    url: Mutex<Option<String>>,
}

#[tauri::command]
fn get_runtime_url(state: State<RuntimeState>) -> Result<Option<String>, String> {
    state
        .url
        .lock()
        .map(|guard| guard.clone())
        .map_err(|e| e.to_string())
}

fn parse_ready_line(line: &str) -> Option<u16> {
    let line = line.trim();
    let rest = line.strip_prefix("ORBIT_READY port=")?;
    rest.parse().ok()
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

fn spawn_runtime(app: &tauri::AppHandle) -> Result<(), String> {
    let sidecar = app
        .shell()
        .sidecar("orbit-runtime")
        .map_err(|e| format!("sidecar config: {e}"))?;

    let (mut rx, _child) = sidecar
        .spawn()
        .map_err(|e| format!("sidecar spawn: {e}"))?;

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(line_bytes) = event {
                let line = String::from_utf8_lossy(&line_bytes);
                for part in line.split('\n') {
                    let part = part.trim();
                    if part.is_empty() {
                        continue;
                    }
                    if let Some(port) = parse_ready_line(part) {
                        let url = format!("http://127.0.0.1:{port}");
                        if let Some(state) = app_handle.try_state::<RuntimeState>() {
                            if let Ok(mut guard) = state.url.lock() {
                                *guard = Some(url.clone());
                            }
                        }
                        let _ = app_handle.emit("runtime-ready", url);
                    }
                }
            }
        }
    });

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(RuntimeState {
            url: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![get_runtime_url])
        .setup(|app| {
            if !use_external_runtime(app.handle()) {
                spawn_runtime(app.handle())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
