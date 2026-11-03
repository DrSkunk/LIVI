// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

//! The LIVI OS network page, read from `state["network"]`, and the form that
//! joins a Wi-Fi network.

use livi_core_proto::message::{Action, Secret, WifiSecurity};
use livi_core_proto::state::{NetDevice, Network, NetworkError, NetworkStatus, WifiNetwork};
use serde_json::Value;

use super::info;
use crate::i18n::Strings;
use crate::icons::settings_icon;
use crate::settings::view::{Device, Local, Presence, Row, RowKind, Tool};

pub fn network(state: &Value) -> Network {
    serde_json::from_value(state["network"].clone()).unwrap_or_default()
}

/// The page only exists where the OS ships the helper.
pub fn available(state: &Value) -> bool {
    state["network"]["available"].as_bool() == Some(true)
}

fn address(d: &NetDevice) -> Option<&str> {
    d.ipv4
        .first()
        .map(|a| a.split_once('/').map_or(a.as_str(), |(ip, _)| ip))
}

/// `connected`, or a variant NetworkManager reports such as
/// `connected (externally)`; not `connecting`.
pub fn connected(state: &str) -> bool {
    state
        .strip_prefix("connected")
        .is_some_and(|rest| rest.is_empty() || rest.starts_with([' ', '(', ':']))
}

fn device_state(d: &NetDevice, t: &Strings) -> String {
    match d.state.as_str() {
        s if connected(s) => address(d)
            .map(str::to_string)
            .unwrap_or_else(|| t.t("network.connected", "Connected")),
        s if s.starts_with("connecting") => t.t("network.connecting", "Connecting…"),
        "unavailable" | "unmanaged" => t.t("network.unavailable", "Unavailable"),
        _ => t.t("network.disconnected", "Disconnected"),
    }
}

/// The SSID behind the Wi-Fi device's connection (profile names may differ).
fn joined_ssid<'a>(s: &'a NetworkStatus, d: &'a NetDevice) -> Option<&'a str> {
    let name = d.connection.as_deref()?;
    Some(
        s.wifi_profiles
            .iter()
            .find(|p| p.name == name)
            .map_or(name, |p| p.ssid.as_str()),
    )
}

fn connectivity(c: &str, t: &Strings) -> String {
    match c {
        "full" => t.t("network.online", "Online"),
        "limited" => t.t("network.limited", "Limited"),
        "portal" => t.t("network.portal", "Sign-in required"),
        "none" => t.t("network.offline", "Offline"),
        _ => t.t("network.unknown", "Unknown"),
    }
}

/// `2026-03-01T12:34:56+00:00` as `2026-03-01 12:34 UTC`.
fn utc_text(utc: &str) -> String {
    match utc.get(..16) {
        Some(head) => format!("{} UTC", head.replacen('T', " ", 1)),
        None => utc.to_string(),
    }
}

pub fn error_text(e: &NetworkError, t: &Strings) -> String {
    let known = match e.code.as_str() {
        "projection-ap" => Some(t.t(
            "network.errorProjectionAp",
            "Wi-Fi is in use by wireless CarPlay/Android Auto",
        )),
        "no-wifi" => Some(t.t("network.errorNoWifi", "No Wi-Fi adapter")),
        "timeout" => Some(t.t("network.errorTimeout", "No answer in time")),
        "not-found" => Some(t.t("network.errorNotFound", "Network not found")),
        "activation-failed" => Some(t.t(
            "network.errorActivation",
            "Could not connect. Check the password.",
        )),
        "unavailable" => Some(t.t("network.errorUnavailable", "Network service unavailable")),
        _ => None,
    };
    match (known, e.message.trim()) {
        (Some(k), _) => k,
        (None, "") => e.code.clone(),
        (None, m) => m.to_string(),
    }
}

