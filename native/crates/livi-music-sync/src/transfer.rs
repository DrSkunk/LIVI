// SPDX-FileCopyrightText: 2026 LIVI contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, Result, bail, ensure};
use futures_util::{
    SinkExt, StreamExt,
    stream::{SplitSink, SplitStream},
};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::{
    net::TcpStream,
    sync::{Mutex, mpsc},
    time::Instant,
};
use tokio_tungstenite::tungstenite::{Message, protocol::WebSocketConfig};
use tokio_tungstenite::{
    Connector, MaybeTlsStream, WebSocketStream, connect_async_tls_with_config,
};
use webrtc::api::APIBuilder;
use webrtc::data_channel::RTCDataChannel;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::ice_transport::ice_candidate::RTCIceCandidateInit;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::RTCPeerConnection;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;

use crate::storage::{CHUNK_SIZE, Storage, Transfer, hex};

const SIGNAL_LIMIT: usize = 64 * 1024;
const MESSAGE_LIMIT: usize = 16 * 1024;
const PAIRING_LIFETIME: Duration = Duration::from_secs(5 * 60);
const PEERJS_SERVER: &str = "wss://0.peerjs.com/peerjs";
const PEERJS_VERSION: &str = "1.5.5";

type PeerSocket = WebSocketStream<MaybeTlsStream<TcpStream>>;
type PeerSink = SplitSink<PeerSocket, Message>;
type PeerStream = SplitStream<PeerSocket>;

#[derive(Debug, Clone, Deserialize)]
pub struct IceServer {
    pub urls: Vec<String>,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub credential: String,
}

pub struct Config {
    pub ice_servers: Vec<IceServer>,
    pub web_url: String,
    pub music_root: PathBuf,
}

#[derive(Debug)]
pub enum Command {
    Approve,
    Reject,
    Stop,
}

#[derive(Debug)]
pub enum Event {
    Pairing { code: String, website: String },
    ApprovalRequested { verification: String },
    Connected,
    Saved { path: String },
}

#[derive(Debug)]
enum Notice {
    ApprovalRequested(String),
    Saved(String),
    Closed,
    Fatal(String),
}

#[derive(Debug, PartialEq, Eq)]
enum Phase {
    Waiting,
    Pending,
    Approved,
}

struct Machine {
    code: String,
    verification: Option<String>,
    phase: Phase,
    storage: Storage,
    transfer: Option<Transfer>,
    channel: Option<Arc<RTCDataChannel>>,
    notices: mpsc::UnboundedSender<Notice>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum Request {
    Hello {
        code: String,
    },
    List {
        request: u64,
        path: String,
        offset: usize,
    },
    Begin {
        request: u64,
        path: String,
        size: u64,
        modified: u64,
    },
    Finish {
        request: u64,
        digest: String,
    },
    Discard {
        request: u64,
    },
}

impl Request {
    fn id(&self) -> Option<u64> {
        match self {
            Self::Hello { .. } => None,
            Self::List { request, .. }
            | Self::Begin { request, .. }
            | Self::Finish { request, .. }
            | Self::Discard { request } => Some(*request),
        }
    }
}

fn pairing_code() -> Result<String> {
    loop {
        let mut bytes = [0; 4];
        getrandom::fill(&mut bytes)
            .map_err(|error| anyhow::anyhow!("Cannot generate pairing code: {error}"))?;
        let value = u32::from_be_bytes(bytes);
        if value < u32::MAX - u32::MAX % 1_000_000 {
            return Ok(format!("{:06}", value % 1_000_000));
        }
    }
}

fn random_peer_id() -> Result<String> {
    let mut bytes = [0; 16];
    getrandom::fill(&mut bytes)
        .map_err(|error| anyhow::anyhow!("Cannot generate a PeerJS identity: {error}"))?;
    Ok(format!("livi-{}", hex(&bytes)))
}

fn random_peer_token() -> Result<String> {
    let mut bytes = [0; 16];
    getrandom::fill(&mut bytes)
        .map_err(|error| anyhow::anyhow!("Cannot generate a PeerJS token: {error}"))?;
    Ok(hex(&bytes))
}

fn peerjs_url(peer_id: &str, token: &str) -> String {
    format!("{PEERJS_SERVER}?key=peerjs&id={peer_id}&token={token}&version={PEERJS_VERSION}")
}

fn pairing_website(base: &str, peer_id: &str) -> String {
    format!("{}#{peer_id}", base.split('#').next().unwrap_or(base))
}

fn is_peer_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.split([' ', '_', '-']).all(|segment| {
            !segment.is_empty() && segment.bytes().all(|byte| byte.is_ascii_alphanumeric())
        })
}

