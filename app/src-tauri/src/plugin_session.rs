use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

use cookie::Cookie;
use tauri::{
    webview::{NewWindowResponse, WebviewWindowBuilder},
    AppHandle, Emitter, LogicalSize, Manager, WebviewUrl, WebviewWindow, WindowEvent,
};
use tokio::sync::{oneshot, watch};
use url::Url;

pub const PLUGIN_SESSION_READY_EVENT: &str = "plugin-session-ready";
pub const PLUGIN_SESSION_CLOSED_EVENT: &str = "plugin-session-closed";

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const POLL_MAX_ATTEMPTS: usize = 360;
const NAV_SETTLE_DELAY: Duration = Duration::from_millis(800);
const SESSION_WINDOW_WIDTH: f64 = 520.0;
const SESSION_WINDOW_HEIGHT: f64 = 780.0;

static FETCH_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSessionReadyPayload {
    pub plugin_id: String,
    pub cookie: String,
    pub user_agent: String,
}

pub struct PluginSessionRegistry {
    completed: Mutex<HashMap<String, Arc<AtomicBool>>>,
    waiters: Mutex<HashMap<String, watch::Sender<Option<PluginSessionReadyPayload>>>>,
    origins: Mutex<HashMap<String, String>>,
}

impl PluginSessionRegistry {
    pub fn new() -> Self {
        Self {
            completed: Mutex::new(HashMap::new()),
            waiters: Mutex::new(HashMap::new()),
            origins: Mutex::new(HashMap::new()),
        }
    }

    fn register_waiter(
        &self,
        plugin_id: &str,
    ) -> watch::Receiver<Option<PluginSessionReadyPayload>> {
        let (tx, rx) = watch::channel(None);
        self.waiters
            .lock()
            .unwrap()
            .insert(plugin_id.to_string(), tx);
        rx
    }

    fn clear_waiter(&self, plugin_id: &str) {
        self.waiters.lock().unwrap().remove(plugin_id);
    }

    fn notify_waiter(&self, plugin_id: &str, payload: PluginSessionReadyPayload) {
        if let Some(tx) = self.waiters.lock().unwrap().get(plugin_id) {
            let _ = tx.send(Some(payload));
        }
    }

    fn begin(&self, plugin_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        self.completed
            .lock()
            .unwrap()
            .insert(plugin_id.to_string(), flag.clone());
        flag
    }

    fn get(&self, plugin_id: &str) -> Option<Arc<AtomicBool>> {
        self.completed.lock().unwrap().get(plugin_id).cloned()
    }

    fn finish(&self, plugin_id: &str) {
        self.completed.lock().unwrap().remove(plugin_id);
    }

    pub fn remember_origin(&self, plugin_id: &str, origin_url: &str) {
        self.origins
            .lock()
            .unwrap()
            .insert(plugin_id.to_string(), origin_url.to_string());
    }

    pub fn origin_for(&self, plugin_id: &str) -> Option<String> {
        self.origins.lock().unwrap().get(plugin_id).cloned()
    }
}

fn session_label(plugin_id: &str) -> String {
    format!("plugin-session-{plugin_id}")
}