fn status_rows(s: &NetworkStatus, t: &Strings) -> Vec<Row> {
    let mut rows = Vec::new();
    for d in s.devices.iter().filter(|d| d.kind == "ethernet") {
        rows.push(info(
            t.t("network.ethernet", "Ethernet"),
            Some("ethernet"),
            device_state(d, t),
        ));
    }
    let radios = s.devices.iter().filter(|d| d.kind == "wifi").count();
    for d in s.devices.iter().filter(|d| d.kind == "wifi") {
        let wifi = t.t("network.wifi", "Wi-Fi");
        let wifi = if radios > 1 {
            format!("{wifi} ({})", d.device)
        } else {
            wifi
        };
        let label = match joined_ssid(s, d) {
            Some(ssid) if connected(&d.state) => format!("{wifi} · {ssid}"),
            _ => wifi,
        };
        // The access point takes its radio out of NetworkManager's hands; a
        // second, managed adapter stays a normal client.
        let value = if s.projection_ap && d.state == "unmanaged" {
            t.t("network.wifiProjection", "Wireless CarPlay/AA")
        } else {
            device_state(d, t)
        };
        rows.push(info(label, Some("wifi"), value));
    }
    rows.push(info(
        t.t("network.internet", "Internet"),
        Some("internet"),
        connectivity(&s.connectivity, t),
    ));
    let clock = &s.clock;
    rows.push(info(
        t.t("network.clock", "Time sync (NTP)"),
        Some("clock"),
        match (&clock.server, clock.synchronized) {
            (Some(server), true) => server.clone(),
            (None, true) => t.t("network.synchronized", "Synchronized"),
            (_, false) => t.t("network.notSynchronized", "Not synchronized"),
        },
    ));
    if let Some(local) = &clock.local {
        rows.push(info(
            t.t("network.localTime", "Local time"),
            None,
            local.clone(),
        ));
    }
    if let Some(utc) = &clock.utc {
        rows.push(info(t.t("network.utcTime", "UTC"), None, utc_text(utc)));
    }
    if s.projection_ap {
        rows.push(info(
            t.t(
                "network.projectionAp",
                "Wi-Fi radio is used by wireless CarPlay/Android Auto",
            ),
            None,
            String::new(),
        ));
        rows.push(info(
            t.t(
                "network.projectionApHint",
                "Saved networks connect when it is released",
            ),
            None,
            String::new(),
        ));
    }
    rows
}

fn signal(level: u8) -> u8 {
    (u16::from(level.min(100)) * 5).div_ceil(100) as u8
}

fn network_row(
    i: usize,
    n: &WifiNetwork,
    status: Option<&NetworkStatus>,
    busy: bool,
    t: &Strings,
) -> Row {
    let in_use = status.map_or(n.in_use, |status| {
        status.devices.iter().any(|device| {
            device.kind == "wifi"
                && connected(&device.state)
                && joined_ssid(status, device) == Some(n.ssid.as_str())
        })
    });
    let presence = if in_use {
        Presence::Active
    } else if n.saved {
        Presence::Available
    } else {
        Presence::Offline
    };
    Row {
        kind: RowKind::Device,
        label: n.ssid.clone(),
        value: if in_use {
            t.t("network.connected", "Connected")
        } else if n.saved {
            t.t("network.saved", "Saved")
        } else {
            n.security.clone()
        },
        enabled: !busy,
        local: Some(Local::JoinNetwork(i)),
        device: Some(Device {
            protocol_icon: "WifiOutlined",
            transport_icon: (!n.security.is_empty()).then_some("KeyOutlined"),
            battery: None,
            signal: Some(signal(n.signal)),
            presence,
        }),
        ..Row::default()
    }
}