fn offer_details(value: &Value, peer_id: &str) -> Result<(String, String, String)> {
    ensure!(
        value.get("type").and_then(Value::as_str) == Some("OFFER"),
        "Expected a PeerJS data offer"
    );
    ensure!(
        value.get("dst").and_then(Value::as_str) == Some(peer_id),
        "PeerJS offer was addressed to another device"
    );
    let source = value
        .get("src")
        .and_then(Value::as_str)
        .context("PeerJS offer has no sender")?;
    ensure!(is_peer_id(source), "PeerJS offer has an invalid sender");
    let payload = value
        .get("payload")
        .context("PeerJS offer has no payload")?;
    ensure!(
        payload.get("type").and_then(Value::as_str) == Some("data"),
        "PeerJS media connections are not supported"
    );
    ensure!(
        payload.get("label").and_then(Value::as_str) == Some("livi-music"),
        "PeerJS offer has an unsupported data channel"
    );
    let connection_id = payload
        .get("connectionId")
        .and_then(Value::as_str)
        .context("PeerJS offer has no connection identifier")?;
    ensure!(
        !connection_id.is_empty() && connection_id.len() <= 128,
        "PeerJS offer has an invalid connection identifier"
    );
    let sdp = payload
        .get("sdp")
        .and_then(|description| description.get("sdp"))
        .and_then(Value::as_str)
        .context("PeerJS offer has no SDP")?;
    ensure!(
        sdp.len() <= SIGNAL_LIMIT - 1024,
        "WebRTC offer is too large"
    );
    Ok((
        source.to_string(),
        connection_id.to_string(),
        sdp.to_string(),
    ))
}

fn candidate_details(
    value: &Value,
    source: &str,
    connection_id: &str,
) -> Result<RTCIceCandidateInit> {
    ensure!(
        value.get("type").and_then(Value::as_str) == Some("CANDIDATE"),
        "Expected a PeerJS network candidate"
    );
    ensure!(
        value.get("src").and_then(Value::as_str) == Some(source),
        "PeerJS candidate came from another peer"
    );
    let payload = value
        .get("payload")
        .context("PeerJS candidate has no payload")?;
    ensure!(
        payload.get("connectionId").and_then(Value::as_str) == Some(connection_id),
        "PeerJS candidate belongs to another connection"
    );
    serde_json::from_value(
        payload
            .get("candidate")
            .cloned()
            .context("PeerJS candidate has no ICE data")?,
    )
    .context("PeerJS candidate is invalid")
}

fn peerjs_ice_servers() -> Vec<RTCIceServer> {
    vec![
        RTCIceServer {
            urls: vec!["stun:stun.l.google.com:19302".into()],
            username: String::new(),
            credential: String::new(),
        },
        RTCIceServer {
            urls: vec![
                "turn:eu-0.turn.peerjs.com:3478".into(),
                "turn:us-0.turn.peerjs.com:3478".into(),
            ],
            username: "peerjs".into(),
            credential: "peerjsp".into(),
        },
    ]
}

