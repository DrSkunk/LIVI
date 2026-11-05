// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::config::{Config, WifiBand};
use crate::theme::Cluster;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub front: PerScreen<Front>,
    pub sessions: Sessions,
    pub now_playing: NowPlaying,
    #[serde(default)]
    pub video_playback: Option<VideoPlayback>,
    pub navigation: Navigation,
    pub system: System,
    pub devices: Vec<DeviceView>,
    pub cameras: Vec<CameraView>,
    pub mfi: Mfi,
    pub telemetry: Map<String, Value>,
    pub update: Update,
    pub cluster: Cluster,
    pub dab: Dab,
    #[serde(default)]
    pub games: Games,
    #[serde(default)]
    pub minidsp: MiniDsp,
    #[serde(default)]
    pub network: Network,
    #[serde(default)]
    pub fm: Fm,
    pub config: Config,
}

/// Wired and wireless networking under LIVI OS, as `/usr/libexec/livi-network` reports it.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Network {
    /// The image ships the helper, so there is something to show.
    pub available: bool,
    pub status: Option<NetworkStatus>,
    /// The last scan, strongest first.
    pub networks: Vec<WifiNetwork>,
    pub scanned: bool,
    pub scanning: bool,
    /// The SSID being joined.
    pub connecting: Option<String>,
    /// The UUID of the profile being forgotten.
    pub forgetting: Option<String>,
    pub error: Option<NetworkError>,
    /// Counts the joins the core started; the latest one is `joins`.
    pub joins: u64,
    /// How the latest finished join ended. Stays until the next one ends, so
    /// a join over before anyone saw `connecting` is not missed.
    pub joined: Option<JoinOutcome>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct JoinOutcome {
    /// The `joins` count of this join.
    pub id: u64,
    pub ssid: String,
    pub connected: bool,
    pub error: Option<NetworkError>,
}