pub fn rows(state: &Value, t: &Strings) -> Vec<Row> {
    let net = network(state);
    if !net.available {
        return vec![info(
            t.t("network.notAvailable", "Network settings are not available"),
            None,
            String::new(),
        )];
    }
    let mut rows = match &net.status {
        Some(s) => status_rows(s, t),
        None => vec![info(
            t.t("network.reading", "Reading network status…"),
            None,
            String::new(),
        )],
    };
    if let Some(e) = &net.error {
        rows.push(Row {
            alert: true,
            ..info(error_text(e, t), None, String::new())
        });
    }
    if let Some(ssid) = &net.connecting {
        rows.push(info(
            t.with(
                "network.joining",
                "Connecting to {{ssid}}…",
                &[("ssid", ssid)],
            ),
            None,
            String::new(),
        ));
    }
    let busy = net.connecting.is_some();
    rows.push(Row {
        kind: RowKind::Button,
        label: if net.scanning {
            t.t("network.scanning", "Scanning…")
        } else {
            t.t("network.wifiNetworks", "Wi-Fi networks")
        },
        button: t.t("network.scan", "Scan"),
        outlined: true,
        enabled: !net.scanning && !busy,
        action: Some(Action::NetworkScan),
        ..Row::default()
    });
    rows.push(Row {
        kind: RowKind::Button,
        label: t.t("network.hiddenNetwork", "Hidden network"),
        button: t.t("network.add", "Add"),
        outlined: true,
        enabled: !busy,
        local: Some(Local::JoinHidden),
        ..Row::default()
    });
    if net.scanned {
        let found: Vec<Row> = net
            .networks
            .iter()
            .enumerate()
            .filter(|(_, n)| !n.ssid.is_empty())
            .map(|(i, n)| network_row(i, n, net.status.as_ref(), busy, t))
            .collect();
        if found.is_empty() {
            rows.push(info(
                t.t("network.noneFound", "No networks found"),
                None,
                String::new(),
            ));
        }
        rows.extend(found);
    }
    let profiles = net
        .status
        .as_ref()
        .map(|s| s.wifi_profiles.as_slice())
        .unwrap_or_default();
    if !profiles.is_empty() {
        rows.push(info(
            t.t("network.savedNetworks", "Saved networks"),
            None,
            String::new(),
        ));
    }
    for p in profiles {
        rows.push(Row {
            kind: RowKind::Item,
            label: if p.ssid.is_empty() {
                p.name.clone()
            } else {
                p.ssid.clone()
            },
            icon: settings_icon("wifi"),
            enabled: true,
            dimmed: net.forgetting.as_deref() == Some(p.uuid.as_str()),
            tools: vec![Tool {
                icon: "Close",
                label: t.t("network.forget", "Forget"),
                on: false,
                tint: None,
                enabled: net.forgetting.is_none(),
                switch: false,
                action: Action::NetworkForget {
                    uuid: p.uuid.clone(),
                },
            }],
            ..Row::default()
        });
    }
    rows
}

/// The join form for one network, open over the network page.
#[derive(Debug, Clone, PartialEq)]
pub struct Join {
    pub ssid: String,
    pub hidden: bool,
    pub secured: bool,
    pub saved: bool,
    /// Chosen for a hidden network; None leaves it to the helper.
    pub security: Option<WifiSecurity>,
    /// What the scan reported, e.g. "WPA2 WPA3"; empty if not scanned.
    pub detected: String,
    pub phase: Phase,
    /// Joins numbered up to this one were not this form's.
    pub after: u64,
    pub problem: Option<String>,
    /// Why the last join from this form failed.
    pub failed: Option<NetworkError>,
}

/// The security choices of the hidden network form, in order.
pub const SECURITY_CHOICES: [Option<WifiSecurity>; 4] = [
    None,
    Some(WifiSecurity::Open),
    Some(WifiSecurity::Wpa2),
    Some(WifiSecurity::Wpa3),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Editing,
    /// Asked the core; its outcome may arrive without `connecting` ever seen.
    Sent,
    Connecting,
}

/// What the form shows.
#[derive(Debug, Clone, PartialEq)]
pub struct JoinView {
    pub title: String,
    pub ssid_label: String,
    pub psk_label: String,
    pub psk_hint: String,
    pub show_label: String,
    pub connect: String,
    pub ask_ssid: bool,
    pub ask_security: bool,
    pub security_label: String,
    pub security_options: Vec<String>,
    /// Index into [`SECURITY_CHOICES`].
    pub security_index: usize,
    pub ask_psk: bool,
    pub busy: bool,
    pub status: String,
    pub error: String,
}

