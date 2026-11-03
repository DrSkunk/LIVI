// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

//! Ethernet, Wi-Fi and clock status under LIVI OS through its root helper
//! (`sudo -n /usr/libexec/livi-network`, see docs/LIVI-OS.md).
//!
//! Every call runs in its own task with a timeout, so a 60 s Wi-Fi join never
//! holds up anything else. The answers land in `state.network`. The status is
//! polled while the settings page asks for it (`NetworkWatch`) and refreshed
//! after every change. The password only ever travels on the helper's stdin.

use std::ffi::OsString;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use livi_core_proto::message::{Secret, WifiSecurity};
use livi_core_proto::state::{JoinOutcome, Network, NetworkError, NetworkStatus, WifiNetwork};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::server::Core;

const POLL: Duration = Duration::from_secs(5);
const SETTINGS: &str = "/settings";

#[derive(Debug, Clone, PartialEq)]
pub enum NetworkAsk {
    Watch(bool),
    Refresh,
    Scan,
    Connect(Join),
    Forget(String),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Join {
    pub ssid: String,
    pub psk: Option<Secret>,
    pub hidden: bool,
    pub security: Option<WifiSecurity>,
}

/// One helper run.
#[derive(Debug, Clone, PartialEq)]
enum Call {
    Status,
    Scan,
    Connect(Join),
    Forget(String),
}

impl Call {
    fn args(&self) -> Vec<&str> {
        match self {
            Call::Status => vec!["status"],
            Call::Scan => vec!["scan"],
            Call::Connect(_) => vec!["connect"],
            Call::Forget(uuid) => vec!["forget", uuid.as_str()],
        }
    }

    /// The `connect` request; the only place the password goes.
    fn stdin(&self) -> Option<Vec<u8>> {
        let Call::Connect(join) = self else {
            return None;
        };
        let mut request = json!({
            "ssid": join.ssid,
            "psk": join.psk.as_ref().map(|p| p.0.as_str()),
            "hidden": join.hidden,
        });
        // Left out unless chosen: older helpers and automatic detection.
        if let Some(security) = join.security {
            request["security"] = json!(security);
        }
        let mut line = request.to_string().into_bytes();
        line.push(b'\n');
        Some(line)
    }

    /// The helper's own limits (scan ~30 s, connect ~60 s) plus slack.
    fn timeout(&self) -> Duration {
        Duration::from_secs(match self {
            Call::Status => 15,
            Call::Scan => 45,
            Call::Connect(_) => 90,
            Call::Forget(_) => 20,
        })
    }
}

/// How the helper is started: `sudo -n /usr/libexec/livi-network` on LIVI OS.
#[derive(Debug, Clone)]
pub struct Helper {
    program: OsString,
    lead: Vec<OsString>,
}

impl Helper {
    pub fn livi_os() -> Self {
        Self {
            program: "sudo".into(),
            lead: vec!["-n".into(), crate::livi_os::NETWORK.into()],
        }
    }

    /// Under LIVI OS with the helper in the image.
    pub fn available() -> bool {
        crate::livi_os::active() && Path::new(crate::livi_os::NETWORK).exists()
    }

