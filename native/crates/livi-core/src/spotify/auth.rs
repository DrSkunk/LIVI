// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::{Router, extract::Query, http::StatusCode, routing::get};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::sync::{Mutex, oneshot};

pub const REDIRECT: &str = "http://127.0.0.1:5589/callback";
const SCOPES: &str = "streaming user-read-private playlist-read-private playlist-read-collaborative user-library-read";
const TOKEN_URL: &str = "https://accounts.spotify.com/api/token";

#[derive(Serialize, Deserialize)]
struct Stored {
    client_id: String,
    refresh_token: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: u64,
}

struct Token {
    access: String,
    refresh: String,
    expires: Instant,
}

#[derive(Clone)]
pub(super) struct Account {
    pub http: reqwest::Client,
    pub client_id: String,
    path: PathBuf,
    token: Arc<Mutex<Token>>,
}

pub fn valid_client_id(id: &str) -> bool {
    id.len() == 32 && id.bytes().all(|c| c.is_ascii_hexdigit())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "Cannot create Spotify HTTP client".into())
}

async fn exchange(http: &reqwest::Client, form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let response = http
        .post(TOKEN_URL)
        .form(form)
        .send()
        .await
        .map_err(|_| "Cannot reach Spotify authorization service".to_string())?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Spotify authorization failed ({status}). Check the client ID, redirect URI, and app access; try logging in again."
        ));
    }
    response
        .json()
        .await
        .map_err(|_| "Invalid Spotify token response".into())
}

fn save(path: &Path, stored: &Stored) -> Result<(), String> {
    let parent = path.parent().ok_or("Invalid Spotify credential path")?;
    std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create Spotify data: {e}"))?;
    std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
        .map_err(|e| format!("Cannot protect Spotify data: {e}"))?;
    let temporary = parent.join(format!("credentials-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|e| format!("Cannot save Spotify credentials: {e}"))?;
        serde_json::to_writer(&mut file, stored)
            .map_err(|_| "Cannot serialize Spotify credentials".to_string())?;
        file.sync_all()
            .map_err(|e| format!("Cannot sync Spotify credentials: {e}"))?;
        std::fs::rename(&temporary, path)
            .map_err(|e| format!("Cannot replace Spotify credentials: {e}"))
    })();
    if result.is_err()
        && let Err(e) = std::fs::remove_file(&temporary)
        && e.kind() != std::io::ErrorKind::NotFound
    {
        eprintln!("[spotify] cannot clean up credential temporary file: {e}");
    }
    result
}

impl Account {
    fn new(
        http: reqwest::Client,
        client_id: String,
        path: PathBuf,
        response: TokenResponse,
        previous_refresh: Option<String>,
    ) -> Result<Self, String> {
        let refresh = response
            .refresh_token
            .or(previous_refresh)
            .ok_or("Spotify did not return a refresh token; authorize again")?;
        if response.access_token.is_empty() || refresh.is_empty() || response.expires_in == 0 {
            return Err("Spotify returned invalid credentials".into());
        }
        save(
            &path,
            &Stored {
                client_id: client_id.clone(),
                refresh_token: refresh.clone(),
            },
        )?;
        Ok(Self {
            http,
            client_id,
            path,
            token: Arc::new(Mutex::new(Token {
                access: response.access_token,
                refresh,
                expires: Instant::now() + Duration::from_secs(response.expires_in.min(86400)),
            })),
        })
    }

    pub async fn access_token(&self) -> Result<String, String> {
        let mut token = self.token.lock().await;
        if token.expires <= Instant::now() + Duration::from_secs(60) {
            let response = exchange(
                &self.http,
                &[
                    ("grant_type", "refresh_token"),
                    ("refresh_token", &token.refresh),
                    ("client_id", &self.client_id),
                ],
            )
            .await?;
            if response.access_token.is_empty() || response.expires_in == 0 {
                return Err("Spotify returned an invalid refreshed token".into());
            }
            let refresh = response
                .refresh_token
                .unwrap_or_else(|| token.refresh.clone());
            if refresh.is_empty() {
                return Err("Spotify returned an invalid refresh credential".into());
            }
            save(
                &self.path,
                &Stored {
                    client_id: self.client_id.clone(),
                    refresh_token: refresh.clone(),
                },
            )?;
            token.access = response.access_token;
            token.refresh = refresh;
            token.expires = Instant::now() + Duration::from_secs(response.expires_in.min(86400));
        }
        Ok(token.access.clone())
    }

    pub async fn restore(client_id: &str, directory: &Path) -> Result<Option<Self>, String> {
        let path = directory.join("credentials.json");
        let bytes = match std::fs::read(&path) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("Cannot read Spotify credentials: {e}")),
        };
        let stored: Stored = serde_json::from_slice(&bytes)
            .map_err(|_| "Cannot read saved Spotify login; log out and authorize again")?;
        if stored.client_id != client_id {
            forget(directory)?;
            return Err("Spotify client ID changed; log out and authorize again".into());
        }
        let http = http_client()?;
        let response = exchange(
            &http,
            &[
                ("grant_type", "refresh_token"),
                ("refresh_token", &stored.refresh_token),
                ("client_id", client_id),
            ],
        )
        .await?;
        Self::new(
            http,
            client_id.into(),
            path,
            response,
            Some(stored.refresh_token),
        )
        .map(Some)
    }
}

#[derive(Deserialize)]
struct Callback {
    state: Option<String>,
    code: Option<String>,
    error: Option<String>,
}