impl Join {
    pub fn hidden() -> Self {
        Self {
            ssid: String::new(),
            hidden: true,
            secured: true,
            saved: false,
            security: None,
            detected: String::new(),
            phase: Phase::Editing,
            after: 0,
            problem: None,
            failed: None,
        }
    }

    /// The scanned network at `index`.
    pub fn scanned(state: &Value, index: usize) -> Option<Self> {
        let n = network(state).networks.into_iter().nth(index)?;
        Some(Self {
            secured: !n.security.is_empty(),
            saved: n.saved,
            security: None,
            detected: n.security,
            ssid: n.ssid,
            hidden: false,
            phase: Phase::Editing,
            after: 0,
            problem: None,
            failed: None,
        })
    }

    /// Picks entry `index` of [`SECURITY_CHOICES`]; only a hidden network asks.
    pub fn choose(&mut self, index: usize) {
        if let (true, Some(&choice)) = (self.hidden, SECURITY_CHOICES.get(index)) {
            self.security = choice;
            self.problem = None;
        }
    }

    fn asks_psk(&self) -> bool {
        self.secured && self.security != Some(WifiSecurity::Open)
    }

    /// The connect action for what was typed, or why it cannot be sent.
    pub fn request(&mut self, state: &Value, ssid: &str, psk: &str, t: &Strings) -> Option<Action> {
        let psk = if self.asks_psk() { psk } else { "" };
        let chosen = matches!(self.security, Some(WifiSecurity::Wpa2 | WifiSecurity::Wpa3));
        // Kept exactly: an SSID may start or end with spaces.
        let ssid = if self.hidden {
            ssid.to_string()
        } else {
            self.ssid.clone()
        };
        let problem = if ssid.is_empty() || ssid.len() > 32 {
            Some(t.t(
                "network.ssidInvalid",
                "Enter the network name (up to 32 bytes)",
            ))
        } else if !psk.is_empty() && !psk_valid(psk) {
            Some(t.t(
                "network.pskInvalid",
                "Password: 8-63 characters or 64 hex digits",
            ))
        } else if psk.is_empty() && (chosen || self.secured && !self.hidden && !self.saved) {
            Some(t.t("network.pskMissing", "Enter the password"))
        } else {
            None
        };
        self.problem = problem;
        if self.problem.is_some() {
            return None;
        }
        let net = network(state);
        self.after = net.joins.max(net.joined.map_or(0, |o| o.id));
        self.failed = None;
        self.ssid.clone_from(&ssid);
        self.phase = Phase::Sent;
        Some(Action::NetworkConnect {
            ssid,
            psk: (!psk.is_empty()).then(|| Secret(psk.to_string())),
            hidden: self.hidden,
            security: self.security,
        })
    }

    /// Follows the core's answer; true once joined and the form can close.
    pub fn follow(&mut self, state: &Value) -> bool {
        if self.phase == Phase::Editing {
            return false;
        }
        let net = network(state);
        let ours = net
            .joined
            .filter(|o| o.id > self.after && o.ssid == self.ssid);
        if let Some(outcome) = ours {
            self.phase = Phase::Editing;
            self.failed = match (outcome.connected, outcome.error) {
                (true, _) => None,
                (false, e) => Some(e.unwrap_or_else(|| NetworkError {
                    code: "activation-failed".into(),
                    message: String::new(),
                })),
            };
            return outcome.connected;
        }
        if net.connecting.as_deref() == Some(self.ssid.as_str()) {
            self.phase = Phase::Connecting;
        }
        false
    }