fn present_verification_window(window: &WebviewWindow) -> Result<(), String> {
    window
        .set_size(LogicalSize::new(SESSION_WINDOW_WIDTH, SESSION_WINDOW_HEIGHT))
        .map_err(|e| e.to_string())?;
    window
        .set_resizable(true)
        .map_err(|e| e.to_string())?;
    window
        .set_title("网站验证")
        .map_err(|e| e.to_string())?;
    window.center().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

pub struct WebviewFetchResult {
    pub status: u16,
    pub content_type: String,
    pub body_base64: String,
}

fn origin_base_from_url(url: &Url) -> Url {
    let mut origin = url.clone();
    origin.set_path("");
    origin.set_query(None);
    origin.set_fragment(None);
    origin
}

fn host_matches_origin(host: &str, origin: &Url) -> bool {
    let host = host.trim_start_matches('.').to_ascii_lowercase();
    let Some(origin_host) = origin.host_str() else {
        return false;
    };
    let origin_host = origin_host.to_ascii_lowercase();
    if host == origin_host {
        return true;
    }
    if host.ends_with(".cloudflare.com") || host.ends_with(".challenges.cloudflare.com") {
        return true;
    }
    host.ends_with(&format!(".{origin_host}"))
}

fn is_on_target_origin(url: &Url, origin: &Url) -> bool {
    url.host_str()
        .map(|host| host_matches_origin(host, origin))
        .unwrap_or(false)
        && !is_cloudflare_challenge_url(url)
}

fn is_cloudflare_challenge_url(url: &Url) -> bool {
    let host = url.host_str().unwrap_or("").to_ascii_lowercase();
    if host.contains("challenges.cloudflare.com") {
        return true;
    }
    let path = url.path().to_ascii_lowercase();
    path.contains("/cdn-cgi/challenge-platform") || path.contains("/cdn-cgi/challenge")
}

fn should_keep_in_session_window(url: &Url, origin: &Url) -> bool {
    match url.host_str() {
        Some(host) => host_matches_origin(host, origin),
        None => false,
    }
}

fn collect_cookies_for_origin(
    window: &WebviewWindow,
    origin: &Url,
) -> Result<Vec<Cookie<'static>>, String> {
    let mut by_name: HashMap<String, Cookie<'static>> = HashMap::new();
    if let Ok(cookies) = window.cookies_for_url(origin.clone()) {
        for cookie in cookies {
            by_name.insert(cookie.name().to_string(), cookie);
        }
    }

    if let Ok(cookies) = window.cookies() {
        for cookie in cookies {
            let domain = cookie
                .domain()
                .map(|value| value.trim_start_matches('.').to_string());
            let domain_matches = domain
                .as_deref()
                .map(|domain| host_matches_origin(domain, origin))
                .unwrap_or(false);
            if domain_matches {
                by_name.entry(cookie.name().to_string()).or_insert(cookie);
            }
        }
    }

    Ok(by_name.into_values().collect())
}

fn clear_cookies_for_origin(window: &WebviewWindow, origin: &Url) -> Result<(), String> {
    let cookies = collect_cookies_for_origin(window, origin)?;
    let count = cookies.len();
    for cookie in cookies {
        let _ = window.delete_cookie(cookie);
    }
    eprintln!(
        "[plugin-session] cleared site cookies origin={} count={count}",
        origin.as_str()
    );
    Ok(())
}