fn callback_code(callback: Callback, expected_state: &str) -> Result<String, String> {
    if callback.state.as_deref() != Some(expected_state) {
        return Err("Invalid Spotify login state".into());
    }
    if callback.error.is_some() {
        return Err("Spotify login was declined".into());
    }
    callback
        .code
        .filter(|code| !code.is_empty())
        .ok_or("Missing Spotify authorization code".into())
}

pub(super) async fn login(
    hub: Arc<crate::hub::Hub>,
    client_id: String,
    directory: PathBuf,
) -> Result<Account, String> {
    if !valid_client_id(&client_id) {
        return Err("Set a 32-character Spotify developer client ID before logging in".into());
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:5589")
        .await
        .map_err(|_| "Cannot open Spotify login callback on 127.0.0.1:5589".to_string())?;
    let verifier = format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    );
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let state = uuid::Uuid::new_v4().to_string();
    let mut url = reqwest::Url::parse("https://accounts.spotify.com/authorize")
        .map_err(|_| "Invalid Spotify authorization URL")?;
    url.query_pairs_mut().extend_pairs([
        ("client_id", client_id.as_str()),
        ("response_type", "code"),
        ("redirect_uri", REDIRECT),
        ("scope", SCOPES),
        ("state", state.as_str()),
        ("code_challenge_method", "S256"),
        ("code_challenge", challenge.as_str()),
    ]);
    let (tx, rx) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(tx)));
    let app = Router::new().route(
        "/callback",
        get(move |Query(query): Query<Callback>| {
            let (sender, state) = (sender.clone(), state.clone());
            async move {
                match callback_code(query, &state) {
                    Ok(code) => {
                        if let Some(tx) = sender.lock().await.take() {
                            let _ = tx.send(Ok(code));
                        }
                        (
                            StatusCode::OK,
                            "Spotify authorization received. Return to LIVI.",
                        )
                    }
                    Err(error) => {
                        if error == "Spotify login was declined"
                            && let Some(tx) = sender.lock().await.take()
                        {
                            let _ = tx.send(Err(error));
                        }
                        (
                            StatusCode::BAD_REQUEST,
                            "Spotify authorization rejected. Return to LIVI.",
                        )
                    }
                }
            }
        }),
    );
    hub.update(|s| s.spotify.auth_url = Some(url.into()));
    let (shutdown, stopped) = oneshot::channel::<()>();
    let server = axum::serve(listener, app).with_graceful_shutdown(async {
        let _ = stopped.await;
    });
    let server = std::future::IntoFuture::into_future(server);
    tokio::pin!(server);
    let code = tokio::select! {
        result = &mut server => {
            return Err(format!("Spotify login callback stopped: {result:?}"));
        }
        result = tokio::time::timeout(Duration::from_secs(300), rx) => {
            match result {
                Ok(Ok(code)) => code,
                Ok(Err(_)) => Err("Spotify login callback closed".into()),
                Err(_) => Err("Spotify login timed out".into()),
            }
        }
    };
    let _ = shutdown.send(());
    tokio::time::timeout(Duration::from_secs(2), &mut server)
        .await
        .map_err(|_| "Spotify login callback shutdown timed out")?
        .map_err(|_| "Spotify login callback failed")?;
    hub.update(|s| s.spotify.auth_url = None);
    let code = code?;
    let http = http_client()?;
    let response = exchange(
        &http,
        &[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("client_id", &client_id),
            ("redirect_uri", REDIRECT),
            ("code_verifier", &verifier),
        ],
    )
    .await?;
    Account::new(
        http,
        client_id,
        directory.join("credentials.json"),
        response,
        None,
    )
}

pub fn forget(directory: &Path) -> Result<(), String> {
    match std::fs::remove_file(directory.join("credentials.json")) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Cannot delete Spotify credentials: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn callback_requires_matching_state_and_a_code() {
        let query = |state: &str| Callback {
            state: Some(state.into()),
            code: Some("code".into()),
            error: None,
        };
        assert!(callback_code(query("wrong"), "expected").is_err());
        assert_eq!(
            callback_code(query("expected"), "expected"),
            Ok("code".into())
        );
        assert!(
            callback_code(
                Callback {
                    state: Some("expected".into()),
                    code: None,
                    error: Some("access_denied".into())
                },
                "expected"
            )
            .is_err()
        );
    }

    #[test]
    fn credentials_are_private_and_can_be_removed() {
        let directory = crate::config_file::tests::TempDir::new();
        let path = directory.0.join("spotify/credentials.json");
        save(
            &path,
            &Stored {
                client_id: "client".into(),
                refresh_token: "test-token".into(),
            },
        )
        .unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            std::fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        forget(path.parent().unwrap()).unwrap();
        assert!(!path.exists());
    }

    #[tokio::test]
    async fn only_refresh_credentials_are_saved_and_client_changes_invalidate_them() {
        let directory = crate::config_file::tests::TempDir::new();
        let path = directory.0.join("spotify/credentials.json");
        let account = Account::new(
            http_client().unwrap(),
            "client-one".into(),
            path.clone(),
            TokenResponse {
                access_token: "test-access".into(),
                refresh_token: Some("test-refresh".into()),
                expires_in: 3600,
            },
            None,
        )
        .unwrap();
        assert_eq!(account.access_token().await.unwrap(), "test-access");
        let stored: serde_json::Value =
            serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(stored.as_object().unwrap().len(), 2);
        assert_eq!(stored["refresh_token"], "test-refresh");
        assert!(stored.get("access_token").is_none());
        assert!(
            Account::restore("client-two", path.parent().unwrap())
                .await
                .is_err()
        );
        assert!(!path.exists());
    }
}