fn fingerprint(sdp: &str) -> Result<String> {
    let mut found: Option<String> = None;
    for line in sdp.lines() {
        let Some(value) = line
            .trim_end_matches('\r')
            .strip_prefix("a=fingerprint:sha-256 ")
        else {
            continue;
        };
        let value = value.replace(':', "").to_ascii_uppercase();
        ensure!(
            value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit()),
            "Invalid peer fingerprint"
        );
        if let Some(previous) = &found {
            ensure!(*previous == value, "Conflicting peer fingerprints");
        }
        found = Some(value);
    }
    found.context("Peer fingerprint is missing")
}

fn verification_code(offer: &str, answer: &str) -> Result<String> {
    let text = format!("{}\n{}", fingerprint(offer)?, fingerprint(answer)?);
    let hash = Sha256::digest(text.as_bytes());
    Ok(hash[..4].iter().map(|byte| format!("{byte:02X}")).collect())
}

fn signaling_tls(roots: rustls::RootCertStore) -> Result<Arc<rustls::ClientConfig>> {
    let provider = rustls::crypto::CryptoProvider::get_default()
        .cloned()
        .context("Signaling TLS cryptography provider is unavailable")?;
    let config = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .context("Cannot configure secure signaling")?
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(Arc::new(config))
}

fn ensure_crypto_provider() -> Result<()> {
    // Standalone hosts may not have set the process default needed by WebRTC's DTLS verifier.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let installed = rustls::crypto::ring::default_provider().install_default();
        ensure!(
            installed.is_ok() || rustls::crypto::CryptoProvider::get_default().is_some(),
            "Cannot initialize the WebRTC cryptography provider"
        );
    }
    Ok(())
}

async fn send(channel: &RTCDataChannel, value: Value) -> Result<()> {
    let message = serde_json::to_string(&value)?;
    ensure!(message.len() <= MESSAGE_LIMIT, "Response is too large");
    channel
        .send_text(message)
        .await
        .context("Cannot send a response to the browser")?;
    Ok(())
}

impl Machine {
    async fn receive(&mut self, message: DataChannelMessage) -> Result<()> {
        let channel = self
            .channel
            .as_ref()
            .context("The data channel is not available")?
            .clone();
        if !message.is_string {
            ensure!(
                self.phase == Phase::Approved,
                "Connection has not been approved"
            );
            let transfer = self
                .transfer
                .as_mut()
                .context("No file transfer is active")?;
            transfer.append(&message.data).await?;
            let offset = transfer.offset();
            if offset % (CHUNK_SIZE as u64 * 16) == 0 || message.data.len() < CHUNK_SIZE {
                send(&channel, json!({ "type": "progress", "offset": offset })).await?;
            }
            return Ok(());
        }
        ensure!(message.data.len() <= MESSAGE_LIMIT, "Request is too large");
        let request: Request =
            serde_json::from_slice(&message.data).context("Invalid browser request")?;
        if let Request::Hello { code } = &request {
            ensure!(
                self.phase == Phase::Waiting && *code == self.code,
                "Invalid pairing code"
            );
            let verification = self
                .verification
                .clone()
                .context("Peer verification is not ready")?;
            self.phase = Phase::Pending;
            self.notices
                .send(Notice::ApprovalRequested(verification))
                .context("LIVI approval is unavailable")?;
            return send(&channel, json!({ "type": "pending" })).await;
        }
        ensure!(
            self.phase == Phase::Approved,
            "Connection has not been approved"
        );
        let id = request.id().context("Missing request identifier")?;
        let result = self.request(request).await;
        match result {
            Ok(response) => send(&channel, response).await,
            Err(error) => {
                eprintln!("[music-sync] request failed: {error:#}");
                send(
                    &channel,
                    json!({ "type": "error", "request": id, "message": format!("{error:#}") }),
                )
                .await
            }
        }
    }