/// `livi-network status`. The aliases take the helper's snake_case names.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetworkStatus {
    pub state: String,
    pub connectivity: String,
    pub devices: Vec<NetDevice>,
    #[serde(alias = "projection_ap")]
    pub projection_ap: bool,
    #[serde(alias = "wifi_profiles")]
    pub wifi_profiles: Vec<WifiProfile>,
    pub clock: NetClock,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetDevice {
    pub device: String,
    /// `ethernet` or `wifi`.
    #[serde(rename = "type")]
    pub kind: String,
    pub state: String,
    pub connection: Option<String>,
    pub ipv4: Vec<String>,
    pub gateway: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WifiProfile {
    pub uuid: String,
    pub name: String,
    pub ssid: String,
    pub autoconnect: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetClock {
    pub synchronized: bool,
    pub rtc: bool,
    pub utc: Option<String>,
    pub server: Option<String>,
    /// `utc` in the local time zone, filled in by the core.
    pub local: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WifiNetwork {
    pub ssid: String,
    /// 0-100.
    pub signal: u8,
    /// Empty for an open network.
    pub security: String,
    #[serde(alias = "in_use")]
    pub in_use: bool,
    pub saved: bool,
}

/// One of the helper's codes (`invalid`, `not-found`, `projection-ap`, `no-wifi`, `timeout`,
/// `unavailable`, `nmcli`, `activation-failed`) and its text.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetworkError {
    pub code: String,
    pub message: String,
}

/// What the MiniDSP daemon last reported for the configured device.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MiniDsp {
    /// A status answer came back at least once, so the page leaves "connecting".
    pub checked: bool,
    pub busy: bool,
    pub connected: bool,
    pub preset: u32,
    pub source: String,
    pub volume_db: f64,
    pub muted: bool,
    pub product_name: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Games {
    pub library: Vec<GameView>,
    pub scanned: bool,
    pub importing: bool,
    pub last_import: Option<GameImport>,
    pub run: GameRun,
    pub game_id: Option<String>,
    pub error: Option<String>,
    pub controllers: Vec<ControllerView>,
    pub scanning: bool,
    pub pairing: Option<String>,
    pub controller_error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameView {
    pub id: String,
    pub title: String,
    pub system: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameImport {
    pub games: u32,
    pub playlists: u32,
    pub thumbnails_downloaded: u32,
    pub thumbnails_missing: u32,
    pub missing_cores: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GameRun {
    #[default]
    Idle,
    Launching,
    Running,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ControllerView {
    pub mac: String,
    pub name: String,
    pub paired: bool,
    pub connected: bool,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dab {
    pub receiver: Option<String>,
    pub stations: Vec<DabStation>,
    pub last_station: Option<u32>,
    pub scan: Option<DabScan>,
    pub active: bool,
    pub station: Option<u32>,
    pub playing: bool,
    pub text: Option<String>,
    pub signal: DabSignal,
    pub error: Option<String>,
    pub gains_db: Vec<f64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DabStation {
    pub service_id: u32,
    pub label: String,
    pub short_label: String,
    pub ensemble: String,
    pub channel: String,
    pub frequency_hz: u32,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub hidden: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub logo: Option<String>,
}

/// The stick is the DAB+ one, so its `receiver` in [`Dab`] says whether FM can play too.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Fm {
    pub stations: Vec<FmStation>,
    pub last_station: Option<u32>,
    pub scan: Option<DabScan>,
    pub active: bool,
    pub station: Option<u32>,
    pub playing: bool,
    pub name: Option<String>,
    pub text: Option<String>,
    pub signal: FmSignal,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FmStation {
    pub khz: u32,
    pub name: String,
    #[serde(default)]
    pub pi: Option<u16>,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default)]
    pub hidden: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FmSignal {
    pub quality: u32,
    pub stereo: bool,
    pub rds: bool,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DabScan {
    pub channel: String,
    pub done: u32,
    pub total: u32,
    pub found: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DabSignal {
    pub locked: bool,
    pub quality: u32,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    pub latest: Option<Release>,
    pub checking: bool,
    pub checked: bool,
    pub phase: UpdatePhase,
    pub received: f64,
    pub total: f64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub commit: String,
    pub run: String,
    pub url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdatePhase {
    #[default]
    Idle,
    Download,
    Ready,
    Installing,
    Relaunching,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OsChannel {
    #[default]
    Stable,
    Nightly,
}

impl OsChannel {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Stable => "stable",
            Self::Nightly => "nightly",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OsUpdatePhase {
    #[default]
    Idle,
    Checking,
    Downloading,
    Staging,
    Rebooting,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OsUpdate {
    pub enabled: bool,
    pub channel: OsChannel,
    pub status: Option<OsStatus>,
    pub release: Option<OsRelease>,
    pub phase: OsUpdatePhase,
    pub message: String,
    pub received: u64,
    pub total: u64,
    pub error: Option<String>,
    pub confirm_reboot: bool,
}

/// JSON returned by the image's signed updater, not the application release feed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OsStatus {
    pub board: String,
    pub version: String,
    pub serial: u64,
    pub slot: String,
    pub trial: bool,
    pub pending: bool,
    pub staged: Option<OsStaged>,
    pub update_key: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OsStaged {
    pub version: String,
    pub serial: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OsRelease {
    pub channel: OsChannel,
    pub installed: String,
    pub available: String,
    pub update: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CameraView {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mfi {
    pub certificate: bool,
    pub identity: bool,
    pub generation: Option<u8>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub protocol: Option<Protocol>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_transport: Option<String>,
    pub status: DeviceStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub battery_level: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub battery_charging: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signal_strength: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub carrier_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeviceStatus {
    Active,
    Available,
    #[default]
    Offline,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct System {
    #[serde(default)]
    pub power_busy: bool,
    #[serde(default)]
    pub power_error: Option<String>,
    #[serde(default)]
    pub os_update: OsUpdate,
    pub wifi_interfaces: Vec<String>,
    pub bt_adapters: Vec<String>,
    pub interface_models: BTreeMap<String, String>,
    pub dongle: Option<DongleRadios>,
    pub link_speed: Option<LinkSpeed>,
    pub wifi_bands: Vec<WifiBand>,
    pub wifi_channels: Vec<u32>,
    pub wifi_countries: Vec<String>,
    pub displays: Vec<Display>,
    pub displays_settable: bool,
    pub audio_sinks: Vec<AudioDevice>,
    pub audio_sources: Vec<AudioDevice>,
    pub start_page: String,
    pub fonts: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub offline: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DongleRadios {
    pub wifi: bool,
    pub bt: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkSpeed {
    pub down_mbps: f64,
    pub up_mbps: f64,
    pub down_rate: f64,
    pub up_rate: f64,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Navigation {
    pub active: Option<bool>,
    pub order_type: Option<u32>,
    pub road_name: Option<String>,
    pub after_road_name: Option<String>,
    pub destination_name: Option<String>,
    pub time_to_destination: Option<f64>,
    pub distance_to_destination: Option<f64>,
    pub remain_distance: Option<f64>,
    pub maneuver_type: Option<u32>,
    pub turn_side: Option<u32>,
    pub junction_type: Option<u32>,
    pub turn_angle: Option<i32>,
    pub eta: Option<f64>,
    pub eta_text: Option<String>,
    pub app_name: Option<String>,
    pub image: Option<String>,
    pub maneuver_text: Option<String>,
    pub maneuver_distance_text: Option<String>,
    pub destination_distance_text: Option<String>,
    pub time_left_text: Option<String>,
    pub distance_to_destination_display: Option<String>,
    pub distance_to_destination_units: Option<u32>,
    pub remain_distance_display: Option<String>,
    pub remain_distance_units: Option<u32>,
    pub maneuver_count: Option<u32>,
    pub visible_in_app: Option<bool>,
    pub lane_guidance_index: Option<u32>,
    pub lane_guidance_count: Option<u32>,
    pub lane_guidance_shown: Option<bool>,
    pub source_supports_route_guidance: Option<bool>,
    pub destination_time_zone_offset_minutes: Option<i32>,
    #[serde(default)]
    pub maneuvers: Vec<Maneuver>,
    #[serde(default)]
    pub current_maneuvers: Vec<u32>,
    #[serde(default)]
    pub lane_guidance: Vec<LaneGuidance>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Maneuver {
    pub index: u32,
    pub maneuver_type: Option<u32>,
    pub turn_side: Option<u32>,
    pub junction_type: Option<u32>,
    pub turn_angle: Option<i32>,
    pub after_road_name: Option<String>,
    pub description: Option<String>,
    pub distance_between: Option<u32>,
    pub distance_between_display: Option<String>,
    pub distance_between_units: Option<u32>,
    pub junction_angles: Vec<i32>,
    pub linked_lane_guidance: Option<u32>,
    pub exit_info: Option<String>,
    pub maneuver_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct LaneGuidance {
    pub index: u32,
    pub description: Option<String>,
    pub lanes: Vec<Lane>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Lane {
    pub index: u32,
    pub status: Option<u32>,
    pub angles: Vec<i32>,
    pub highlight_angle: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub app: Option<String>,
    pub duration_ms: Option<f64>,
    pub elapsed_ms: Option<f64>,
    pub playing: Option<bool>,
    pub artwork: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPlayback {
    pub playing: bool,
    pub position_ms: f64,
    pub duration_ms: Option<f64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sessions {
    pub active: Option<Protocol>,
    pub position: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Carplay,
    Androidauto,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Screen {
    Main,
    Cluster,
    Aux,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Front {
    Livi,
    Projection,
    Cluster,
    Camera,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub connector: String,
    pub id: String,
    pub panel: String,
    pub screen: Option<Screen>,
    pub current: Option<String>,
    pub modes: Vec<String>,
    pub touch: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct PerScreen<T> {
    pub main: T,
    pub cluster: T,
    pub aux: T,
}

impl<T> PerScreen<T> {
    pub fn get(&self, screen: Screen) -> &T {
        match screen {
            Screen::Main => &self.main,
            Screen::Cluster => &self.cluster,
            Screen::Aux => &self.aux,
        }
    }

    pub fn get_mut(&mut self, screen: Screen) -> &mut T {
        match screen {
            Screen::Main => &mut self.main,
            Screen::Cluster => &mut self.cluster,
            Screen::Aux => &mut self.aux,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn older_system_snapshots_default_to_os_updates_disabled() {
        let mut value = serde_json::to_value(System::default()).unwrap();
        value.as_object_mut().unwrap().remove("osUpdate");
        let system: System = serde_json::from_value(value).unwrap();
        assert_eq!(system.os_update, OsUpdate::default());
        assert!(!system.os_update.enabled);
    }

    #[test]
    fn per_screen_addresses_each_screen() {
        let mut fronts = PerScreen {
            main: Front::Livi,
            cluster: Front::Livi,
            aux: Front::Livi,
        };
        *fronts.get_mut(Screen::Cluster) = Front::Cluster;
        assert_eq!(*fronts.get(Screen::Main), Front::Livi);
        assert_eq!(*fronts.get(Screen::Cluster), Front::Cluster);
        assert_eq!(*fronts.get(Screen::Aux), Front::Livi);
    }

    #[test]
    fn fronts_are_lower_case_on_the_wire() {
        let fronts = PerScreen {
            main: Front::Projection,
            cluster: Front::Cluster,
            aux: Front::Camera,
        };
        assert_eq!(
            serde_json::to_string(&fronts).unwrap(),
            r#"{"main":"projection","cluster":"cluster","aux":"camera"}"#
        );
    }

    #[test]
    fn now_playing_says_null_for_what_the_phone_did_not_tell() {
        let np = NowPlaying {
            title: Some("Song".into()),
            playing: Some(true),
            ..Default::default()
        };
        assert_eq!(
            serde_json::to_value(&np).unwrap(),
            serde_json::json!({
                "title": "Song", "artist": null, "album": null, "app": null,
                "durationMs": null, "elapsedMs": null, "playing": true, "artwork": null
            })
        );
    }

    #[test]
    fn sessions_name_the_protocol_as_the_ui_does() {
        let sessions = Sessions {
            active: Some(Protocol::Androidauto),
            position: 1,
            total: 2,
        };
        assert_eq!(
            serde_json::to_string(&sessions).unwrap(),
            r#"{"active":"androidauto","position":1,"total":2}"#
        );
        assert_eq!(
            serde_json::to_string(&Sessions::default()).unwrap(),
            r#"{"active":null,"position":0,"total":0}"#
        );
    }
}