    fn command(&self, call: &Call) -> Command {
        let mut cmd = Command::new(&self.program);
        cmd.args(&self.lead)
            .args(call.args())
            .stdin(if call.stdin().is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        cmd
    }

    async fn run(&self, call: &Call) -> Result<Value, NetworkError> {
        let mut child = self.command(call).spawn().map_err(|e| {
            failure(
                "unavailable",
                format!("cannot start the network helper: {e}"),
            )
        })?;
        tokio::time::timeout(call.timeout(), async {
            let write_error = match (child.stdin.take(), call.stdin()) {
                (Some(mut pipe), Some(input)) => pipe.write_all(&input).await.err(),
                (None, Some(_)) => Some(std::io::Error::other("no stdin available")),
                _ => None,
            };
            let out = child
                .wait_with_output()
                .await
                .map_err(|e| failure("unavailable", format!("network helper: {e}")))?;
            match (
                answer(out.status.success(), &out.stdout, &out.stderr),
                write_error,
            ) {
                (Ok(_), Some(e)) => Err(failure(
                    "unavailable",
                    format!("cannot send request to network helper: {e}"),
                )),
                (response, _) => response,
            }
        })
        .await
        .map_err(|_| failure("timeout", "the network helper did not answer in time"))?
    }
}

fn failure(code: &str, message: impl Into<String>) -> NetworkError {
    NetworkError {
        code: code.into(),
        message: message.into(),
    }
}

#[derive(Deserialize)]
struct Envelope {
    ok: bool,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

/// The helper's one JSON object, or its error. Anything else (sudo asking for a
/// password, a crash) means the helper is not usable. Only a zero exit counts
/// as success, whatever was printed; an `ok: false` answer keeps its code.
fn answer(exited_ok: bool, stdout: &[u8], stderr: &[u8]) -> Result<Value, NetworkError> {
    let text = String::from_utf8_lossy(stdout);
    let Some(value) = serde_json::from_str::<Value>(text.trim())
        .ok()
        .filter(Value::is_object)
    else {
        let why = String::from_utf8_lossy(stderr).trim().to_string();
        return Err(failure(
            "unavailable",
            if why.is_empty() {
                "the network helper gave no answer".to_string()
            } else {
                why
            },
        ));
    };
    let envelope = Envelope::deserialize(&value)
        .map_err(|e| failure("unavailable", format!("network helper: {e}")))?;
    if envelope.ok && exited_ok {
        Ok(value)
    } else if envelope.ok {
        let why = String::from_utf8_lossy(stderr).trim().to_string();
        Err(failure(
            "unavailable",
            if why.is_empty() {
                "the network helper failed".to_string()
            } else {
                why
            },
        ))
    } else {
        Err(failure(
            envelope.error.as_deref().unwrap_or("unavailable"),
            envelope.message.unwrap_or_default(),
        ))
    }
}

fn typed<T: DeserializeOwned>(value: Value) -> Result<T, NetworkError> {
    serde_json::from_value(value)
        .map_err(|e| failure("unavailable", format!("network helper: {e}")))
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct ScanReply {
    networks: Vec<WifiNetwork>,
}

#[derive(Debug, Default, PartialEq, Deserialize)]
#[serde(default)]
struct ConnectReply {
    uuid: Option<String>,
    connected: bool,
    reason: Option<String>,
    message: Option<String>,
}

/// The status with the clock also in the local time zone.
fn status(value: Value) -> Result<NetworkStatus, NetworkError> {
    let mut status: NetworkStatus = typed(value)?;
    status.clock.local = status.clock.utc.as_deref().and_then(local_time);
    Ok(status)
}

fn local_time(utc: &str) -> Option<String> {
    let at: jiff::Timestamp = utc.parse().ok()?;
    let zoned = at.to_zoned(jiff::tz::TimeZone::system());
    Some(zoned.strftime("%Y-%m-%d %H:%M %Z").to_string())
}

#[derive(Debug)]
enum Done {
    Status(Result<NetworkStatus, NetworkError>),
    Scan(Result<Vec<WifiNetwork>, NetworkError>),
    Connect(String, Result<ConnectReply, NetworkError>),
    Forget(String, Result<(), NetworkError>),
}

fn start(helper: &Helper, call: Call, done: &mpsc::UnboundedSender<Done>) {
    let helper = helper.clone();
    let done = done.clone();
    tokio::spawn(async move {
        let result = helper.run(&call).await;
        let _ = done.send(match call {
            Call::Status => Done::Status(result.and_then(status)),
            Call::Scan => Done::Scan(result.and_then(typed::<ScanReply>).map(|r| r.networks)),
            Call::Connect(join) => Done::Connect(join.ssid, result.and_then(typed)),
            Call::Forget(uuid) => Done::Forget(uuid, result.map(|_| ())),
        });
    });
}

struct Run {
    helper: Helper,
    net: Network,
    watched: bool,
    status_busy: bool,
    done: mpsc::UnboundedSender<Done>,
}

impl Run {
    fn refresh(&mut self) {
        if !self.status_busy {
            self.status_busy = true;
            start(&self.helper, Call::Status, &self.done);
        }
    }

    fn ask(&mut self, ask: NetworkAsk) {
        match ask {
            NetworkAsk::Watch(on) => {
                self.watched = on;
                if on {
                    self.net.error = None;
                    self.refresh();
                }
            }
            NetworkAsk::Refresh => self.refresh(),
            NetworkAsk::Scan => {
                if !self.net.scanning {
                    self.net.scanning = true;
                    self.net.error = None;
                    start(&self.helper, Call::Scan, &self.done);
                }
            }
            NetworkAsk::Connect(join) => {
                if self.net.connecting.is_none() {
                    self.net.joins += 1;
                    self.net.connecting = Some(join.ssid.clone());
                    self.net.error = None;
                    start(&self.helper, Call::Connect(join), &self.done);
                }
            }
            NetworkAsk::Forget(uuid) => {
                if self.net.forgetting.is_none() {
                    self.net.forgetting = Some(uuid.clone());
                    self.net.error = None;
                    start(&self.helper, Call::Forget(uuid), &self.done);
                }
            }
        }
    }

    fn finish(&mut self, done: Done) {
        match done {
            Done::Status(result) => {
                self.status_busy = false;
                match result {
                    Ok(status) => self.net.status = Some(status),
                    Err(e) => self.net.error = Some(e),
                }
            }
            Done::Scan(result) => {
                self.net.scanning = false;
                match result {
                    Ok(networks) => {
                        self.net.networks = networks;
                        self.net.scanned = true;
                    }
                    Err(e) => self.net.error = Some(e),
                }
            }
            Done::Connect(ssid, result) => {
                self.net.connecting = None;
                let mut outcome = JoinOutcome {
                    id: self.net.joins,
                    ssid: ssid.clone(),
                    ..Default::default()
                };
                match result {
                    Ok(reply) if reply.connected => {
                        outcome.connected = true;
                        for n in &mut self.net.networks {
                            n.in_use = n.ssid == ssid;
                            n.saved |= n.ssid == ssid;
                        }
                    }
                    Ok(reply) => {
                        self.net.error = Some(failure(
                            reply.reason.as_deref().unwrap_or("activation-failed"),
                            reply.message.unwrap_or_default(),
                        ));
                        // A profile is kept even when joining failed.
                        if reply.uuid.is_some() {
                            for n in self.net.networks.iter_mut().filter(|n| n.ssid == ssid) {
                                n.saved = true;
                            }
                        }
                    }
                    Err(e) => self.net.error = Some(e),
                }
                outcome.error = self.net.error.clone();
                self.net.joined = Some(outcome);
                self.refresh();
            }
            Done::Forget(uuid, result) => {
                self.net.forgetting = None;
                match result {
                    Ok(()) => {
                        let ssid = self.net.status.as_ref().and_then(|s| {
                            s.wifi_profiles
                                .iter()
                                .find(|p| p.uuid == uuid)
                                .map(|p| p.ssid.clone())
                        });
                        if let Some(status) = &mut self.net.status {
                            status.wifi_profiles.retain(|p| p.uuid != uuid);
                        }
                        let still = |ssid: &str, net: &Network| {
                            net.status
                                .as_ref()
                                .is_some_and(|s| s.wifi_profiles.iter().any(|p| p.ssid == ssid))
                        };
                        if let Some(ssid) = ssid
                            && !still(&ssid, &self.net)
                        {
                            for n in self.net.networks.iter_mut().filter(|n| n.ssid == ssid) {
                                n.saved = false;
                            }
                        }
                    }
                    Err(e) => self.net.error = Some(e),
                }
                self.refresh();
            }
        }
    }
}

/// Serves the network page. Only started when [`Helper::available`].
pub async fn run(core: Arc<Core>, asks: mpsc::UnboundedReceiver<NetworkAsk>) {
    serve(core, asks, Helper::livi_os()).await;
}

async fn serve(core: Arc<Core>, mut asks: mpsc::UnboundedReceiver<NetworkAsk>, helper: Helper) {
    let (done, mut finished) = mpsc::unbounded_channel();
    let mut run = Run {
        helper,
        net: Network {
            available: true,
            ..Default::default()
        },
        watched: false,
        status_busy: false,
        done,
    };
    run.refresh();
    core.hub.update(|s| s.network = run.net.clone());
    let path = core.ui_path.subscribe();
    let mut poll = tokio::time::interval(POLL);
    poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            ask = asks.recv() => match ask {
                Some(ask) => run.ask(ask),
                None => return,
            },
            Some(done) = finished.recv() => run.finish(done),
            _ = poll.tick() => {
                if run.watched && path.borrow().starts_with(SETTINGS) {
                    run.refresh();
                }
            }
        }
        core.hub.update(|s| s.network = run.net.clone());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATUS: &str = r#"{"ok":true,"state":"connected","connectivity":"full",
        "devices":[
          {"device":"eth0","type":"ethernet","state":"connected","connection":"Wired connection 1",
           "ipv4":["192.168.1.5/24"],"gateway":"192.168.1.1"},
          {"device":"wlan0","type":"wifi","state":"unavailable","connection":null,"ipv4":[]}
        ],
        "projection_ap":true,
        "wifi_profiles":[{"uuid":"u-1","name":"Garage","ssid":"Garage","autoconnect":true}],
        "clock":{"synchronized":true,"rtc":false,"utc":"2026-03-01T12:34:56+00:00","server":"pool.ntp.org"},
        "future":1}"#;