    pub fn view(&self, state: &Value, t: &Strings) -> JoinView {
        let net = network(state);
        let busy = self.phase != Phase::Editing;
        let error = match (&self.problem, self.failed.as_ref().or(net.error.as_ref())) {
            (Some(p), _) => p.clone(),
            (None, Some(e)) if !busy => error_text(e, t),
            _ => String::new(),
        };
        JoinView {
            title: if self.hidden {
                t.t("network.hiddenNetwork", "Hidden network")
            } else {
                self.ssid.clone()
            },
            ssid_label: t.t("network.ssid", "Network name"),
            psk_label: t.t("network.password", "Password"),
            psk_hint: [
                self.detected.clone(),
                if self.saved {
                    t.t("network.pskSaved", "Leave empty to use the saved password")
                } else if self.hidden && self.security.is_none() {
                    t.t(
                        "network.pskOpen",
                        "Leave empty for an open network or saved password",
                    )
                } else {
                    String::new()
                },
            ]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" · "),
            show_label: t.t("network.showPassword", "Show"),
            connect: t.t("network.connect", "Connect"),
            ask_ssid: self.hidden,
            ask_security: self.hidden,
            security_label: t.t("network.security", "Security"),
            security_options: SECURITY_CHOICES
                .iter()
                .map(|c| match c {
                    None => t.t("network.securityAuto", "Automatic"),
                    Some(WifiSecurity::Open) => t.t("network.securityOpen", "Open"),
                    Some(WifiSecurity::Wpa2) => "WPA2".into(),
                    Some(WifiSecurity::Wpa3) => "WPA3".into(),
                })
                .collect(),
            security_index: SECURITY_CHOICES
                .iter()
                .position(|c| *c == self.security)
                .unwrap_or(0),
            ask_psk: self.asks_psk(),
            busy,
            status: if busy {
                t.with(
                    "network.joining",
                    "Connecting to {{ssid}}…",
                    &[("ssid", &self.ssid)],
                )
            } else {
                String::new()
            },
            error,
        }
    }
}