fn cookie_header(cookies: &[Cookie<'_>]) -> String {
    cookies
        .iter()
        .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
        .collect::<Vec<_>>()
        .join("; ")
}

fn has_cf_clearance(cookies: &[Cookie<'_>], cookie_header: &str) -> bool {
    cookie_header.contains("cf_clearance=")
        || cookies.iter().any(|cookie| cookie.name() == "cf_clearance")
}

fn has_usable_site_session(cookies: &[Cookie<'_>], cookie_header: &str) -> bool {
    if has_cf_clearance(cookies, cookie_header) {
        return true;
    }
    if only_challenge_cookies(cookies) {
        return false;
    }
    cookies.iter().any(|cookie| {
        let name = cookie.name();
        name == "gequbao_session" || name.starts_with("server_session_")
    })
}

fn only_challenge_cookies(cookies: &[Cookie<'_>]) -> bool {
    !cookies.is_empty()
        && cookies.iter().all(|cookie| {
            let name = cookie.name();
            name == "cf_chl_rc_ni" || name.starts_with("cf_chl_")
        })
}

async fn read_document_cookies(window: &WebviewWindow) -> String {
    let (tx, rx) = oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let tx_for_callback = tx.clone();
    let callback = move |value: String| {
        let parsed = serde_json::from_str::<String>(&value).unwrap_or(value);
        if let Some(sender) = tx_for_callback.lock().unwrap().take() {
            let _ = sender.send(parsed);
        }
    };

    if window
        .eval_with_callback("document.cookie || ''", callback)
        .is_err()
    {
        return String::new();
    }

    match tokio::time::timeout(Duration::from_secs(2), rx).await {
        Ok(Ok(value)) => value,
        _ => String::new(),
    }
}

fn merge_cookie_headers(primary: &str, secondary: &str) -> String {
    let mut pairs: HashMap<String, String> = HashMap::new();
    for source in [primary, secondary] {
        for part in source.split(';') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            if let Some((name, value)) = part.split_once('=') {
                let name = name.trim();
                if !name.is_empty() {
                    pairs.insert(name.to_string(), value.trim().to_string());
                }
            }
        }
    }
    pairs
        .into_iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ")
}

fn log_session_state(plugin_id: &str, phase: &str, url: Option<&Url>, cookie: &str, ready: bool) {
    let url_text = url.map(|u| u.as_str()).unwrap_or("-");
    let cookie_names: Vec<&str> = cookie
        .split(';')
        .filter_map(|part| part.split('=').next().map(str::trim))
        .filter(|name| !name.is_empty())
        .collect();
    eprintln!(
        "[plugin-session] plugin={plugin_id} phase={phase} url={url_text} ready={ready} cookie_len={} cookie_names={cookie_names:?}",
        cookie.len(),
    );
}

async fn read_webview_user_agent(window: &WebviewWindow) -> String {
    let (tx, rx) = oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let tx_for_callback = tx.clone();
    let callback = move |value: String| {
        let parsed = serde_json::from_str::<String>(&value).unwrap_or(value);
        if let Some(sender) = tx_for_callback.lock().unwrap().take() {
            let _ = sender.send(parsed);
        }
    };

    if window
        .eval_with_callback("navigator.userAgent", callback)
        .is_err()
    {
        return String::new();
    }

    match tokio::time::timeout(Duration::from_secs(2), rx).await {
        Ok(Ok(ua)) if !ua.trim().is_empty() => ua,
        _ => String::new(),
    }
}

async fn read_webview_url(window: &WebviewWindow) -> Option<Url> {
    let (tx, rx) = oneshot::channel::<String>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let tx_for_callback = tx.clone();
    let callback = move |value: String| {
        let parsed = serde_json::from_str::<String>(&value).unwrap_or(value);
        if let Some(sender) = tx_for_callback.lock().unwrap().take() {
            let _ = sender.send(parsed);
        }
    };

    if window
        .eval_with_callback("window.location.href", callback)
        .is_err()
    {
        return None;
    }

    match tokio::time::timeout(Duration::from_secs(2), rx).await {
        Ok(Ok(value)) => value.parse().ok(),
        _ => None,
    }
}

async fn page_past_cloudflare(window: &WebviewWindow) -> bool {
    let (tx, rx) = oneshot::channel::<bool>();
    let tx = Arc::new(Mutex::new(Some(tx)));
    let tx_for_callback = tx.clone();
    let js = r#"
        (function () {
          const title = document.title || '';
          if (/just a moment|checking your browser|attention required|请稍候|正在验证/i.test(title)) {
            return false;
          }
          if (document.querySelector('#challenge-form, .cf-browser-verification, #cf-challenge-running')) {
            return false;
          }
          return document.readyState === 'complete';
        })()
    "#;
    let callback = move |value: String| {
        let parsed: bool = serde_json::from_str(&value).unwrap_or(false);
        if let Some(sender) = tx_for_callback.lock().unwrap().take() {
            let _ = sender.send(parsed);
        }
    };

    if window.eval_with_callback(js, callback).is_err() {
        return false;
    }

    match tokio::time::timeout(Duration::from_secs(2), rx).await {
        Ok(Ok(result)) => result,
        _ => false,
    }
}

async fn session_is_ready(
    window: &WebviewWindow,
    origin: &Url,
    force: bool,
) -> Result<bool, String> {
    let store_cookies = collect_cookies_for_origin(window, origin)?;
    let store_cookie = cookie_header(&store_cookies);
    let document_cookie = read_document_cookies(window).await;
    let cookie = merge_cookie_headers(&store_cookie, &document_cookie);
    let current_url = read_webview_url(window).await;

    if has_cf_clearance(&store_cookies, &cookie) {
        log_session_state(
            plugin_id_from_window(window),
            "ready-cf-clearance",
            current_url.as_ref(),
            &cookie,
            true,
        );
        return Ok(true);
    }

    if force && has_usable_site_session(&store_cookies, &cookie) {
        log_session_state(
            plugin_id_from_window(window),
            "ready-force",
            current_url.as_ref(),
            &cookie,
            true,
        );
        return Ok(true);
    }

    let on_target = current_url
        .as_ref()
        .map(|current| is_on_target_origin(current, origin))
        .unwrap_or(false);

    if !on_target {
        log_session_state(
            plugin_id_from_window(window),
            "wait-url",
            current_url.as_ref(),
            &cookie,
            false,
        );
        return Ok(false);
    }

    if !page_past_cloudflare(window).await {
        log_session_state(
            plugin_id_from_window(window),
            "wait-page",
            current_url.as_ref(),
            &cookie,
            false,
        );
        return Ok(false);
    }

    if has_usable_site_session(&store_cookies, &cookie) {
        log_session_state(
            plugin_id_from_window(window),
            "ready-session",
            current_url.as_ref(),
            &cookie,
            true,
        );
        return Ok(true);
    }

    log_session_state(
        plugin_id_from_window(window),
        "wait-cookie",
        current_url.as_ref(),
        &cookie,
        false,
    );
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::{has_usable_site_session, only_challenge_cookies};
    use cookie::Cookie;

    #[test]
    fn challenge_cookies_do_not_complete_session() {
        let cookies = vec![
            Cookie::parse("cf_chl_rc_ni=1").unwrap(),
            Cookie::parse("cf_chl_prog=s").unwrap(),
        ];

        assert!(only_challenge_cookies(&cookies));
        assert!(!has_usable_site_session(&cookies, "cf_chl_rc_ni=1; cf_chl_prog=s"));
    }

    #[test]
    fn cf_clearance_completes_session() {
        let cookies = vec![Cookie::parse("cf_clearance=token").unwrap()];

        assert!(has_usable_site_session(&cookies, "cf_clearance=token"));
    }
}

fn plugin_id_from_window(window: &WebviewWindow) -> &str {
    window
        .label()
        .strip_prefix("plugin-session-")
        .unwrap_or(window.label())
}

async fn capture_session_from_window(
    window: &WebviewWindow,
    plugin_id: &str,
    origin: &Url,
) -> Result<PluginSessionReadyPayload, String> {
    let store_cookies = collect_cookies_for_origin(window, origin)?;
    let store_cookie = cookie_header(&store_cookies);
    let document_cookie = read_document_cookies(window).await;
    let cookie = merge_cookie_headers(&store_cookie, &document_cookie);
    let user_agent = read_webview_user_agent(window).await;

    eprintln!(
        "[plugin-session] capture plugin={plugin_id} cookie_len={} ua_len={} has_cf_clearance={} cookie_names={:?}",
        cookie.len(),
        user_agent.len(),
        cookie.contains("cf_clearance="),
        cookie
            .split(';')
            .filter_map(|part| part.split('=').next().map(str::trim))
            .filter(|name| !name.is_empty())
            .collect::<Vec<_>>(),
    );

    Ok(PluginSessionReadyPayload {
        plugin_id: plugin_id.to_string(),
        cookie,
        user_agent,
    })
}

async fn try_complete_session(
    app: &AppHandle,
    registry: &PluginSessionRegistry,
    plugin_id: &str,
    origin: &Url,
    force: bool,
) -> Result<Option<PluginSessionReadyPayload>, String> {
    let label = session_label(plugin_id);
    let Some(window) = app.get_webview_window(&label) else {
        return Ok(None);
    };

    if !session_is_ready(&window, origin, force).await? {
        return Ok(None);
    }

    if let Some(flag) = registry.get(plugin_id) {
        if flag
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Ok(None);
        }
    }

    let payload = capture_session_from_window(&window, plugin_id, origin).await?;
    eprintln!("[plugin-session] complete plugin={plugin_id} hiding webview for fetch");
    registry.notify_waiter(plugin_id, payload.clone());
    let _ = window.hide();
    registry.finish(plugin_id);
    app.emit(PLUGIN_SESSION_READY_EVENT, payload.clone())
        .map_err(|e| e.to_string())?;
    Ok(Some(payload))
}

fn schedule_completion_check(
    app: AppHandle,
    registry: Arc<PluginSessionRegistry>,
    plugin_id: String,
    origin: Url,
    completed: Arc<AtomicBool>,
    delay: Duration,
) {
    tauri::async_runtime::spawn(async move {
        if completed.load(Ordering::Relaxed) {
            return;
        }
        tokio::time::sleep(delay).await;
        if completed.load(Ordering::Relaxed) {
            return;
        }
        if let Ok(Some(_)) = try_complete_session(&app, &registry, &plugin_id, &origin, false).await
        {
            completed.store(true, Ordering::SeqCst);
        }
    });
}

fn spawn_session_poll(
    app: AppHandle,
    registry: Arc<PluginSessionRegistry>,
    plugin_id: String,
    origin: Url,
    completed: Arc<AtomicBool>,
) {
    tauri::async_runtime::spawn(async move {
        let label = session_label(&plugin_id);
        for _ in 0..POLL_MAX_ATTEMPTS {
            if completed.load(Ordering::Relaxed) {
                return;
            }
            tokio::time::sleep(POLL_INTERVAL).await;
            if completed.load(Ordering::Relaxed) {
                return;
            }
            if app.get_webview_window(&label).is_none() {
                registry.finish(&plugin_id);
                return;
            }
            if let Ok(Some(_)) =
                try_complete_session(&app, &registry, &plugin_id, &origin, false).await
            {
                completed.store(true, Ordering::SeqCst);
                return;
            }
        }
    });
}

#[tauri::command]
pub async fn acquire_plugin_session(
    app: AppHandle,
    registry: tauri::State<'_, Arc<PluginSessionRegistry>>,
    plugin_id: String,
    url: String,
) -> Result<PluginSessionReadyPayload, String> {
    let mut waiter = registry.inner().register_waiter(&plugin_id);
    let cleanup_url = url.clone();
    if let Err(err) =
        open_plugin_session_window(app.clone(), registry.clone(), plugin_id.clone(), url, None)
            .await
    {
        registry.inner().clear_waiter(&plugin_id);
        return Err(err);
    }

    let label = session_label(&plugin_id);
    for _ in 0..POLL_MAX_ATTEMPTS {
        if let Some(payload) = waiter.borrow().clone() {
            registry.inner().clear_waiter(&plugin_id);
            return Ok(payload);
        }
        if app.get_webview_window(&label).is_none() {
            registry.inner().clear_waiter(&plugin_id);
            if let Some(payload) = waiter.borrow().clone() {
                return Ok(payload);
            }
            return Err("验证窗口已关闭".into());
        }
        tokio::time::sleep(POLL_INTERVAL).await;
        if waiter.has_changed().unwrap_or(false) {
            if let Some(payload) = waiter.borrow_and_update().clone() {
                registry.inner().clear_waiter(&plugin_id);
                return Ok(payload);
            }
        }
    }

    registry.inner().clear_waiter(&plugin_id);
    if let Some(window) = app.get_webview_window(&label) {
        if let Ok(page_url) = cleanup_url.parse::<Url>() {
            let origin = origin_base_from_url(&page_url);
            let _ = clear_cookies_for_origin(&window, &origin);
        }
        let _ = window.close();
    }
    registry.inner().finish(&plugin_id);
    Err("验证超时，请重试".into())
}

#[tauri::command]
pub async fn open_plugin_session_window(
    app: AppHandle,
    registry: tauri::State<'_, Arc<PluginSessionRegistry>>,
    plugin_id: String,
    url: String,
    manual: Option<bool>,
) -> Result<(), String> {
    let manual = manual.unwrap_or(false);
    let label = session_label(&plugin_id);
    let start_url: Url = url
        .parse()
        .map_err(|e| format!("invalid session url: {e}"))?;
    let origin = origin_base_from_url(&start_url);
    registry
        .inner()
        .remember_origin(&plugin_id, start_url.as_str());

    if let Some(existing) = app.get_webview_window(&label) {
        present_verification_window(&existing)?;
        if !manual {
            clear_cookies_for_origin(&existing, &origin)?;
        }
        existing
            .navigate(start_url.clone())
            .map_err(|e| e.to_string())?;
        if manual {
            registry.inner().finish(&plugin_id);
            return Ok(());
        }
        let flag = registry
            .get(&plugin_id)
            .unwrap_or_else(|| registry.begin(&plugin_id));
        schedule_completion_check(
            app.clone(),
            registry.inner().clone(),
            plugin_id.clone(),
            origin,
            flag,
            NAV_SETTLE_DELAY,
        );
        return Ok(());
    }

    let completed = registry.begin(&plugin_id);

    let app_for_new_window = app.clone();
    let origin_for_new_window = origin.clone();
    let app_for_nav = app.clone();
    let registry_for_nav = registry.inner().clone();
    let plugin_id_for_nav = plugin_id.clone();
    let origin_for_nav = origin.clone();
    let completed_for_nav = completed.clone();

    let window = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(start_url.clone()))
        .title("网站验证")
        .inner_size(SESSION_WINDOW_WIDTH, SESSION_WINDOW_HEIGHT)
        .center()
        .resizable(true)
        .on_navigation(move |next_url| {
            if !manual && is_on_target_origin(next_url, &origin_for_nav) {
                schedule_completion_check(
                    app_for_nav.clone(),
                    registry_for_nav.clone(),
                    plugin_id_for_nav.clone(),
                    origin_for_nav.clone(),
                    completed_for_nav.clone(),
                    NAV_SETTLE_DELAY,
                );
            }
            true
        })
        .on_new_window(move |next_url, _features| {
            if should_keep_in_session_window(&next_url, &origin_for_new_window) {
                if let Some(window) = app_for_new_window.get_webview_window(&label) {
                    let _ = window.navigate(next_url);
                }
            }
            NewWindowResponse::Deny
        })
        .build()
        .map_err(|e| e.to_string())?;

    if !manual {
        clear_cookies_for_origin(&window, &origin)?;
    }

    let app_for_close = app.clone();
    let plugin_id_for_close = plugin_id.clone();
    let registry_for_close = registry.inner().clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::CloseRequested { .. }) {
            registry_for_close.finish(&plugin_id_for_close);
            let _ = app_for_close.emit(PLUGIN_SESSION_CLOSED_EVENT, plugin_id_for_close.clone());
        }
    });

    if !manual {
        spawn_session_poll(
            app.clone(),
            registry.inner().clone(),
            plugin_id.clone(),
            origin.clone(),
            completed.clone(),
        );

        schedule_completion_check(
            app,
            registry.inner().clone(),
            plugin_id,
            origin,
            completed,
            NAV_SETTLE_DELAY * 2,
        );
    } else {
        registry.inner().finish(&plugin_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn complete_plugin_session_window(
    app: AppHandle,
    registry: tauri::State<'_, Arc<PluginSessionRegistry>>,
    plugin_id: String,
    origin_url: String,
    force: Option<bool>,
) -> Result<PluginSessionReadyPayload, String> {
    let origin: Url = origin_url
        .parse()
        .map_err(|e| format!("invalid origin url: {e}"))?;
    let origin = origin_base_from_url(&origin);

    let force_complete = force.unwrap_or(false);
    match try_complete_session(&app, registry.inner(), &plugin_id, &origin, force_complete).await? {
        Some(payload) => Ok(payload),
        None if app.get_webview_window(&session_label(&plugin_id)).is_none() => {
            Err("验证窗口未打开".into())
        }
        None => Err("未检测到验证 Cookie，请先在页面完成 Cloudflare 验证".into()),
    }
}

#[tauri::command]
pub async fn close_plugin_session_window(
    app: AppHandle,
    registry: tauri::State<'_, Arc<PluginSessionRegistry>>,
    plugin_id: String,
) -> Result<(), String> {
    let label = session_label(&plugin_id);
    registry.finish(&plugin_id);
    if let Some(window) = app.get_webview_window(&label) {
        window.close().map_err(|e| e.to_string())?;
    }
    app.emit(PLUGIN_SESSION_CLOSED_EVENT, plugin_id)
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn ensure_session_webview(
    app: &AppHandle,
    registry: &PluginSessionRegistry,
    plugin_id: &str,
) -> Result<WebviewWindow, String> {
    let label = session_label(plugin_id);
    if let Some(window) = app.get_webview_window(&label) {
        wait_for_webview_ready(&window, plugin_id).await?;
        return Ok(window);
    }

    let origin_url = registry
        .origin_for(plugin_id)
        .ok_or_else(|| format!("session webview missing for plugin {plugin_id}"))?;
    let page_url: Url = origin_url
        .parse()
        .map_err(|e| format!("invalid stored session url: {e}"))?;

    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(page_url.clone()))
        .title("网站验证")
        .visible(false)
        .inner_size(1.0, 1.0)
        .build()
        .map_err(|e| e.to_string())?;

    wait_for_webview_ready(&window, plugin_id).await?;
    eprintln!("[plugin-session] restored hidden webview plugin={plugin_id} url={page_url}");
    Ok(window)
}

async fn wait_for_webview_ready(window: &WebviewWindow, plugin_id: &str) -> Result<(), String> {
    for _ in 0..60 {
        if page_past_cloudflare(window).await {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Err(format!(
        "webview session page not ready for plugin {plugin_id}"
    ))
}

async fn eval_fetch_in_webview(
    window: &WebviewWindow,
    method: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
) -> Result<WebviewFetchResult, String> {
    let fetch_key = format!(
        "__orbitWebviewFetch{}",
        FETCH_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let payload = serde_json::json!({
        "method": method,
        "url": url,
        "headers": headers,
        "body": body,
    });
    let js = format!(
        r#"
        (function () {{
          const key = {fetch_key};
          try {{
            const req = {payload};
            window[key] = {{ pending: true }};
            const xhr = new XMLHttpRequest();
            xhr.open(req.method, req.url, true);
            xhr.withCredentials = true;
            xhr.responseType = 'arraybuffer';
            const headers = req.headers || {{}};
            for (const key of Object.keys(headers)) {{
              if (/^(cookie|user-agent|host|origin|referer|content-length)$/i.test(key)) continue;
              xhr.setRequestHeader(key, headers[key]);
            }}
            const finish = value => {{ window[key] = value; }};
            xhr.onload = () => {{
              const bytes = new Uint8Array(xhr.response || []);
              let binary = '';
              const chunk = 0x8000;
              for (let i = 0; i < bytes.length; i += chunk) {{
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
              }}
              finish({{
                status: xhr.status,
                contentType: xhr.getResponseHeader('content-type') || '',
                bodyBase64: btoa(binary)
              }});
            }};
            xhr.onerror = () => finish({{ error: 'webview xhr error' }});
            xhr.ontimeout = () => finish({{ error: 'webview xhr timeout' }});
            xhr.send(req.body ? req.body : null);
            return true;
          }} catch (err) {{
            window[key] = {{ error: String(err) }};
            return false;
          }}
        }})()
        "#,
        fetch_key = serde_json::to_string(&fetch_key).map_err(|err| err.to_string())?,
        payload = payload
    );

    window
        .eval_with_callback(js, |_| {})
        .map_err(|e| format!("webview fetch eval failed: {e}"))?;

    let poll_js = format!(
        "(function () {{ const value = window[{fetch_key}]; if (!value || value.pending) return JSON.stringify({{pending:true}}); delete window[{fetch_key}]; return JSON.stringify(value); }})()",
        fetch_key = serde_json::to_string(&fetch_key).map_err(|err| err.to_string())?,
    );
    let deadline = tokio::time::Instant::now() + Duration::from_secs(120);
    let raw = loop {
        if tokio::time::Instant::now() >= deadline {
            let _ = window.eval(&format!(
                "delete window[{fetch_key}]",
                fetch_key = serde_json::to_string(&fetch_key).unwrap_or_default()
            ));
            return Err("webview fetch timeout".into());
        }
        let (tx, rx) = oneshot::channel::<String>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_for_callback = tx.clone();
        window
            .eval_with_callback(&poll_js, move |value| {
                let parsed = serde_json::from_str::<String>(&value).unwrap_or(value);
                if let Some(sender) = tx_for_callback.lock().unwrap().take() {
                    let _ = sender.send(parsed);
                }
            })
            .map_err(|e| format!("webview fetch poll failed: {e}"))?;
        let value = tokio::time::timeout(Duration::from_secs(2), rx)
            .await
            .map_err(|_| "webview fetch poll timeout".to_string())?
            .map_err(|_| "webview fetch poll channel closed".to_string())?;
        let pending = serde_json::from_str::<serde_json::Value>(&value)
            .ok()
            .and_then(|value| value.get("pending").and_then(|pending| pending.as_bool()))
            .unwrap_or(false);
        if !pending {
            break value;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    };

    let parsed: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("parse webview fetch result: {e}"))?;
    if let Some(err) = parsed.get("error").and_then(|v| v.as_str()) {
        return Err(err.to_string());
    }

    Ok(WebviewFetchResult {
        status: parsed.get("status").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
        content_type: parsed
            .get("contentType")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        body_base64: parsed
            .get("bodyBase64")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

pub async fn webview_session_fetch(
    app: &AppHandle,
    registry: &PluginSessionRegistry,
    plugin_id: &str,
    method: &str,
    url: &str,
    headers: HashMap<String, String>,
    body: &str,
) -> Result<WebviewFetchResult, String> {
    let window = ensure_session_webview(app, registry, plugin_id).await?;
    let result = eval_fetch_in_webview(&window, method, url, &headers, body).await?;
    eprintln!(
        "[webview-http] plugin={plugin_id} {method} {url} status={} body_len={}",
        result.status,
        result.body_base64.len()
    );
    Ok(result)
}