    fn sh(script: &str) -> Helper {
        Helper {
            program: "sh".into(),
            lead: vec!["-c".into(), script.into(), "livi-network".into()],
        }
    }

    fn join(psk: Option<&str>) -> Join {
        Join {
            ssid: "Garage".into(),
            psk: psk.map(|p| Secret(p.into())),
            hidden: true,
            security: None,
        }
    }

    #[test]
    fn status_parses_with_the_helper_names() {
        let s = status(answer(true, STATUS.as_bytes(), b"").unwrap()).unwrap();
        assert_eq!(s.connectivity, "full");
        assert!(s.projection_ap);
        assert_eq!(s.devices.len(), 2);
        assert_eq!(s.devices[0].kind, "ethernet");
        assert_eq!(s.devices[0].ipv4, ["192.168.1.5/24"]);
        assert_eq!(s.devices[0].gateway.as_deref(), Some("192.168.1.1"));
        assert_eq!(s.devices[1].connection, None);
        assert_eq!(s.devices[1].gateway, None);
        assert_eq!(s.wifi_profiles[0].ssid, "Garage");
        assert!(s.clock.synchronized);
        assert_eq!(s.clock.server.as_deref(), Some("pool.ntp.org"));
        assert!(s.clock.local.is_some());
    }

    #[test]
    fn scan_connect_and_forget_parse() {
        let scan = r#"{"ok":true,"interface":"wlan0","networks":[
            {"ssid":"Garage","signal":72,"security":"WPA2","in_use":true,"saved":true},
            {"ssid":"Cafe","signal":30,"security":"","in_use":false,"saved":false}]}"#;
        let networks = typed::<ScanReply>(answer(true, scan.as_bytes(), b"").unwrap())
            .unwrap()
            .networks;
        assert_eq!(networks.len(), 2);
        assert_eq!(networks[0].signal, 72);
        assert!(networks[0].in_use && networks[0].saved);
        assert_eq!(networks[1].security, "");

