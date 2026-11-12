// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::collections::HashMap;

use base64::Engine;
use livi_core_proto::state::{NowPlaying, Protocol, Sessions};
use livi_ui_model::media::{Radio, dab, fm};
use serde_json::Value;
use slint::{Rgba8Pixel, SharedPixelBuffer};

const EMPTY: &str = "—";

pub type Pixels = SharedPixelBuffer<Rgba8Pixel>;

pub struct MediaView {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub app: String,
    pub duration_ms: f64,
    pub elapsed_ms: Option<f64>,
    pub playing: bool,
    pub can_seek: bool,
    pub artwork: Option<Option<Pixels>>,
    pub session: String,
    pub local_music: LocalMusicView,
}

#[derive(Clone)]
pub struct LocalMusicRow {
    pub id: String,
    pub label: String,
    pub kind: String,
}

#[derive(Clone, Default)]
pub struct LocalMusicView {
    pub active: bool,
    pub browsing: bool,
    pub folder_name: String,
    pub parent: Option<String>,
    pub entries: Vec<LocalMusicRow>,
    pub error: String,
    pub eject_device: String,
    pub ejecting: bool,
    pub sync_phase: String,
    pub sync_code: String,
    pub sync_verification: String,
    pub sync_website: String,
    pub sync_last_file: String,
    pub sync_error: String,
}

#[derive(Clone)]
pub struct RadioView {
    pub radio: Radio,
    pub logos: Vec<Option<Pixels>>,
    pub tuned_logo: Option<Pixels>,
}

#[derive(Clone)]
pub struct Radios {
    pub dab: RadioView,
    pub fm: RadioView,
}

#[derive(Default)]
pub struct MediaReader {
    artwork: Option<String>,
    logos: HashMap<String, Option<Pixels>>,
    last_radio: Option<(Radio, Radio)>,
}

fn text_or_dash(v: Option<String>) -> String {
    v.filter(|s| !s.is_empty()).unwrap_or_else(|| EMPTY.into())
}

impl MediaReader {
    pub fn read(&mut self, state: &Value) -> MediaView {
        let now: NowPlaying =
            serde_json::from_value(state["nowPlaying"].clone()).unwrap_or_default();
        let sessions: Sessions =
            serde_json::from_value(state["sessions"].clone()).unwrap_or_default();
        let local = state["localMusic"].clone();
        let local_music = LocalMusicView {
            active: local["active"].as_bool().unwrap_or(false),
            browsing: local["browsing"].as_bool().unwrap_or(false),
            folder_name: local["folderName"].as_str().unwrap_or_default().to_string(),
            parent: local["parent"].as_str().map(str::to_string),
            entries: local["entries"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|entry| {
                    Some(LocalMusicRow {
                        id: entry["id"].as_str()?.to_string(),
                        label: entry["label"].as_str()?.to_string(),
                        kind: entry["kind"].as_str()?.to_string(),
                    })
                })
                .collect(),
            error: local["error"].as_str().unwrap_or_default().to_string(),
            eject_device: local["ejectDevice"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            ejecting: local["ejecting"].as_bool().unwrap_or(false),
            sync_phase: local["sync"]["phase"]
                .as_str()
                .unwrap_or("idle")
                .to_string(),
            sync_code: local["sync"]["code"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            sync_verification: local["sync"]["verification"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            sync_website: local["sync"]["website"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            sync_last_file: local["sync"]["lastFile"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            sync_error: local["sync"]["error"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
        };
        let artwork = (now.artwork != self.artwork).then(|| {
            self.artwork = now.artwork.clone();
            now.artwork.as_deref().and_then(decode)
        });
        MediaView {
            title: text_or_dash(now.title),
            artist: text_or_dash(now.artist),
            album: now.album.unwrap_or_default(),
            app: now.app.unwrap_or_default(),
            duration_ms: now.duration_ms.unwrap_or(0.0),
            elapsed_ms: now.elapsed_ms,
            playing: now.playing.unwrap_or(false),
            can_seek: sessions.active == Some(Protocol::Carplay) || local_music.active,
            artwork,
            local_music,
            session: format!(
                "{}:{}",
                state["sessions"]["active"], state["sessions"]["position"]
            ),
        }
    }

    pub fn read_radio(&mut self, state: &Value) -> Option<Radios> {
        let next = (dab(state), fm(state));
        if self.last_radio.as_ref() == Some(&next) {
            return None;
        }
        self.last_radio = Some(next.clone());
        Some(Radios {
            dab: self.view(next.0),
            fm: self.view(next.1),
        })
    }

    fn view(&mut self, radio: Radio) -> RadioView {
        let mut logo = |b64: &Option<String>| {
            b64.as_ref().and_then(|s| {
                self.logos
                    .entry(s.clone())
                    .or_insert_with(|| decode(s))
                    .clone()
            })
        };
        let logos = radio.stations.iter().map(|s| logo(&s.logo)).collect();
        let tuned_logo = logo(&radio.tuned_logo);
        RadioView {
            radio,
            logos,
            tuned_logo,
        }
    }
}

pub fn decode(base64: &str) -> Option<Pixels> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64)
        .ok()?;
    let img = image::load_from_memory(&bytes).ok()?.into_rgba8();
    Some(SharedPixelBuffer::clone_from_slice(
        img.as_raw(),
        img.width(),
        img.height(),
    ))
}
