// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::collections::HashMap;

use base64::Engine;
use livi_core_proto::state::{LocalMusicEntryKind, MusicSyncPhase, Protocol, State};
use livi_ui_model::media::{Radio, Station, dab, fm};
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
    artwork_raw: Option<Option<String>>,
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

fn kind_name(kind: LocalMusicEntryKind) -> String {
    match kind {
        LocalMusicEntryKind::Folder => "folder",
        LocalMusicEntryKind::Playlist => "playlist",
        LocalMusicEntryKind::Track => "track",
    }
    .into()
}

fn phase_name(phase: MusicSyncPhase) -> String {
    match phase {
        MusicSyncPhase::Idle => "idle",
        MusicSyncPhase::Starting => "starting",
        MusicSyncPhase::Pairing => "pairing",
        MusicSyncPhase::Pending => "pending",
        MusicSyncPhase::Connected => "connected",
        MusicSyncPhase::Error => "error",
    }
    .into()
}

impl MediaView {
    pub fn decode(&mut self) {
        if let Some(raw) = self.artwork_raw.take() {
            self.artwork = Some(raw.as_deref().and_then(decode));
        }
    }
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
    shown_logos: [ShownLogos; 2],
}

#[derive(Default)]
struct ShownLogos {
    keys: Vec<Option<String>>,
    pixels: Vec<Option<Pixels>>,
}

fn text_or_dash(v: Option<String>) -> String {
    v.filter(|s| !s.is_empty()).unwrap_or_else(|| EMPTY.into())
}

impl MediaReader {
    pub fn read(&mut self, state: &State) -> MediaView {
        let now = state.now_playing.clone();
        let sessions = state.sessions;
        let local = &state.local_music;
        let text = |v: &Option<String>| v.clone().unwrap_or_default();
        let local_music = LocalMusicView {
            active: local.active,
            browsing: local.browsing,
            folder_name: text(&local.folder_name),
            parent: local.parent.clone(),
            entries: local
                .entries
                .iter()
                .map(|entry| LocalMusicRow {
                    id: entry.id.clone(),
                    label: entry.label.clone(),
                    kind: kind_name(entry.kind),
                })
                .collect(),
            error: text(&local.error),
            eject_device: text(&local.eject_device),
            ejecting: local.ejecting,
            sync_phase: phase_name(local.sync.phase),
            sync_code: text(&local.sync.code),
            sync_verification: text(&local.sync.verification),
            sync_website: text(&local.sync.website),
            sync_last_file: text(&local.sync.last_file),
            sync_error: text(&local.sync.error),
        };
        let artwork_raw = (now.artwork != self.artwork).then(|| {
            self.artwork = now.artwork.clone();
            now.artwork.clone()
        });
        MediaView {
            title: text_or_dash(now.title),
            artist: text_or_dash(now.artist),
            album: now.album.unwrap_or_default(),
            app: now.app.unwrap_or_default(),
            duration_ms: now.duration_ms.unwrap_or(0.0),
            elapsed_ms: now.elapsed_ms,
            playing: now.playing.unwrap_or(false),
            can_seek: matches!(sessions.active, Some(Protocol::Carplay | Protocol::Airplay))
                || local_music.active,
            artwork: None,
            artwork_raw,
            local_music,
            session: format!("{:?}:{}", sessions.active, sessions.position),
        }
    }

    pub fn read_radio(&mut self, state: &State) -> Option<Radios> {
        let next = (dab(state), fm(state));
        if self.last_radio.as_ref() == Some(&next) {
            return None;
        }
        self.last_radio = Some(next.clone());
        let view = |radio| RadioView {
            radio,
            logos: Vec::new(),
            tuned_logo: None,
        };
        Some(Radios {
            dab: view(next.0),
            fm: view(next.1),
        })
    }

    pub fn decode_radios(&mut self, r: &mut Radios) {
        for (band, view) in [&mut r.dab, &mut r.fm].into_iter().enumerate() {
            view.logos = self.station_logos(band, &view.radio.stations);
            view.tuned_logo = self.logo(&view.radio.tuned_logo);
        }
    }

    fn station_logos(&mut self, band: usize, stations: &[Station]) -> Vec<Option<Pixels>> {
        let shown = &self.shown_logos[band];
        if shown.keys.len() == stations.len()
            && shown.keys.iter().zip(stations).all(|(k, s)| *k == s.logo)
        {
            return shown.pixels.clone();
        }
        let pixels: Vec<_> = stations.iter().map(|s| self.logo(&s.logo)).collect();
        self.shown_logos[band] = ShownLogos {
            keys: stations.iter().map(|s| s.logo.clone()).collect(),
            pixels: pixels.clone(),
        };
        pixels
    }

    fn logo(&mut self, b64: &Option<String>) -> Option<Pixels> {
        let s = b64.as_ref()?;
        if let Some(px) = self.logos.get(s) {
            return px.clone();
        }
        let px = decode(s);
        self.logos.insert(s.clone(), px.clone());
        px
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

#[cfg(test)]
mod tests {
    use livi_core_proto::state::DabStation;

    use super::*;

    fn png() -> String {
        let mut bytes = Vec::new();
        image::RgbaImage::new(1, 1)
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageFormat::Png,
            )
            .unwrap();
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    fn state(quality: u32, logo: &str) -> State {
        let mut state = State::default();
        state.dab.receiver = Some("stick".into());
        state.dab.station = Some(1);
        state.dab.signal.locked = true;
        state.dab.signal.quality = quality;
        state.dab.stations = vec![DabStation {
            service_id: 1,
            label: "One".into(),
            short_label: String::new(),
            ensemble: String::new(),
            channel: String::new(),
            frequency_hz: 0,
            favorite: false,
            hidden: false,
            logo: Some(logo.into()),
        }];
        state
    }

    #[test]
    fn logos_decode_after_the_read_and_stay_for_a_signal_change() {
        let logo = png();
        let mut reader = MediaReader::default();
        let mut first = reader.read_radio(&state(80, &logo)).unwrap();
        assert!(first.dab.logos.is_empty());
        reader.decode_radios(&mut first);
        let shown = first.dab.logos[0].clone().unwrap();
        let mut again = reader.read_radio(&state(20, &logo)).unwrap();
        reader.decode_radios(&mut again);
        let kept = again.dab.logos[0].clone().unwrap();
        assert_eq!(kept.as_bytes().as_ptr(), shown.as_bytes().as_ptr());
        assert!(reader.read_radio(&state(20, &logo)).is_none());
    }
}