/// WPA-PSK: 8-63 printable ASCII characters or 64 hex digits.
pub fn psk_valid(psk: &str) -> bool {
    let printable = psk.bytes().all(|b| (0x20..=0x7e).contains(&b));
    (printable && (8..=63).contains(&psk.len()))
        || (psk.len() == 64 && psk.bytes().all(|b| b.is_ascii_hexdigit()))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn state() -> Value {
        json!({ "network": {
            "available": true,
            "status": {
                "state": "connected", "connectivity": "full",
                "devices": [
                    { "device": "eth0", "type": "ethernet", "state": "connected",
                      "connection": "Wired connection 1", "ipv4": ["192.168.1.5/24"], "gateway": "192.168.1.1" },
                    { "device": "wlan0", "type": "wifi", "state": "connected",
                      "connection": "home-profile", "ipv4": ["10.0.0.7/24"] }
                ],
                "projectionAp": false,
                "wifiProfiles": [{ "uuid": "u-1", "name": "home-profile", "ssid": "Home", "autoconnect": true }],
                "clock": { "synchronized": true, "rtc": true, "utc": "2026-03-01T12:34:56+00:00",
                           "server": "pool.ntp.org", "local": "2026-03-01 13:34 CET" }
            },
            "networks": [
                { "ssid": "Home", "signal": 80, "security": "WPA2", "inUse": true, "saved": true },
                { "ssid": "Cafe", "signal": 12, "security": "", "inUse": false, "saved": false },
                { "ssid": "", "signal": 50, "security": "WPA2", "inUse": false, "saved": false }
            ],
            "scanned": true
        } })
    }

    fn t() -> Strings {
        Strings::new("en")
    }

    #[test]
    fn status_rows_show_addresses_ssid_and_clock() {
        let rows = rows(&state(), &t());
        let find = |label: &str| rows.iter().find(|r| r.label == label).unwrap();
        assert_eq!(find("Ethernet").value, "192.168.1.5");
        assert_eq!(find("Wi-Fi · Home").value, "10.0.0.7");
        assert_eq!(find("Internet").value, "Online");
        assert_eq!(find("Time sync (NTP)").value, "pool.ntp.org");
        assert_eq!(find("UTC").value, "2026-03-01 12:34 UTC");
        assert_eq!(find("Local time").value, "2026-03-01 13:34 CET");
        let forget = &rows.iter().find(|r| r.kind == RowKind::Item).unwrap().tools[0];
        assert_eq!(forget.action, Action::NetworkForget { uuid: "u-1".into() });
    }

    #[test]
    fn scanned_networks_become_device_rows() {
        let rows = rows(&state(), &t());
        let found: Vec<_> = rows.iter().filter(|r| r.kind == RowKind::Device).collect();
        assert_eq!(found.len(), 2);
        let home = found[0].device.as_ref().unwrap();
        assert_eq!(home.presence, Presence::Active);
        assert_eq!(home.transport_icon, Some("KeyOutlined"));
        assert_eq!(home.signal, Some(4));
        assert_eq!(found[1].local, Some(Local::JoinNetwork(1)));
        assert_eq!(found[1].device.as_ref().unwrap().transport_icon, None);
    }

    #[test]
    fn scanned_connection_state_follows_live_devices() {
        let mut s = state();
        s["network"]["status"]["devices"][1]["state"] = json!("disconnected");
        s["network"]["status"]["devices"][1]["connection"] = Value::Null;
        let disconnected = rows(&s, &t());
        let home = disconnected
            .iter()
            .find(|r| r.kind == RowKind::Device && r.label == "Home")
            .unwrap();
        assert_eq!(home.value, "Saved");
        assert_eq!(home.device.as_ref().unwrap().presence, Presence::Available);

        s["network"]["status"]["devices"][1]["state"] = json!("connected (externally)");
        s["network"]["status"]["devices"][1]["connection"] = json!("home-profile");
        s["network"]["networks"][0]["inUse"] = json!(false);
        let reconnected = rows(&s, &t());
        let home = reconnected
            .iter()
            .find(|r| r.kind == RowKind::Device && r.label == "Home")
            .unwrap();
        assert_eq!(home.value, "Connected");
        assert_eq!(home.device.as_ref().unwrap().presence, Presence::Active);
    }

    #[test]
    fn projection_ap_and_errors_are_explained() {
        let mut s = state();
        s["network"]["status"]["projectionAp"] = json!(true);
        s["network"]["status"]["devices"][1]["state"] = json!("unmanaged");
        s["network"]["error"] = json!({ "code": "projection-ap", "message": "" });
        let rows = rows(&s, &t());
        assert!(rows.iter().any(|r| r.label.contains("wireless CarPlay")));
        assert!(rows.iter().any(|r| r.alert));
        let wifi = rows.iter().find(|r| r.label == "Wi-Fi").unwrap();
        assert_eq!(wifi.value, "Wireless CarPlay/AA");
    }

    #[test]
    fn only_the_unmanaged_radio_is_held_by_projection() {
        let mut s = state();
        s["network"]["status"]["projectionAp"] = json!(true);
        s["network"]["status"]["devices"] = json!([
            { "device": "wlan0", "type": "wifi", "state": "unmanaged", "connection": null, "ipv4": [] },
            { "device": "wlan1", "type": "wifi", "state": "disconnected", "connection": null, "ipv4": [] },
            { "device": "wlan2", "type": "wifi", "state": "connected (externally)",
              "connection": "home-profile", "ipv4": ["10.0.0.9/24"] }
        ]);
        let rows = rows(&s, &t());
        let find = |label: &str| rows.iter().find(|r| r.label == label).unwrap();
        assert_eq!(find("Wi-Fi (wlan0)").value, "Wireless CarPlay/AA");
        assert_eq!(find("Wi-Fi (wlan1)").value, "Disconnected");
        assert_eq!(find("Wi-Fi (wlan2) · Home").value, "10.0.0.9");
    }

    #[test]
    fn without_the_helper_there_is_nothing_to_do() {
        let rows = rows(&json!({}), &t());
        assert_eq!(rows.len(), 1);
        assert!(!available(&json!({ "network": { "available": false } })));
        assert!(available(&state()));
    }

    #[test]
    fn the_page_shows_only_with_the_helper() {
        use crate::settings::view::{Screen, Settings};
        let settings = Settings::new(crate::settings::schema());
        let stack = settings.find(&["system"]).unwrap();
        let rows = |s: &Value| match settings.screen(&stack, s, &t()) {
            Some(Screen::List { rows, .. }) => rows,
            _ => panic!("system is a list"),
        };
        let without = rows(&json!({}));
        assert!(!without.iter().any(|r| r.label == "Network"));
        let logs = without.iter().find(|r| r.label == "Logs").unwrap();
        assert_eq!(logs.node, 2);
        let with = rows(&state());
        assert_eq!(with.iter().find(|r| r.label == "Network").unwrap().node, 1);
        let page = settings.find(&["system", "network"]).unwrap();
        assert_eq!(settings.watches(&page), [super::super::Watch::Network]);
    }

    #[test]
    fn passwords_follow_wpa_rules() {
        assert!(psk_valid("hunter22"));
        assert!(!psk_valid("short"));
        assert!(!psk_valid(&"x".repeat(64)));
        assert!(psk_valid(&"a1".repeat(32)));
        assert!(!psk_valid("pässwörter"));
    }

    #[test]
    fn joining_sends_the_password_only_in_the_action() {
        let s = state();
        let mut open = Join::scanned(&s, 1).unwrap();
        assert!(!open.secured);
        assert_eq!(
            open.request(&s, "", "", &t()),
            Some(Action::NetworkConnect {
                ssid: "Cafe".into(),
                psk: None,
                hidden: false,
                security: None,
            })
        );
        let mut new = Join::scanned(&s, 0).unwrap();
        new.saved = false;
        assert_eq!(new.request(&s, "", "", &t()), None);
        assert!(new.problem.is_some());
        assert_eq!(new.request(&s, "", "short", &t()), None);
        let sent = new.request(&s, "", "hunter22", &t()).unwrap();
        assert_eq!(
            sent,
            Action::NetworkConnect {
                ssid: "Home".into(),
                psk: Some(Secret("hunter22".into())),
                hidden: false,
                security: None,
            }
        );
        assert!(new.problem.is_none());
        let mut hidden = Join::hidden();
        assert_eq!(hidden.request(&s, "", "", &t()), None);
        assert_eq!(hidden.request(&s, &"x".repeat(33), "", &t()), None);
        assert_eq!(
            hidden.request(&s, " Secret ", "", &t()),
            Some(Action::NetworkConnect {
                ssid: " Secret ".into(),
                psk: None,
                hidden: true,
                security: None,
            })
        );
    }

    #[test]
    fn a_hidden_network_names_its_security() {
        let s = state();
        let mut wpa3 = Join::hidden();
        assert_eq!(wpa3.view(&s, &t()).security_options.len(), 4);
        wpa3.choose(3);
        let view = wpa3.view(&s, &t());
        assert_eq!((view.security_index, view.ask_psk), (3, true));
        assert_eq!(wpa3.request(&s, "Attic", "", &t()), None);
        assert_eq!(
            wpa3.request(&s, "Attic", "hunter22", &t()),
            Some(Action::NetworkConnect {
                ssid: "Attic".into(),
                psk: Some(Secret("hunter22".into())),
                hidden: true,
                security: Some(WifiSecurity::Wpa3),
            })
        );
        let mut open = Join::hidden();
        open.choose(1);
        assert!(!open.view(&s, &t()).ask_psk);
        let Some(Action::NetworkConnect { psk, security, .. }) =
            open.request(&s, "Attic", "typed before", &t())
        else {
            panic!("open network");
        };
        assert_eq!((psk, security), (None, Some(WifiSecurity::Open)));
        let mut scanned = Join::scanned(&s, 0).unwrap();
        scanned.choose(3);
        assert_eq!(scanned.security, None);
        let view = scanned.view(&s, &t());
        assert!(!view.ask_security);
        assert!(view.psk_hint.starts_with("WPA2 · "));
    }

    #[test]
    fn a_saved_network_joins_with_its_stored_password() {
        let s = state();
        let mut home = Join::scanned(&s, 0).unwrap();
        assert!(home.secured && home.saved);
        let view = home.view(&s, &t());
        assert!(view.ask_psk);
        assert_eq!(
            view.psk_hint,
            "WPA2 · Leave empty to use the saved password"
        );
        assert_eq!(
            home.request(&s, "", "", &t()),
            Some(Action::NetworkConnect {
                ssid: "Home".into(),
                psk: None,
                hidden: false,
                security: None,
            })
        );
    }

    #[test]
    fn spaces_around_a_hidden_ssid_are_kept() {
        let s = state();
        let mut join = Join::hidden();
        let Some(Action::NetworkConnect { ssid, .. }) = join.request(&s, "  Attic  ", "", &t())
        else {
            panic!("valid ssid");
        };
        assert_eq!(ssid, "  Attic  ");
        assert_eq!(join.ssid, "  Attic  ");
        assert!(join.request(&s, " ", "", &t()).is_some());
    }

    #[test]
    fn connected_variants_count_as_connected() {
        assert!(connected("connected"));
        assert!(connected("connected (externally)"));
        assert!(connected("connected (site only)"));
        assert!(!connected("connecting (getting IP configuration)"));
        assert!(!connected("disconnected"));
        let mut s = state();
        s["network"]["status"]["devices"][0]["state"] = json!("connected (externally)");
        s["network"]["status"]["devices"][1]["state"] = json!("connected (externally)");
        s["network"]["status"]["projectionAp"] = json!(true);
        let rows = rows(&s, &t());
        let find = |label: &str| rows.iter().find(|r| r.label == label).unwrap();
        assert_eq!(find("Ethernet").value, "192.168.1.5");
        assert_eq!(find("Wi-Fi · Home").value, "10.0.0.7");
    }

    /// The core's state after its join number `id` for `ssid` ended.
    fn ended(s: &mut Value, id: u64, ssid: &str, error: Option<&str>) {
        s["network"]["joins"] = json!(id);
        s["network"]["connecting"] = Value::Null;
        s["network"]["joined"] = json!({
            "id": id, "ssid": ssid, "connected": error.is_none(),
            "error": error.map(|code| json!({ "code": code, "message": "" })),
        });
    }

    #[test]
    fn the_form_follows_a_join_in_flight() {
        let mut s = state();
        let mut join = Join::scanned(&s, 1).unwrap();
        join.request(&s, "", "", &t()).unwrap();
        assert!(!join.follow(&s));
        assert_eq!(join.phase, Phase::Sent);
        s["network"]["joins"] = json!(1);
        s["network"]["connecting"] = json!("Cafe");
        assert!(!join.follow(&s));
        assert_eq!(join.phase, Phase::Connecting);
        assert!(join.view(&s, &t()).busy);
        ended(&mut s, 1, "Cafe", None);
        assert!(join.follow(&s));
    }

    #[test]
    fn a_join_over_before_it_was_seen_still_closes_the_form() {
        let mut s = state();
        ended(&mut s, 4, "Cafe", Some("activation-failed"));
        let mut join = Join::scanned(&s, 1).unwrap();
        join.request(&s, "", "", &t()).unwrap();
        // An earlier join's outcome is not this one's.
        assert!(!join.follow(&s));
        assert_eq!(join.phase, Phase::Sent);
        assert!(join.view(&s, &t()).busy);
        ended(&mut s, 5, "Cafe", None);
        assert!(join.follow(&s));
    }

    #[test]
    fn a_join_failing_before_it_was_seen_reports_why() {
        let mut s = state();
        let mut join = Join::scanned(&s, 1).unwrap();
        join.request(&s, "", "", &t()).unwrap();
        ended(&mut s, 1, "Cafe", Some("projection-ap"));
        s["network"]["error"] = Value::Null;
        assert!(!join.follow(&s));
        assert_eq!(join.phase, Phase::Editing);
        let view = join.view(&s, &t());
        assert!(!view.busy);
        assert!(view.error.contains("CarPlay"));
        assert!(!join.follow(&s));
        join.request(&s, "", "", &t()).unwrap();
        assert!(join.view(&s, &t()).error.is_empty());
        ended(&mut s, 2, "Cafe", None);
        assert!(join.follow(&s));
    }
}