        let reply: ConnectReply = typed(
            answer(
                true,
                br#"{"ok":true,"uuid":"u-2","connected":false,"reason":"projection-ap","message":"busy"}"#,
                b"",
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            reply,
            ConnectReply {
                uuid: Some("u-2".into()),
                connected: false,
                reason: Some("projection-ap".into()),
                message: Some("busy".into()),
            }
        );
        assert!(answer(true, br#"{"ok":true,"uuid":"u-2"}"#, b"").is_ok());
    }

    #[test]
    fn errors_keep_the_helper_code() {
        assert_eq!(
            answer(
                false,
                br#"{"ok": false, "error": "not-found", "message": "no such profile"}"#,
                b""
            ),
            Err(failure("not-found", "no such profile"))
        );
        assert_eq!(
            answer(false, b"", b"sudo: a password is required\n"),
            Err(failure("unavailable", "sudo: a password is required"))
        );
        assert_eq!(answer(true, b"[]", b"").unwrap_err().code, "unavailable");
        assert_eq!(
            answer(
                false,
                br#"{"ok":true,"uuid":"u-2","connected":true}"#,
                b"nmcli died\n"
            ),
            Err(failure("unavailable", "nmcli died"))
        );
        assert_eq!(
            answer(false, br#"{"ok":true}"#, b"").unwrap_err().code,
            "unavailable"
        );
    }

    #[test]
    fn the_password_goes_on_stdin_only() {
        let call = Call::Connect(join(Some("hunter22")));
        let cmd = Helper::livi_os().command(&call);
        let std = cmd.as_std();
        assert_eq!(std.get_program(), "sudo");
        let args: Vec<_> = std.get_args().collect();
        assert_eq!(args, ["-n", crate::livi_os::NETWORK, "connect"]);
        assert!(!format!("{call:?}").contains("hunter22"));
        let request: Value = serde_json::from_slice(&call.stdin().unwrap()).unwrap();
        assert_eq!(
            request,
            json!({ "ssid": "Garage", "psk": "hunter22", "hidden": true })
        );
        let open: Value =
            serde_json::from_slice(&Call::Connect(join(None)).stdin().unwrap()).unwrap();
        assert_eq!(open["psk"], Value::Null);
        let wpa3 = Call::Connect(Join {
            security: Some(WifiSecurity::Wpa3),
            ..join(Some("hunter22"))
        });
        let request: Value = serde_json::from_slice(&wpa3.stdin().unwrap()).unwrap();
        assert_eq!(request["security"], "wpa3");
        let cmd = Helper::livi_os().command(&wpa3);
        let args: Vec<_> = cmd.as_std().get_args().collect();
        assert_eq!(args, ["-n", crate::livi_os::NETWORK, "connect"]);
        assert_eq!(Call::Status.stdin(), None);
        let forget = Helper::livi_os().command(&Call::Forget("u-1".into()));
        let args: Vec<_> = forget.as_std().get_args().collect();
        assert_eq!(args, ["-n", crate::livi_os::NETWORK, "forget", "u-1"]);
    }

    #[tokio::test]
    async fn the_helper_reads_the_request_from_stdin() {
        let helper =
            sh(r#"read -r line; printf '{"ok":true,"args":"%s","request":%s}' "$*" "$line""#);
        let got = helper
            .run(&Call::Connect(join(Some("hunter22"))))
            .await
            .unwrap();
        assert_eq!(got["args"], "connect");
        assert_eq!(got["request"]["psk"], "hunter22");
    }

    #[tokio::test]
    async fn failures_and_silence_become_errors() {
        let failing = sh(r#"echo '{"ok":false,"error":"no-wifi","message":"no radio"}'; exit 1"#);
        assert_eq!(
            failing.run(&Call::Scan).await,
            Err(failure("no-wifi", "no radio"))
        );
        let lying =
            sh(r#"echo '{"ok":true,"uuid":"u-2","connected":true}'; echo boom >&2; exit 3"#);
        assert_eq!(
            lying.run(&Call::Connect(join(None))).await,
            Err(failure("unavailable", "boom"))
        );
        let missing = Helper {
            program: "/nonexistent/livi-network".into(),
            lead: Vec::new(),
        };
        assert_eq!(
            missing.run(&Call::Status).await.unwrap_err().code,
            "unavailable"
        );
    }

    #[tokio::test]
    async fn a_helper_cannot_succeed_after_rejecting_its_request() {
        let password = "x".repeat(1024 * 1024);
        let call = Call::Connect(join(Some(&password)));
        let helper = sh(r#"exec 0<&-; echo '{"ok":true,"connected":true}'"#);
        let error = helper.run(&call).await.unwrap_err();
        assert_eq!(error.code, "unavailable");
        assert!(error.message.starts_with("cannot send request"));

        let rejected = sh(
            r#"exec 0<&-; echo '{"ok":false,"error":"invalid","message":"bad request"}'; exit 1"#,
        );
        assert_eq!(
            rejected.run(&call).await,
            Err(failure("invalid", "bad request"))
        );
    }

    fn running() -> (Run, mpsc::UnboundedReceiver<Done>) {
        let (done, finished) = mpsc::unbounded_channel();
        let run = Run {
            helper: sh("exit 1"),
            net: Network {
                available: true,
                ..Default::default()
            },
            watched: false,
            status_busy: true,
            done,
        };
        (run, finished)
    }

    #[tokio::test]
    async fn joining_marks_busy_then_reports_the_reason() {
        let (mut run, _finished) = running();
        run.net.networks = vec![WifiNetwork {
            ssid: "Garage".into(),
            ..Default::default()
        }];
        run.ask(NetworkAsk::Connect(join(Some("hunter22"))));
        assert_eq!(run.net.connecting.as_deref(), Some("Garage"));
        run.finish(Done::Connect(
            "Garage".into(),
            Ok(ConnectReply {
                uuid: Some("u-2".into()),
                connected: false,
                reason: Some("projection-ap".into()),
                message: None,
            }),
        ));
        assert_eq!(run.net.connecting, None);
        assert_eq!(run.net.error.as_ref().unwrap().code, "projection-ap");
        let outcome = run.net.joined.clone().unwrap();
        assert_eq!((outcome.id, outcome.ssid.as_str()), (1, "Garage"));
        assert!(!outcome.connected);
        assert_eq!(outcome.error.unwrap().code, "projection-ap");
        run.ask(NetworkAsk::Connect(join(Some("hunter22"))));
        assert_eq!(run.net.joins, 2);
        assert_eq!(run.net.joined.as_ref().unwrap().id, 1);
        run.finish(Done::Connect(
            "Garage".into(),
            Ok(ConnectReply {
                connected: true,
                ..Default::default()
            }),
        ));
        let outcome = run.net.joined.clone().unwrap();
        assert_eq!(outcome.id, 2);
        assert!(outcome.connected && outcome.error.is_none());
        assert!(run.net.networks[0].saved);
        assert!(run.net.networks[0].in_use);
    }

    #[tokio::test]
    async fn forgetting_drops_the_profile() {
        let (mut run, _finished) = running();
        run.net.status = typed(serde_json::from_str(STATUS).unwrap()).ok();
        run.net.networks = vec![WifiNetwork {
            ssid: "Garage".into(),
            saved: true,
            ..Default::default()
        }];
        run.ask(NetworkAsk::Forget("u-1".into()));
        assert_eq!(run.net.forgetting.as_deref(), Some("u-1"));
        run.finish(Done::Forget("u-1".into(), Ok(())));
        assert_eq!(run.net.forgetting, None);
        assert!(run.net.status.as_ref().unwrap().wifi_profiles.is_empty());
        assert!(!run.net.networks[0].saved);
    }

    #[tokio::test]
    async fn a_scan_fills_the_list() {
        let helper = sh(r#"case "$1" in
              scan) echo '{"ok":true,"interface":"wlan0","networks":[{"ssid":"Cafe","signal":40,"security":"","in_use":false,"saved":false}]}' ;;
              *) echo '{"ok":true,"state":"connected","connectivity":"none","devices":[],"projection_ap":false,"wifi_profiles":[],"clock":{"synchronized":false,"rtc":true,"utc":null,"server":null}}' ;;
            esac"#);
        let (mut run, mut finished) = running();
        run.helper = helper;
        run.status_busy = false;
        run.ask(NetworkAsk::Watch(true));
        run.ask(NetworkAsk::Scan);
        assert!(run.net.scanning);
        for _ in 0..2 {
            let done = finished.recv().await.unwrap();
            run.finish(done);
        }
        assert!(!run.net.scanning && run.net.scanned);
        assert_eq!(run.net.networks[0].ssid, "Cafe");
        assert_eq!(run.net.status.as_ref().unwrap().connectivity, "none");
        assert_eq!(run.net.error, None);
    }
}