    async fn request(&mut self, request: Request) -> Result<Value> {
        match request {
            Request::Hello { .. } => bail!("Pairing has already started"),
            Request::List {
                request,
                path,
                offset,
            } => {
                let listing = self.storage.list(&path, offset)?;
                Ok(
                    json!({ "type": "list", "request": request, "entries": listing.entries, "next": listing.next }),
                )
            }
            Request::Begin {
                request,
                path,
                size,
                modified,
            } => {
                ensure!(self.transfer.is_none(), "Another file transfer is active");
                let transfer = self.storage.begin(&path, size, modified).await?;
                let response = json!({
                    "type": "ready", "request": request, "offset": transfer.offset(),
                    "digest": transfer.digest(), "chunkSize": CHUNK_SIZE
                });
                self.transfer = Some(transfer);
                Ok(response)
            }
            Request::Finish { request, digest } => {
                let transfer = self.transfer.take().context("No file transfer is active")?;
                let path = transfer.path().to_string();
                self.storage.finish(transfer, &digest).await?;
                self.notices
                    .send(Notice::Saved(path.clone()))
                    .context("LIVI is unavailable")?;
                Ok(json!({ "type": "complete", "request": request, "path": path }))
            }
            Request::Discard { request } => {
                let transfer = self.transfer.take().context("No file transfer is active")?;
                self.storage.discard(transfer).await?;
                Ok(json!({ "type": "discarded", "request": request }))
            }
        }
    }
}

fn attach(
    peer: &RTCPeerConnection,
    machine: Arc<Mutex<Machine>>,
    notices: mpsc::UnboundedSender<Notice>,
) {
    let state_notices = notices.clone();
    peer.on_peer_connection_state_change(Box::new(move |state| {
        let notices = state_notices.clone();
        Box::pin(async move {
            if matches!(
                state,
                RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed
            ) {
                let _ = notices.send(Notice::Closed);
            }
        })
    }));
    peer.on_data_channel(Box::new(move |channel: Arc<RTCDataChannel>| {
        let machine = machine.clone();
        let notices = notices.clone();
        Box::pin(async move {
            if channel.label() != "livi-music"
                || !channel.ordered()
                || channel.max_retransmits().is_some()
                || channel.max_packet_lifetime().is_some()
            {
                let _ = notices.send(Notice::Fatal("Unsupported data channel".into()));
                if let Err(error) = channel.close().await {
                    eprintln!("[music-sync] cannot close invalid data channel: {error}");
                }
                return;
            }
            {
                let mut machine = machine.lock().await;
                if machine.channel.is_some() {
                    let _ = notices.send(Notice::Fatal("Only one browser is allowed".into()));
                    return;
                }
                machine.channel = Some(channel.clone());
            }
            let close_notices = notices.clone();
            channel.on_close(Box::new(move || {
                let notices = close_notices.clone();
                Box::pin(async move {
                    let _ = notices.send(Notice::Closed);
                })
            }));
            let message_notices = notices.clone();
            channel.on_message(Box::new(move |message| {
                let machine = machine.clone();
                let notices = message_notices.clone();
                Box::pin(async move {
                    let mut machine = machine.lock().await;
                    if let Err(error) = machine.receive(message).await {
                        eprintln!("[music-sync] connection rejected: {error:#}");
                        if let Some(channel) = &machine.channel
                            && let Err(send_error) = send(
                                channel,
                                json!({ "type": "error", "message": format!("{error:#}") }),
                            )
                            .await
                        {
                            eprintln!(
                                "[music-sync] cannot report error to browser: {send_error:#}"
                            );
                        }
                        let _ = notices.send(Notice::Fatal(error.to_string()));
                    }
                })
            }));
        })
    }));
}

