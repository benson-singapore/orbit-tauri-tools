use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

use crate::plugin_session::{webview_session_fetch, PluginSessionRegistry};

#[derive(Clone)]
pub struct WebviewHttpState {
    pub addr: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LineFetchRequest {
    plugin_id: String,
    method: String,
    url: String,
    #[serde(default)]
    headers: std::collections::HashMap<String, String>,
    #[serde(default)]
    body: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LineFetchResponse {
    status: u16,
    #[serde(rename = "contentType", default)]
    content_type: String,
    #[serde(rename = "bodyBase64", default)]
    body_base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

pub async fn serve(app: AppHandle, registry: Arc<PluginSessionRegistry>, port: u16) {
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(err) => {
            eprintln!("[webview-http] bind failed: {err}");
            return;
        }
    };
    eprintln!("[webview-http] listening on 127.0.0.1:{port}");

    loop {
        let Ok((stream, _)) = listener.accept().await else {
            continue;
        };
        let app = app.clone();
        let registry = registry.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(err) = handle_client(app, registry, stream).await {
                eprintln!("[webview-http] client error: {err}");
            }
        });
    }
}

async fn handle_client(
    app: AppHandle,
    registry: Arc<PluginSessionRegistry>,
    stream: tokio::net::TcpStream,
) -> Result<(), String> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();
    let line = lines
        .next_line()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "empty request".to_string())?;

    let response = match serde_json::from_str::<LineFetchRequest>(&line) {
        Ok(req) => match webview_session_fetch(
            &app,
            &registry,
            &req.plugin_id,
            &req.method,
            &req.url,
            req.headers,
            &req.body,
        )
        .await
        {
            Ok(result) => LineFetchResponse {
                status: result.status,
                content_type: result.content_type,
                body_base64: result.body_base64,
                error: None,
            },
            Err(err) => LineFetchResponse {
                status: 0,
                content_type: String::new(),
                body_base64: String::new(),
                error: Some(err),
            },
        },
        Err(err) => LineFetchResponse {
            status: 0,
            content_type: String::new(),
            body_base64: String::new(),
            error: Some(format!("invalid request json: {err}")),
        },
    };

    let mut payload =
        serde_json::to_string(&response).map_err(|e| format!("encode response: {e}"))?;
    payload.push('\n');
    writer
        .write_all(payload.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    writer.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}
