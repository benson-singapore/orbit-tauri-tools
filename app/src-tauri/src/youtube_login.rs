use tauri::{
    webview::{NewWindowResponse, WebviewWindowBuilder},
    AppHandle, Emitter, Manager, WebviewUrl, WindowEvent,
};
use url::Url;

pub const YOUTUBE_LOGIN_LABEL: &str = "youtube-login";

fn is_google_auth_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    if host == "accounts.google.com"
        || host == "accounts.googleusercontent.com"
        || host == "accounts.youtube.com"
        || host == "myaccount.google.com"
    {
        return true;
    }

    if let Some(rest) = host.strip_prefix("accounts.google.") {
        let parts: Vec<&str> = rest.split('.').collect();
        let is_cc = |s: &str| s.len() == 2 && s.chars().all(|c| c.is_ascii_alphabetic());
        return match parts.as_slice() {
            [tld] => is_cc(tld),
            [sld, tld] => matches!(*sld, "co" | "com" | "net" | "org") && is_cc(tld),
            _ => false,
        };
    }

    false
}

fn is_youtube_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    host == "youtube.com"
        || host == "www.youtube.com"
        || host == "m.youtube.com"
        || host.ends_with(".youtube.com")
}

fn should_keep_in_login_window(url: &Url) -> bool {
    match url.host_str() {
        Some(host) => is_youtube_host(host) || is_google_auth_host(host),
        None => false,
    }
}

#[tauri::command]
pub fn open_youtube_login_window(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(YOUTUBE_LOGIN_LABEL) {
        existing.show().map_err(|e| e.to_string())?;
        existing.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let app_handle = app.clone();
    let login_url: Url = "https://www.youtube.com/signin?action_handle_signin=true&app=desktop&hl=zh-CN"
        .parse()
        .map_err(|e| format!("invalid login url: {e}"))?;

    let window = WebviewWindowBuilder::new(&app, YOUTUBE_LOGIN_LABEL, WebviewUrl::External(login_url))
        .title("登录 YouTube")
        .inner_size(520.0, 780.0)
        .center()
        .resizable(true)
        .on_new_window(move |url, _features| {
            if should_keep_in_login_window(&url) {
                if let Some(window) = app_handle.get_webview_window(YOUTUBE_LOGIN_LABEL) {
                    let _ = window.navigate(url);
                }
            }
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| e.to_string())?;

    let app_for_close = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            emit_youtube_login_closed(&app_for_close);
        }
    });

    Ok(())
}

pub fn emit_youtube_login_closed(app: &AppHandle) {
    let _ = app.emit("youtube-login-closed", ());
}