async fn connect_peerjs(peer_id: &str, token: &str) -> Result<(PeerSink, PeerStream)> {
    let url = peerjs_url(peer_id, token);
    let options = WebSocketConfig::default()
        .max_message_size(Some(SIGNAL_LIMIT))
        .max_frame_size(Some(SIGNAL_LIMIT));
    let roots = rustls::RootCertStore {
        roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
    };
    let tls = signaling_tls(roots)?;
    let (socket, _) = tokio::time::timeout(
        Duration::from_secs(15),
        connect_async_tls_with_config(
            url.as_str(),
            Some(options),
            false,
            Some(Connector::Rustls(tls)),
        ),
    )
    .await
    .context("Signaling server connection timed out")?
    .context("Cannot connect to PeerJS")?;
    let (sink, mut stream) = socket.split();
    let first = tokio::time::timeout(Duration::from_secs(15), stream.next())
        .await
        .context("Timed out waiting for PeerJS")?
        .context("PeerJS closed the signaling connection")?
        .context("PeerJS signaling failed")?;
    let Message::Text(text) = first else {
        bail!("PeerJS sent an unexpected handshake frame");
    };
    let response: Value = serde_json::from_str(&text).context("Invalid PeerJS handshake")?;
    match response.get("type").and_then(Value::as_str) {
        Some("OPEN") => Ok((sink, stream)),
        Some("ID-TAKEN") => bail!("PeerJS identity is already in use; try wireless sync again"),
        Some("ERROR") => bail!(
            "{}",
            response
                .pointer("/payload/msg")
                .and_then(Value::as_str)
                .unwrap_or("PeerJS rejected the connection")
        ),
        _ => bail!("PeerJS sent an unexpected handshake response"),
    }
}

async fn answer_offer(
    value: &Value,
    peer_id: &str,
    peer: &RTCPeerConnection,
    machine: &Arc<Mutex<Machine>>,
    sink: &mut PeerSink,
) -> Result<(String, String)> {
    let (browser_id, connection_id, offer) = offer_details(value, peer_id)?;
    peer.set_remote_description(RTCSessionDescription::offer(offer.clone())?)
        .await?;
    let answer = peer.create_answer(None).await?;
    let mut gathered = peer.gathering_complete_promise().await;
    peer.set_local_description(answer).await?;
    tokio::time::timeout(Duration::from_secs(30), gathered.recv())
        .await
        .context("Timed out gathering network addresses")?;
    let answer = peer
        .local_description()
        .await
        .context("Missing WebRTC answer")?
        .sdp;
    let verification = verification_code(&offer, &answer)?;
    machine.lock().await.verification = Some(verification);
    sink.send(Message::Text(
        json!({
            "type": "ANSWER",
            "dst": browser_id,
            "payload": {
                "type": "data",
                "connectionId": connection_id,
                "sdp": { "type": "answer", "sdp": answer }
            }
        })
        .to_string()
        .into(),
    ))
    .await
    .context("Cannot send the WebRTC answer through PeerJS")?;
    Ok((browser_id, connection_id))
}

pub async fn run(
    config: Config,
    events: mpsc::UnboundedSender<Event>,
    mut commands: mpsc::UnboundedReceiver<Command>,
) -> Result<()> {
    ensure_crypto_provider()?;
    let code = pairing_code()?;
    let peer_id = random_peer_id()?;
    let peer_token = random_peer_token()?;
    let storage = Storage::open(&config.music_root)?;
    let ice_servers = if config.ice_servers.is_empty() {
        peerjs_ice_servers()
    } else {
        config
            .ice_servers
            .iter()
            .map(|server| RTCIceServer {
                urls: server.urls.clone(),
                username: server.username.clone(),
                credential: server.credential.clone(),
            })
            .collect()
    };
    let peer = Arc::new(
        APIBuilder::new()
            .build()
            .new_peer_connection(RTCConfiguration {
                ice_servers,
                ..Default::default()
            })
            .await
            .context("Cannot create the WebRTC connection")?,
    );
    let (mut signal_sink, mut signal_stream) = connect_peerjs(&peer_id, &peer_token).await?;
    events
        .send(Event::Pairing {
            code: code.clone(),
            website: pairing_website(&config.web_url, &peer_id),
        })
        .context("LIVI is unavailable")?;
    let (notices, mut incoming) = mpsc::unbounded_channel();
    let machine = Arc::new(Mutex::new(Machine {
        code: code.clone(),
        verification: None,
        phase: Phase::Waiting,
        storage,
        transfer: None,
        channel: None,
        notices: notices.clone(),
    }));
    attach(&peer, machine.clone(), notices);
    let result = async {
        let deadline = tokio::time::sleep(PAIRING_LIFETIME);
        tokio::pin!(deadline);
        let mut heartbeat = tokio::time::interval_at(
            Instant::now() + Duration::from_secs(5),
            Duration::from_secs(5),
        );
        let mut browser_id: Option<String> = None;
        let mut connection_id: Option<String> = None;
        let mut approved = false;
        loop {
            tokio::select! {
                _ = &mut deadline, if !approved => bail!("Pairing expired"),
                command = commands.recv() => match command {
                    Some(Command::Approve) => {
                        let mut machine = machine.lock().await;
                        ensure!(machine.phase == Phase::Pending, "There is no browser request to approve");
                        let channel = machine.channel.as_ref().context("Browser disconnected")?.clone();
                        send(&channel, json!({ "type": "approved" })).await?;
                        machine.phase = Phase::Approved;
                        approved = true;
                        events.send(Event::Connected).context("LIVI is unavailable")?;
                    }
                    Some(Command::Reject) => {
                        let machine = machine.lock().await;
                        if let Some(channel) = &machine.channel {
                            send(channel, json!({ "type": "error", "message": "Connection rejected on LIVI" })).await?;
                        }
                        return Ok(());
                    }
                    Some(Command::Stop) | None => return Ok(()),
                },
                _ = heartbeat.tick() => {
                    signal_sink
                        .send(Message::Text(json!({ "type": "HEARTBEAT" }).to_string().into()))
                        .await
                        .context("PeerJS heartbeat failed")?;
                }
                frame = signal_stream.next() => match frame {
                    Some(Ok(Message::Text(text))) => {
                        let value: Value = serde_json::from_str(&text)
                            .context("PeerJS sent invalid signaling JSON")?;
                        match value.get("type").and_then(Value::as_str) {
                            Some("OPEN") => {}
                            Some("OFFER") => {
                                ensure!(browser_id.is_none(), "Only one browser is allowed");
                                let (source, id) = answer_offer(
                                    &value,
                                    &peer_id,
                                    &peer,
                                    &machine,
                                    &mut signal_sink,
                                )
                                .await?;
                                browser_id = Some(source);
                                connection_id = Some(id);
                            }
                            Some("CANDIDATE") => {
                                let source = browser_id
                                    .as_deref()
                                    .context("PeerJS candidate arrived before its offer")?;
                                let id = connection_id
                                    .as_deref()
                                    .context("PeerJS candidate arrived before its offer")?;
                                let candidate = candidate_details(&value, source, id)?;
                                peer.add_ice_candidate(candidate).await
                                    .context("Cannot add a PeerJS network candidate")?;
                            }
                            Some("LEAVE") => {
                                if value.get("src").and_then(Value::as_str) == browser_id.as_deref() {
                                    bail!("Browser disconnected before pairing");
                                }
                            }
                            Some("ID-TAKEN") => {
                                bail!("PeerJS identity is already in use; try wireless sync again");
                            }
                            Some("ERROR") => bail!(
                                "{}",
                                value.pointer("/payload/msg").and_then(Value::as_str)
                                    .unwrap_or("PeerJS rejected the connection")
                            ),
                            _ => bail!("Unexpected PeerJS signaling message"),
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        signal_sink.send(Message::Pong(payload)).await?;
                    }
                    Some(Ok(Message::Close(_))) | None => bail!("PeerJS signaling connection closed"),
                    Some(Err(error)) => return Err(error).context("PeerJS signaling failed"),
                    Some(Ok(_)) => {}
                },
                notice = incoming.recv() => match notice {
                    Some(Notice::ApprovalRequested(verification)) => {
                        events.send(Event::ApprovalRequested { verification }).context("LIVI is unavailable")?;
                    }
                    Some(Notice::Saved(path)) => {
                        events.send(Event::Saved { path }).context("LIVI is unavailable")?;
                    }
                    Some(Notice::Closed) | None => return Ok(()),
                    Some(Notice::Fatal(error)) => bail!("{error}"),
                }
            }
        }
    }.await;
    if let Err(error) = peer.close().await {
        eprintln!("[music-sync] cannot close peer connection: {error}");
    }
    if let Err(error) = signal_sink.close().await {
        eprintln!("[music-sync] cannot close PeerJS signaling connection: {error}");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn peerjs_identity_and_pairing_link_are_random_and_valid() {
        let first = random_peer_id().unwrap();
        let second = random_peer_id().unwrap();
        assert_ne!(first, second);
        assert!(is_peer_id(&first));
        assert_eq!(
            pairing_website("https://example.test/music/#old", &first),
            format!("https://example.test/music/#{first}")
        );
        assert!(
            peerjs_url(&first, "0123456789abcdef")
                .starts_with("wss://0.peerjs.com/peerjs?key=peerjs&id=livi-")
        );
    }

    #[test]
    fn peerjs_offer_and_candidates_are_bound_to_expected_peer_and_channel() {
        let offer = json!({
            "type": "OFFER",
            "src": "browser-123",
            "dst": "livi-0123456789abcdef0123456789abcdef",
            "payload": {
                "type": "data",
                "label": "livi-music",
                "connectionId": "dc_123",
                "sdp": { "type": "offer", "sdp": "v=0\r\n" }
            }
        });
        let (source, connection, sdp) =
            offer_details(&offer, "livi-0123456789abcdef0123456789abcdef").unwrap();
        assert_eq!(source, "browser-123");
        assert_eq!(connection, "dc_123");
        assert_eq!(sdp, "v=0\r\n");

        let candidate = json!({
            "type": "CANDIDATE",
            "src": "browser-123",
            "payload": {
                "type": "data",
                "connectionId": "dc_123",
                "candidate": {
                    "candidate": "candidate:1 1 udp 1 192.0.2.1 5000 typ host",
                    "sdpMid": "0",
                    "sdpMLineIndex": 0
                }
            }
        });
        assert_eq!(
            candidate_details(&candidate, &source, &connection)
                .unwrap()
                .candidate,
            "candidate:1 1 udp 1 192.0.2.1 5000 typ host"
        );
        assert!(offer_details(&offer, "another-device").is_err());
        assert!(candidate_details(&candidate, "another-browser", &connection).is_err());
    }

    #[test]
    fn verification_depends_on_both_peer_fingerprints() {
        let first = format!("a=fingerprint:sha-256 {}", "11:".repeat(31) + "11");
        let second = format!("a=fingerprint:sha-256 {}", "22:".repeat(31) + "22");
        // Pinned in livi-music web/test/verification.test.mjs too, so both sides agree.
        assert_eq!(verification_code(&first, &second).unwrap(), "F010287B");
        assert_ne!(
            verification_code(&first, &second).unwrap(),
            verification_code(&second, &first).unwrap()
        );
        assert!(verification_code(&first, "missing").is_err());
    }

    #[tokio::test]
    async fn requests_and_chunks_are_rejected_before_approval() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("music");
        std::fs::create_dir(&root).unwrap();
        let peer = APIBuilder::new()
            .build()
            .new_peer_connection(RTCConfiguration::default())
            .await
            .unwrap();
        let channel = peer.create_data_channel("livi-music", None).await.unwrap();
        let (notices, _) = mpsc::unbounded_channel();
        let mut machine = Machine {
            code: "123456".into(),
            verification: None,
            phase: Phase::Waiting,
            storage: Storage::open(&root).unwrap(),
            transfer: None,
            channel: Some(channel),
            notices,
        };
        for phase in [Phase::Waiting, Phase::Pending] {
            machine.phase = phase;
            for message in [
                DataChannelMessage {
                    is_string: true,
                    data: br#"{"type":"list","request":1,"path":"","offset":0}"#[..].into(),
                },
                DataChannelMessage {
                    is_string: false,
                    data: vec![1, 2, 3].into(),
                },
            ] {
                let error = machine.receive(message).await.unwrap_err();
                assert!(error.to_string().contains("not been approved"));
            }
        }
        peer.close().await.unwrap();
    }

    #[tokio::test]
    async fn webrtc_dtls_works_with_multiple_rustls_providers_enabled() {
        ensure_crypto_provider().unwrap();
        let sender = APIBuilder::new()
            .build()
            .new_peer_connection(RTCConfiguration::default())
            .await
            .unwrap();
        let receiver = APIBuilder::new()
            .build()
            .new_peer_connection(RTCConfiguration::default())
            .await
            .unwrap();
        let (messages, mut received) = mpsc::unbounded_channel();
        receiver.on_data_channel(Box::new(move |channel| {
            let messages = messages.clone();
            Box::pin(async move {
                channel.on_message(Box::new(move |message| {
                    let messages = messages.clone();
                    Box::pin(async move {
                        messages.send(message.data.to_vec()).unwrap();
                    })
                }));
            })
        }));
        let channel = sender
            .create_data_channel("livi-music", None)
            .await
            .unwrap();
        let (opened, ready) = tokio::sync::oneshot::channel();
        channel.on_open(Box::new(move || {
            Box::pin(async move {
                opened.send(()).unwrap();
            })
        }));
        let offer = sender.create_offer(None).await.unwrap();
        let mut gathered = sender.gathering_complete_promise().await;
        sender.set_local_description(offer).await.unwrap();
        tokio::time::timeout(Duration::from_secs(10), gathered.recv())
            .await
            .unwrap();
        receiver
            .set_remote_description(sender.local_description().await.unwrap())
            .await
            .unwrap();
        let answer = receiver.create_answer(None).await.unwrap();
        let mut gathered = receiver.gathering_complete_promise().await;
        receiver.set_local_description(answer).await.unwrap();
        tokio::time::timeout(Duration::from_secs(10), gathered.recv())
            .await
            .unwrap();
        sender
            .set_remote_description(receiver.local_description().await.unwrap())
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(15), ready)
            .await
            .unwrap()
            .unwrap();
        channel.send_text("ready").await.unwrap();
        assert_eq!(
            tokio::time::timeout(Duration::from_secs(5), received.recv())
                .await
                .unwrap()
                .unwrap(),
            b"ready"
        );
        sender.close().await.unwrap();
        receiver.close().await.unwrap();
    }

    #[tokio::test]
    async fn wss_works_with_multiple_rustls_providers_enabled() {
        ensure_crypto_provider().unwrap();
        let identity = rcgen::generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
        let certificate = identity.cert.der().clone();
        let key = rustls::pki_types::PrivatePkcs8KeyDer::from(identity.key_pair.serialize_der());
        let server_config = rustls::ServerConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(vec![certificate.clone()], key.into())
        .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(server_config));
            let stream = acceptor.accept(stream).await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            socket.send(Message::Text("ready".into())).await.unwrap();
        });
        let mut roots = rustls::RootCertStore::empty();
        roots.add(certificate).unwrap();
        let tls = signaling_tls(roots).unwrap();
        assert!(Arc::ptr_eq(
            tls.crypto_provider(),
            rustls::crypto::CryptoProvider::get_default().unwrap()
        ));
        let url = format!("wss://{address}/signal");
        let (mut socket, _) =
            connect_async_tls_with_config(&url, None, false, Some(Connector::Rustls(tls)))
                .await
                .unwrap();
        assert_eq!(
            socket.next().await.unwrap().unwrap().into_text().unwrap(),
            "ready"
        );
        server.await.unwrap();
    }
}
