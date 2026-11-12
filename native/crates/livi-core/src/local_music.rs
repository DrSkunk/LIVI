// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc as std_mpsc;
use std::thread;
use std::time::{Duration, Instant};

use gstreamer as gst;
use gstreamer::prelude::*;
use gstreamer_app as gst_app;
use livi_core_proto::message::{LocalMusicCommand, MediaControl};
use livi_core_proto::state::{
    LocalMusic as LocalMusicState, LocalMusicEntry, LocalMusicEntryKind, NowPlaying, State,
};
use livi_media::gst_host::{AudioCodec, AudioOpts, GstHost};
use sha2::{Digest, Sha256};
use tokio::sync::{mpsc, watch};

pub(crate) const INTERNAL_MUSIC: &str = "/data/livi/music";
const EXTERNAL_MUSIC: &str = "/run/livi-media";
const RATE: u32 = 48_000;
const CHANNELS: u8 = 2;

#[derive(Debug)]
pub enum Ask {
    Command(LocalMusicCommand),
    Rescan,
    Control(MediaControl),
    Seek(u32),
}

#[derive(Clone)]
struct Root {
    label: String,
    path: PathBuf,
    eject_device: Option<String>,
}

#[derive(Clone)]
struct Track {
    id: String,
    path: PathBuf,
    title: String,
    artist: Option<String>,
    album: Option<String>,
}

#[derive(Clone)]
struct Playlist {
    id: String,
    tracks: Vec<String>,
}

#[derive(Default)]
struct Folder {
    label: String,
    parent: Option<String>,
    entries: Vec<LocalMusicEntry>,
    tracks: Vec<String>,
    eject_device: Option<String>,
}

struct Catalog {
    roots: Vec<PathBuf>,
    eject_roots: Vec<(PathBuf, String)>,
    folders: HashMap<String, Folder>,
    tracks: HashMap<String, Track>,
    playlists: HashMap<String, Playlist>,
}

impl Catalog {
    fn scan(roots: &[Root]) -> Self {
        let canonical_roots: Vec<_> = roots
            .iter()
            .filter_map(|root| fs::canonicalize(&root.path).ok().map(|p| (root, p)))
            .collect();
        let mut catalog = Self {
            roots: canonical_roots.iter().map(|(_, p)| p.clone()).collect(),
            eject_roots: canonical_roots
                .iter()
                .filter_map(|(root, path)| {
                    root.eject_device
                        .clone()
                        .map(|device| (path.clone(), device))
                })
                .collect(),
            folders: HashMap::new(),
            tracks: HashMap::new(),
            playlists: HashMap::new(),
        };
        let mut visited = HashSet::new();
        let root_id = "root".to_string();
        catalog.folders.insert(
            root_id.clone(),
            Folder {
                label: "Music".into(),
                ..Folder::default()
            },
        );
        for (root, path) in canonical_roots {
            catalog.walk(&path, root.label.clone(), root_id.clone(), &mut visited);
        }
        catalog
    }

    fn walk(&mut self, path: &Path, label: String, parent: String, visited: &mut HashSet<PathBuf>) {
        let Ok(path) = fs::canonicalize(path) else {
            return;
        };
        if !self.valid(&path) || !visited.insert(path.clone()) {
            return;
        }
        let id = path_id(&path);
        let eject_device = self
            .eject_roots
            .iter()
            .find(|(root, _)| path.starts_with(root))
            .map(|(_, device)| device.clone());
        self.folders.entry(id.clone()).or_insert_with(|| Folder {
            label: label.clone(),
            parent: Some(parent.clone()),
            eject_device,
            ..Folder::default()
        });
        if let Some(parent_folder) = self.folders.get_mut(&parent) {
            parent_folder.entries.push(LocalMusicEntry {
                id: id.clone(),
                label,
                kind: LocalMusicEntryKind::Folder,
            });
        }
        let Ok(entries) = fs::read_dir(&path) else {
            return;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|entry| entry.file_name().to_string_lossy().to_lowercase());
        for entry in entries {
            let file_type = match entry.file_type() {
                Ok(kind) => kind,
                Err(_) => continue,
            };
            if file_type.is_symlink() {
                continue;
            }
            let child = entry.path();
            if file_type.is_dir() {
                self.walk(
                    &child,
                    entry.file_name().to_string_lossy().into_owned(),
                    id.clone(),
                    visited,
                );
            } else if file_type.is_file() {
                if supported_audio(&child) {
                    if let Some(track) = self.add_track(&child) {
                        self.folders
                            .get_mut(&id)
                            .unwrap()
                            .tracks
                            .push(track.id.clone());
                        self.folders
                            .get_mut(&id)
                            .unwrap()
                            .entries
                            .push(LocalMusicEntry {
                                id: track.id.clone(),
                                label: track.title.clone(),
                                kind: LocalMusicEntryKind::Track,
                            });
                    }
                } else if is_playlist(&child)
                    && let Some(playlist) = self.add_playlist(&child)
                {
                    self.folders
                        .get_mut(&id)
                        .unwrap()
                        .entries
                        .push(LocalMusicEntry {
                            id: playlist.id.clone(),
                            label: child
                                .file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .into_owned(),
                            kind: LocalMusicEntryKind::Playlist,
                        });
                }
            }
        }
    }

    fn add_track(&mut self, path: &Path) -> Option<Track> {
        let path = self.validate(path)?;
        let id = path_id(&path);
        if let Some(track) = self.tracks.get(&id) {
            return Some(track.clone());
        }
        let name = path.file_stem()?.to_string_lossy().into_owned();
        let (artist, title) = if let Some((artist, title)) = name.split_once(" - ") {
            (Some(artist.trim().to_string()), title.trim().to_string())
        } else {
            (None, name)
        };
        let track = Track {
            id: id.clone(),
            path,
            title,
            artist,
            album: None,
        };
        self.tracks.insert(id, track.clone());
        Some(track)
    }

    fn add_playlist(&mut self, path: &Path) -> Option<Playlist> {
        let path = self.validate(path)?;
        let id = path_id(&path);
        let entries = parse_playlist(&path, &self.roots);
        let tracks: Vec<_> = entries
            .into_iter()
            .filter_map(|entry| self.add_track(&entry).map(|track| track.id))
            .collect();
        if tracks.is_empty() {
            return None;
        }
        let playlist = Playlist {
            id: id.clone(),
            tracks,
        };
        self.playlists.insert(id, playlist.clone());
        Some(playlist)
    }

    fn valid(&self, path: &Path) -> bool {
        self.roots.iter().any(|root| path.starts_with(root))
    }

    fn validate(&self, path: &Path) -> Option<PathBuf> {
        let canonical = fs::canonicalize(path).ok()?;
        self.valid(&canonical).then_some(canonical)
    }

    fn entries(&self, folder: &str) -> Option<(Vec<LocalMusicEntry>, Option<String>)> {
        let folder = self.folders.get(folder)?;
        let mut entries = folder.entries.clone();
        entries.sort_by_key(|entry| (entry.kind as u8, entry.label.to_lowercase()));
        Some((entries, folder.parent.clone()))
    }

    fn directory_queue(&self, folder: &str) -> Vec<String> {
        self.folders
            .get(folder)
            .map(|folder| folder.tracks.clone())
            .unwrap_or_default()
    }
}

fn path_id(path: &Path) -> String {
    Sha256::digest(path.as_os_str().to_string_lossy().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn supported_audio(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("mp3" | "flac" | "wav" | "wave" | "aac" | "m4a" | "ogg" | "opus")
    )
}

fn is_playlist(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("m3u" | "m3u8")
    )
}

fn parse_playlist(path: &Path, roots: &[PathBuf]) -> Vec<PathBuf> {
    let Ok(body) = fs::read_to_string(path) else {
        return Vec::new();
    };
    body.lines()
        .map(|line| line.trim().trim_start_matches('\u{feff}').trim())
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .filter_map(|line| {
            let relative = Path::new(line);
            if relative.is_absolute() || line.contains("://") {
                return None;
            }
            let resolved = fs::canonicalize(path.parent()?.join(relative)).ok()?;
            if !roots.iter().any(|root| resolved.starts_with(root)) {
                return None;
            }
            supported_audio(&resolved).then_some(resolved)
        })
        .collect()
}

fn music_roots() -> Vec<Root> {
    let internal = PathBuf::from(INTERNAL_MUSIC);
    let _ = fs::create_dir_all(&internal);
    let mut roots = vec![Root {
        label: "Internal Music".into(),
        path: internal,
        eject_device: None,
    }];
    let mountinfo = fs::read_to_string("/proc/self/mountinfo").unwrap_or_default();
    let external = Path::new(EXTERNAL_MUSIC);
    if let Ok(entries) = fs::read_dir(external) {
        let mut mounts: Vec<_> = entries.flatten().collect();
        mounts.sort_by_key(|entry| entry.file_name());
        for entry in mounts {
            if entry.file_type().is_ok_and(|kind| kind.is_dir()) {
                roots.push(Root {
                    label: entry.file_name().to_string_lossy().into_owned(),
                    path: entry.path(),
                    eject_device: mounted_usb_device(&mountinfo, &entry.path()),
                });
            }
        }
    }
    roots
}

fn mounted_usb_device(mountinfo: &str, path: &Path) -> Option<String> {
    // Only the OS-managed, read-only USB mount namespace is ejectable.
    let name = path.strip_prefix(EXTERNAL_MUSIC).ok()?;
    if name.components().count() != 1
        || !matches!(
            name.components().next(),
            Some(std::path::Component::Normal(_))
        )
    {
        return None;
    }
    mountinfo.lines().find_map(|line| {
        let (mount, filesystem) = line.split_once(" - ")?;
        let fields: Vec<_> = mount.split_whitespace().collect();
        let mountpoint = fields
            .get(4)?
            .replace("\\040", " ")
            .replace("\\011", "\t")
            .replace("\\012", "\n")
            .replace("\\134", "\\");
        if Path::new(&mountpoint) != path || !fields.get(5)?.split(',').any(|opt| opt == "ro") {
            return None;
        }
        let device = filesystem
            .split_whitespace()
            .nth(1)?
            .strip_prefix("/dev/")?;
        let suffix = device.strip_prefix("sd")?;
        if suffix.is_empty()
            || !suffix
                .bytes()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
            || path.file_name()? != device
        {
            return None;
        }
        Some(device.to_string())
    })
}

fn eject_command(device: &str) -> tokio::process::Command {
    let mut command = tokio::process::Command::new("sudo");
    command
        .args(["-n", "/usr/libexec/livi-media-eject", device])
        .kill_on_drop(true);
    command
}

async fn eject(device: &str) -> Result<(), String> {
    let output = tokio::time::timeout(Duration::from_secs(30), eject_command(device).output())
        .await
        .map_err(|_| "Eject timed out; refresh and check the drive before unplugging".to_string())?
        .map_err(|error| format!("Could not eject: {error}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "Could not eject: {} ({})",
            String::from_utf8_lossy(&output.stderr).trim(),
            output.status
        ))
    }
}

fn update_browse(state: &mut LocalMusicState, catalog: &Catalog, folder: &str) {
    if let Some((entries, parent)) = catalog.entries(folder) {
        state.folder = Some(folder.to_string());
        state.folder_name = catalog
            .folders
            .get(folder)
            .map(|folder| folder.label.clone());
        state.parent = parent;
        state.entries = entries;
        state.eject_device = catalog
            .folders
            .get(folder)
            .and_then(|folder| folder.eject_device.clone());
        state.error = None;
    } else {
        state.error = Some("That music folder is no longer available".into());
    }
}

fn now_playing(
    track: &Track,
    duration_ms: Option<f64>,
    elapsed_ms: Option<f64>,
    playing: bool,
) -> NowPlaying {
    NowPlaying {
        title: Some(track.title.clone()),
        artist: track.artist.clone(),
        album: track.album.clone(),
        app: Some("Local Music".into()),
        duration_ms,
        elapsed_ms,
        playing: Some(playing),
        artwork: None,
    }
}

fn set_playing(
    hub: &crate::hub::Hub,
    catalog: Option<&Catalog>,
    current: Option<&str>,
    duration_ms: Option<f64>,
    elapsed_ms: f64,
    playing: bool,
) {
    hub.update(|s| {
        s.local_music.playing = playing;
        if let Some(track) =
            current.and_then(|id| catalog.and_then(|catalog| catalog.tracks.get(id)))
        {
            s.now_playing = now_playing(track, duration_ms, Some(elapsed_ms), playing);
        }
    });
}

fn set_error(
    hub: &crate::hub::Hub,
    catalog: Option<&Catalog>,
    current: Option<&str>,
    duration_ms: Option<f64>,
    elapsed_ms: f64,
    error: String,
) {
    hub.update(|s| {
        s.local_music.playing = false;
        s.local_music.browsing = true;
        s.local_music.error = Some(error);
        if let Some(track) =
            current.and_then(|id| catalog.and_then(|catalog| catalog.tracks.get(id)))
        {
            s.now_playing = now_playing(track, duration_ms, Some(elapsed_ms), false);
        }
    });
}

enum DecoderCommand {
    Play,
    Pause,
    Seek(u32),
    Stop,
}

#[derive(Default)]
struct TrackTags {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
}

fn track_tags(tags: &gst::TagListRef) -> TrackTags {
    fn clean(value: &str) -> Option<String> {
        let value: String = value.trim().chars().take(512).collect();
        (!value.is_empty()).then_some(value)
    }
    TrackTags {
        title: tags
            .get::<gst::tags::Title>()
            .and_then(|tag| clean(tag.get())),
        artist: tags
            .get::<gst::tags::Artist>()
            .and_then(|tag| clean(tag.get())),
        album: tags
            .get::<gst::tags::Album>()
            .and_then(|tag| clean(tag.get())),
    }
}

fn apply_track_tags(track: &mut Track, tags: TrackTags) {
    if let Some(title) = tags.title {
        track.title = title;
    }
    if let Some(artist) = tags.artist {
        track.artist = Some(artist);
    }
    if let Some(album) = tags.album {
        track.album = Some(album);
    }
}

fn retain_playing_tags(old: Option<&Catalog>, new: &mut Catalog, current: Option<&str>) {
    let Some(id) = current else { return };
    if let Some(previous) = old.and_then(|catalog| catalog.tracks.get(id))
        && let Some(track) = new.tracks.get_mut(id)
    {
        track.title.clone_from(&previous.title);
        track.artist.clone_from(&previous.artist);
        track.album.clone_from(&previous.album);
    }
}

enum DecoderEvent {
    Position(u32, String, f64, Option<f64>),
    Tags(u32, String, TrackTags),
    End(u32, String),
    Error(u32, String, String),
}

struct Decoder {
    commands: std_mpsc::Sender<DecoderCommand>,
    thread: thread::JoinHandle<()>,
}

struct PipelineGuard(gst::Pipeline);

impl Drop for PipelineGuard {
    fn drop(&mut self) {
        let _ = self.0.set_state(gst::State::Null);
    }
}

struct HostStreamGuard {
    host: GstHost,
    stream: u32,
}

impl Drop for HostStreamGuard {
    fn drop(&mut self) {
        self.host.set_audio_active(self.stream, false);
        self.host.close_audio(self.stream);
    }
}

fn decoder(
    path: PathBuf,
    track_id: String,
    stream: u32,
    host: GstHost,
    events: mpsc::UnboundedSender<DecoderEvent>,
) -> Result<Decoder, String> {
    let (commands, rx) = std_mpsc::channel();
    let thread = thread::Builder::new()
        .name("livi-local-music-decode".into())
        .spawn(move || {
            let result = {
                let _stream = HostStreamGuard {
                    host: host.clone(),
                    stream,
                };
                decode(path, track_id.clone(), stream, host, rx, events.clone())
            };
            match result {
                Ok(true) => {
                    let _ = events.send(DecoderEvent::End(stream, track_id));
                }
                Ok(false) => {}
                Err(error) => {
                    let _ = events.send(DecoderEvent::Error(stream, track_id, error));
                }
            }
        })
        .map_err(|error| error.to_string())?;
    Ok(Decoder { commands, thread })
}

fn decode(
    path: PathBuf,
    track_id: String,
    stream: u32,
    host: GstHost,
    commands: std_mpsc::Receiver<DecoderCommand>,
    events: mpsc::UnboundedSender<DecoderEvent>,
) -> Result<bool, String> {
    gst::init().map_err(|error| error.to_string())?;
    let pipeline = gst::Pipeline::new();
    let _cleanup = PipelineGuard(pipeline.clone());
    let source = gst::ElementFactory::make("filesrc")
        .property("location", path.to_str().ok_or("music path is not UTF-8")?)
        .build()
        .map_err(|error| error.to_string())?;
    let decoder = gst::ElementFactory::make("decodebin")
        .build()
        .map_err(|error| error.to_string())?;
    let convert = gst::ElementFactory::make("audioconvert")
        .build()
        .map_err(|error| error.to_string())?;
    let resample = gst::ElementFactory::make("audioresample")
        .build()
        .map_err(|error| error.to_string())?;
    let filter = gst::ElementFactory::make("capsfilter")
        .property(
            "caps",
            gst::Caps::builder("audio/x-raw")
                .field("format", "S16LE")
                .field("rate", RATE as i32)
                .field("channels", CHANNELS as i32)
                .build(),
        )
        .build()
        .map_err(|error| error.to_string())?;
    let sink = gst_app::AppSink::builder()
        .sync(true)
        .max_buffers(4)
        .build();
    pipeline
        .add_many([
            &source,
            &decoder,
            &convert,
            &resample,
            &filter,
            sink.upcast_ref(),
        ])
        .map_err(|error| error.to_string())?;
    source.link(&decoder).map_err(|error| error.to_string())?;
    gst::Element::link_many([&convert, &resample, &filter, sink.upcast_ref()])
        .map_err(|error| error.to_string())?;
    let convert_sink = convert.static_pad("sink").ok_or("missing converter sink")?;
    decoder.connect_pad_added(move |_, pad| {
        let caps = pad.current_caps().unwrap_or_else(|| pad.query_caps(None));
        let is_audio = caps
            .structure(0)
            .is_some_and(|structure| structure.name().starts_with("audio/"));
        if !convert_sink.is_linked() && is_audio {
            let _ = pad.link(&convert_sink);
        }
    });
    let bus = pipeline.bus().ok_or("missing GStreamer bus")?;
    pipeline
        .set_state(gst::State::Playing)
        .map_err(|error| error.to_string())?;
    let mut last_position = Instant::now();
    let mut running = true;
    while running {
        loop {
            let command = match commands.try_recv() {
                Ok(command) => command,
                Err(std_mpsc::TryRecvError::Empty) => break,
                Err(std_mpsc::TryRecvError::Disconnected) => {
                    running = false;
                    break;
                }
            };
            match command {
                DecoderCommand::Play => {
                    pipeline
                        .set_state(gst::State::Playing)
                        .map_err(|error| error.to_string())?;
                }
                DecoderCommand::Pause => {
                    pipeline
                        .set_state(gst::State::Paused)
                        .map_err(|error| error.to_string())?;
                }
                DecoderCommand::Seek(ms) => {
                    pipeline
                        .seek_simple(
                            gst::SeekFlags::FLUSH | gst::SeekFlags::KEY_UNIT,
                            gst::ClockTime::from_mseconds(u64::from(ms)),
                        )
                        .map_err(|error| error.to_string())?;
                }
                DecoderCommand::Stop => running = false,
            }
        }
        if !running {
            break;
        }
        if let Some(sample) = sink.try_pull_sample(Some(gst::ClockTime::from_mseconds(20)))
            && let Some(buffer) = sample.buffer()
            && let Ok(map) = buffer.map_readable()
        {
            host.push_audio(stream, map.as_slice());
        }
        while let Some(message) = bus.pop() {
            match message.view() {
                gst::MessageView::Eos(..) => {
                    return Ok(true);
                }
                gst::MessageView::Error(error) => {
                    return Err(error.error().to_string());
                }
                gst::MessageView::Tag(tag) => {
                    let tags = track_tags(&tag.tags());
                    if tags.title.is_some() || tags.artist.is_some() || tags.album.is_some() {
                        let _ = events.send(DecoderEvent::Tags(stream, track_id.clone(), tags));
                    }
                }
                _ => {}
            }
        }
        if last_position.elapsed() >= Duration::from_millis(250) {
            let position = pipeline
                .query_position::<gst::ClockTime>()
                .map(|value| value.mseconds() as f64)
                .unwrap_or_default();
            let duration = pipeline
                .query_duration::<gst::ClockTime>()
                .map(|value| value.mseconds() as f64);
            let _ = events.send(DecoderEvent::Position(
                stream,
                track_id.clone(),
                position,
                duration,
            ));
            last_position = Instant::now();
        }
    }
    Ok(false)
}

async fn open_stream(host: &GstHost, device: &str, level: f64) -> Option<u32> {
    let opts = AudioOpts {
        codec: AudioCodec::PcmLe,
        payload_type: 0,
        clock_rate: RATE,
        channels: CHANNELS,
        latency_ms: 0,
        realtime: true,
        fed: true,
        device: device.to_string(),
    };
    let (stream, _, _) = host.open_audio(&[0; 32], &opts).await;
    if stream == 0 {
        return None;
    }
    host.set_audio_volume(stream, level, 0);
    host.set_audio_active(stream, true);
    Some(stream)
}

fn stop_decoder(decoder: Option<Decoder>, host: &GstHost, stream: Option<u32>) {
    if let Some(decoder) = decoder {
        let _ = decoder.commands.send(DecoderCommand::Stop);
        let _ = decoder.thread.join();
    } else if let Some(stream) = stream {
        host.set_audio_active(stream, false);
        host.close_audio(stream);
    }
}

pub async fn run(
    hub: std::sync::Arc<crate::hub::Hub>,
    host: GstHost,
    mut asks: mpsc::UnboundedReceiver<Ask>,
) {
    let mut state = hub.watch();
    let mut catalog: Option<Catalog> = None;
    let mut decoder: Option<Decoder> = None;
    let mut stream = None;
    let mut current: Option<String> = None;
    let mut queue = Vec::<String>::new();
    let mut queue_index = 0usize;
    let mut previous_now_playing: Option<NowPlaying> = None;
    let (events_tx, mut events_rx) = mpsc::unbounded_channel();
    let mut duration_ms = None;
    let mut elapsed_ms = 0.0;
    let mut audio_level = 1.0;

    loop {
        tokio::select! {
            Some(ask) = asks.recv() => {
                match ask {
                    Ask::Command(LocalMusicCommand::Open) => {
                        let roots = music_roots();
                        match tokio::task::spawn_blocking(move || Catalog::scan(&roots)).await {
                            Ok(mut found) => {
                                retain_playing_tags(catalog.as_ref(), &mut found, current.as_deref());
                                catalog = Some(found);
                            }
                            Err(error) => {
                                hub.update(|s| s.local_music.error = Some(error.to_string()));
                                continue;
                            }
                        }
                        let Some(found) = catalog.as_ref() else { continue };
                        if !state.borrow().local_music.active {
                            previous_now_playing = Some(state.borrow().now_playing.clone());
                        }
                        hub.update(|s| {
                            s.local_music.active = true;
                            s.local_music.browsing = true;
                            s.local_music.scanned = true;
                            update_browse(&mut s.local_music, found, "root");
                        });
                    }
                    Ask::Command(LocalMusicCommand::Close) => {
                        stop_decoder(decoder.take(), &host, stream.take());
                        queue.clear();
                        current = None;
                        hub.update(|s| {
                            s.local_music.active = false;
                            s.local_music.browsing = false;
                            s.local_music.current_track = None;
                            s.local_music.playing = false;
                            s.local_music.elapsed_ms = None;
                            s.local_music.duration_ms = None;
                            s.now_playing = s
                                .local_music
                                .phone_now_playing
                                .clone()
                                .or_else(|| previous_now_playing.take())
                                .unwrap_or_default();
                        });
                    }
                    Ask::Command(LocalMusicCommand::Hide) => {
                        if current.is_some() {
                            hub.update(|s| s.local_music.browsing = false);
                        } else {
                            hub.update(|s| {
                                s.local_music.active = false;
                                s.local_music.browsing = false;
                                s.now_playing = s
                                    .local_music
                                    .phone_now_playing
                                    .clone()
                                    .or_else(|| previous_now_playing.take())
                                    .unwrap_or_default();
                            });
                        }
                    }
                    command @ (Ask::Command(LocalMusicCommand::Refresh) | Ask::Rescan) => {
                        let show_browser = matches!(command, Ask::Command(LocalMusicCommand::Refresh));
                        let roots = music_roots();
                        match tokio::task::spawn_blocking(move || Catalog::scan(&roots)).await {
                            Ok(mut found) => {
                                retain_playing_tags(catalog.as_ref(), &mut found, current.as_deref());
                                let folder = state.borrow().local_music.folder.clone().unwrap_or_else(|| "root".into());
                                let folder_data = found.entries(&folder).map(|(entries, parent)| {
                                    let name = found.folders.get(&folder).map(|item| item.label.clone());
                                    (entries, parent, name)
                                });
                                let root_data = found.entries("root").map(|(entries, parent)| {
                                    let name = found.folders.get("root").map(|item| item.label.clone());
                                    (entries, parent, name)
                                });
                                let (folder, data) = if folder_data.is_some() {
                                    (folder, folder_data)
                                } else {
                                    ("root".into(), root_data)
                                };
                                catalog = Some(found);
                                hub.update(|s| {
                                    s.local_music.scanned = true;
                                    s.local_music.browsing |= show_browser;
                                    s.local_music.error = None;
                                    s.local_music.eject_device = catalog.as_ref()
                                        .and_then(|found| found.folders.get(&folder))
                                        .and_then(|folder| folder.eject_device.clone());
                                    if let Some((entries, parent, name)) = data {
                                        s.local_music.folder = Some(folder);
                                        s.local_music.folder_name = name;
                                        s.local_music.parent = parent;
                                        s.local_music.entries = entries;
                                    } else if let Some(catalog) = catalog.as_ref() {
                                        update_browse(&mut s.local_music, catalog, "root");
                                    }
                                });
                            }
                            Err(error) => hub.update(|s| s.local_music.error = Some(error.to_string())),
                        }
                    }
                    Ask::Command(LocalMusicCommand::Eject { device }) => {
                        let roots = music_roots();
                        if !roots.iter().any(|root| root.eject_device.as_deref() == Some(&device)) {
                            hub.update(|s| s.local_music.error = Some("That USB drive is no longer mounted read-only".into()));
                            continue;
                        }
                        // Scans are awaited in this actor, so none can still hold this drive.
                        // Stop all local playback conservatively, including cross-drive playlists.
                        stop_decoder(decoder.take(), &host, stream.take());
                        queue.clear();
                        current = None;
                        catalog = None;
                        duration_ms = None;
                        elapsed_ms = 0.0;
                        hub.update(|s| {
                            s.local_music.ejecting = true;
                            s.local_music.eject_device = None;
                            s.local_music.error = None;
                            s.local_music.playing = false;
                            s.local_music.current_track = None;
                            s.local_music.elapsed_ms = None;
                            s.local_music.duration_ms = None;
                            s.local_music.entries.clear();
                            s.now_playing.playing = Some(false);
                        });
                        let result = eject(&device).await;
                        let roots = music_roots();
                        match tokio::task::spawn_blocking(move || Catalog::scan(&roots)).await {
                            Ok(found) => catalog = Some(found),
                            Err(error) => hub.update(|s| s.local_music.error = Some(error.to_string())),
                        }
                        hub.update(|s| {
                            s.local_music.ejecting = false;
                            s.local_music.browsing = true;
                            if let Some(found) = &catalog {
                                update_browse(&mut s.local_music, found, "root");
                            }
                            if let Err(error) = result {
                                s.local_music.error = Some(error);
                            }
                        });
                    }
                    Ask::Command(LocalMusicCommand::Browse { id }) => {
                        if let Some(found) = &catalog {
                            hub.update(|s| {
                                s.local_music.browsing = true;
                                update_browse(&mut s.local_music, found, &id);
                            });
                        }
                    }
                    Ask::Command(LocalMusicCommand::Play { id }) => {
                        let Some(found) = &catalog else { continue };
                        let folder = state.borrow().local_music.folder.clone().unwrap_or_else(|| "root".into());
                        let mut tracks = found.directory_queue(&folder);
                        let Some(index) = tracks.iter().position(|track| track == &id) else { continue };
                        if found.tracks.get(&id).and_then(|t| found.validate(&t.path)).is_none() {
                            stop_decoder(decoder.take(), &host, stream.take());
                            set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, "That music file is no longer available".into());
                            continue;
                        }
                        queue = std::mem::take(&mut tracks);
                        queue_index = index;
                        if let Err(error) = start_track(
                            &hub, &host, found, &queue, queue_index, &events_tx,
                            &mut decoder, &mut stream, &mut current, &mut duration_ms,
                            &mut elapsed_ms, &mut previous_now_playing, &state,
                        ).await {
                            set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, error);
                        }
                    }
                    Ask::Command(LocalMusicCommand::PlayPlaylist { id }) => {
                        let Some(found) = &catalog else { continue };
                        let Some(playlist) = found.playlists.get(&id) else { continue };
                        let tracks: Vec<_> = playlist.tracks.iter()
                            .filter(|id| found.tracks.get(*id).is_some_and(|t| found.validate(&t.path).is_some()))
                            .cloned().collect();
                        if tracks.is_empty() {
                            stop_decoder(decoder.take(), &host, stream.take());
                            set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, "The playlist has no available music files".into());
                            continue;
                        }
                        queue = tracks;
                        queue_index = 0;
                        if let Err(error) = start_track(
                            &hub, &host, found, &queue, queue_index, &events_tx,
                            &mut decoder, &mut stream, &mut current, &mut duration_ms,
                            &mut elapsed_ms, &mut previous_now_playing, &state,
                        ).await {
                            set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, error);
                        }
                    }
                    Ask::Control(control) => {
                        match control {
                            MediaControl::PlayPause if state.borrow().local_music.playing => {
                                if let Some(decoder) = &decoder { let _ = decoder.commands.send(DecoderCommand::Pause); }
                                if let Some(stream) = stream { host.set_audio_active(stream, false); }
                                set_playing(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, false);
                            }
                            MediaControl::Pause => {
                                if let Some(decoder) = &decoder { let _ = decoder.commands.send(DecoderCommand::Pause); }
                                if let Some(stream) = stream { host.set_audio_active(stream, false); }
                                set_playing(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, false);
                            }
                            MediaControl::Play | MediaControl::PlayPause => {
                                if decoder.is_some() {
                                    if let Some(decoder) = &decoder { let _ = decoder.commands.send(DecoderCommand::Play); }
                                    if let Some(stream) = stream { host.set_audio_active(stream, true); }
                                    set_playing(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, true);
                                } else if !queue.is_empty()
                                    && let Some(found) = &catalog
                                    && let Err(error) = start_track(
                                        &hub, &host, found, &queue, queue_index, &events_tx,
                                        &mut decoder, &mut stream, &mut current, &mut duration_ms,
                                        &mut elapsed_ms, &mut previous_now_playing, &state,
                                    ).await {
                                    set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, error);
                                }
                            }
                            MediaControl::Next | MediaControl::Prev => {
                                if !queue.is_empty() {
                                    if control == MediaControl::Next {
                                        queue_index = (queue_index + 1) % queue.len();
                                    } else {
                                        queue_index = queue_index.checked_sub(1).unwrap_or(queue.len() - 1);
                                    }
                                    if let Some(found) = &catalog
                                        && let Err(error) = start_track(
                                            &hub, &host, found, &queue, queue_index, &events_tx,
                                            &mut decoder, &mut stream, &mut current, &mut duration_ms,
                                            &mut elapsed_ms, &mut previous_now_playing, &state,
                                        ).await
                                    {
                                        set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, error);
                                    }
                                }
                            }
                        }
                    }
                    Ask::Seek(ms) => {
                        if let Some(decoder) = &decoder {
                            let _ = decoder.commands.send(DecoderCommand::Seek(ms));
                            elapsed_ms = f64::from(ms).min(duration_ms.unwrap_or(f64::from(ms)));
                            hub.update(|s| {
                                s.local_music.elapsed_ms = Some(elapsed_ms);
                                if let Some(track) = current.as_ref().and_then(|id| catalog.as_ref()?.tracks.get(id)) {
                                    s.now_playing = now_playing(track, duration_ms, Some(elapsed_ms), s.local_music.playing);
                                }
                            });
                        }
                    }
                }
            }
            Some(event) = events_rx.recv() => {
                match event {
                    DecoderEvent::Tags(event_stream, track_id, tags) => {
                        if stream != Some(event_stream) || current.as_deref() != Some(track_id.as_str()) {
                            continue;
                        }
                        if let Some(track) = catalog.as_mut().and_then(|found| found.tracks.get_mut(&track_id)) {
                            apply_track_tags(track, tags);
                            hub.update(|s| {
                                s.now_playing = now_playing(track, duration_ms, Some(elapsed_ms), s.local_music.playing);
                            });
                        }
                    }
                    DecoderEvent::Position(event_stream, track_id, position, duration) => {
                        if stream != Some(event_stream) || current.as_deref() != Some(track_id.as_str()) {
                            continue;
                        }
                        elapsed_ms = position;
                        duration_ms = duration;
                        hub.update(|s| {
                            s.local_music.elapsed_ms = Some(position);
                            s.local_music.duration_ms = duration;
                            if let Some(track) = current.as_ref().and_then(|id| catalog.as_ref()?.tracks.get(id)) {
                                s.now_playing = now_playing(track, duration, Some(position), s.local_music.playing);
                            }
                        });
                    }
                    DecoderEvent::End(event_stream, track_id) => {
                        if stream != Some(event_stream) || current.as_deref() != Some(track_id.as_str()) {
                            continue;
                        }
                        if !queue.is_empty() && queue_index + 1 < queue.len() {
                            queue_index += 1;
                            if let Some(found) = &catalog
                                && let Err(error) = start_track(
                                    &hub, &host, found, &queue, queue_index, &events_tx,
                                    &mut decoder, &mut stream, &mut current, &mut duration_ms,
                                    &mut elapsed_ms, &mut previous_now_playing, &state,
                                ).await {
                                set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, error);
                            }
                        } else {
                            stop_decoder(decoder.take(), &host, stream.take());
                            set_playing(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, false);
                        }
                    }
                    DecoderEvent::Error(event_stream, track_id, error) => {
                        if stream != Some(event_stream) || current.as_deref() != Some(track_id.as_str()) {
                            continue;
                        }
                        stop_decoder(decoder.take(), &host, stream.take());
                        set_error(&hub, catalog.as_ref(), current.as_deref(), duration_ms, elapsed_ms, error);
                    }
                }
            }
            changed = state.changed() => {
                if changed.is_err() { break; }
                let snapshot = state.borrow_and_update();
                if snapshot.config.disable_audio_output {
                    if let Some(stream) = stream { host.set_audio_active(stream, false); }
                } else if let Some(stream) = stream
                    && snapshot.local_music.playing
                {
                    host.set_audio_active(stream, true);
                }
                let next_level = snapshot.local_music.audio_level.clamp(0.0, 1.0);
                if (next_level - audio_level).abs() > 0.0001 {
                    audio_level = next_level;
                    if let Some(stream) = stream { host.set_audio_volume(stream, audio_level, 250); }
                }
            }
            else => break,
        }
    }
    stop_decoder(decoder, &host, stream);
}

#[allow(clippy::too_many_arguments)]
async fn start_track(
    hub: &crate::hub::Hub,
    host: &GstHost,
    catalog: &Catalog,
    queue: &[String],
    queue_index: usize,
    events: &mpsc::UnboundedSender<DecoderEvent>,
    active_decoder: &mut Option<Decoder>,
    active_stream: &mut Option<u32>,
    current: &mut Option<String>,
    duration_ms: &mut Option<f64>,
    elapsed_ms: &mut f64,
    previous_now_playing: &mut Option<NowPlaying>,
    state: &watch::Receiver<State>,
) -> Result<(), String> {
    stop_decoder(active_decoder.take(), host, active_stream.take());
    let id = queue.get(queue_index).ok_or("music queue is empty")?;
    let track = catalog.tracks.get(id).ok_or("music track is unavailable")?;
    let path = catalog
        .validate(&track.path)
        .ok_or("music file is no longer within an approved music folder")?;
    let level = state.borrow().local_music.audio_level.clamp(0.0, 1.0);
    let device = state
        .borrow()
        .config
        .audio_output_device
        .clone()
        .unwrap_or_default();
    let stream = open_stream(host, &device, level)
        .await
        .ok_or("the audio output is unavailable")?;
    *active_stream = Some(stream);
    match decoder(path, id.clone(), stream, host.clone(), events.clone()) {
        Ok(next) => *active_decoder = Some(next),
        Err(error) => {
            host.set_audio_active(stream, false);
            host.close_audio(stream);
            *active_stream = None;
            return Err(error);
        }
    }
    *current = Some(id.clone());
    *duration_ms = None;
    *elapsed_ms = 0.0;
    if previous_now_playing.is_none() {
        *previous_now_playing = Some(state.borrow().now_playing.clone());
    }
    hub.update(|s| {
        s.local_music.active = true;
        s.local_music.browsing = false;
        s.local_music.current_track = Some(id.clone());
        s.local_music.playing = true;
        s.local_music.elapsed_ms = Some(0.0);
        s.local_music.duration_ms = None;
        s.local_music.error = None;
        s.now_playing = now_playing(track, None, Some(0.0), true);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let path = std::env::current_dir()
                .unwrap()
                .join("target")
                .join(format!(
                    "local-music-test-{}-{}",
                    std::process::id(),
                    NEXT.fetch_add(1, Ordering::Relaxed)
                ));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn playing_tags_survive_a_library_rescan() {
        gst::init().unwrap();
        let mut tags = gst::TagList::new();
        let list = tags.get_mut().unwrap();
        list.add::<gst::tags::Title>(&"Road Song", gst::TagMergeMode::Replace);
        list.add::<gst::tags::Artist>(&"Sample Artist", gst::TagMergeMode::Replace);
        list.add::<gst::tags::Album>(&"Demo Album", gst::TagMergeMode::Replace);

        let dir = TestDir::new();
        let path = dir.0.join("fallback.mp3");
        fs::write(&path, []).unwrap();
        let roots = [Root {
            label: "Music".into(),
            path: dir.0.clone(),
            eject_device: None,
        }];
        let id = path_id(&fs::canonicalize(&path).unwrap());
        let mut original = Catalog::scan(&roots);
        apply_track_tags(original.tracks.get_mut(&id).unwrap(), track_tags(&tags));
        let mut refreshed = Catalog::scan(&roots);
        retain_playing_tags(Some(&original), &mut refreshed, Some(&id));
        let now = now_playing(&refreshed.tracks[&id], None, None, true);
        assert_eq!(now.title.as_deref(), Some("Road Song"));
        assert_eq!(now.artist.as_deref(), Some("Sample Artist"));
        assert_eq!(now.album.as_deref(), Some("Demo Album"));
    }

    #[test]
    fn only_read_only_usb_mounts_are_ejectable() {
        let mountinfo = "\
24 1 8:1 / /run/livi-media/sda1 ro,nosuid,nodev - vfat /dev/sda1 ro\n\
25 1 8:16 / /run/livi-media/sdb ro,nosuid,nodev - vfat /dev/sdb ro\n\
26 1 8:33 / /run/livi-media/rw rw - ext4 /dev/sdc1 rw\n\
27 1 179:1 / /run/livi-media/internal ro - ext4 /dev/mmcblk0p1 ro\n\
28 1 8:49 / /data/livi/music ro - ext4 /dev/sdd1 ro\n";
        assert_eq!(
            mounted_usb_device(mountinfo, Path::new("/run/livi-media/sda1")).as_deref(),
            Some("sda1")
        );
        assert_eq!(
            mounted_usb_device(mountinfo, Path::new("/run/livi-media/sdb")).as_deref(),
            Some("sdb")
        );
        for path in [
            "/data/livi/music",
            "/run/livi-media/internal",
            "/run/livi-media/rw",
            "/run/livi-media/missing",
            "/run/livi-media/sda1/album",
            "/run/livi-media/../music",
        ] {
            assert!(
                mounted_usb_device(mountinfo, Path::new(path)).is_none(),
                "{path}"
            );
        }
    }

    #[test]
    fn eject_command_matches_os_helper_device_basename_signature() {
        let mountinfo = "24 1 8:1 / /run/livi-media/sda1 ro - vfat /dev/sda1 ro";
        let device = mounted_usb_device(mountinfo, Path::new("/run/livi-media/sda1")).unwrap();
        let command = eject_command(&device);
        assert_eq!(command.as_std().get_program(), "sudo");
        assert_eq!(
            command.as_std().get_args().collect::<Vec<_>>(),
            ["-n", "/usr/libexec/livi-media-eject", "sda1"],
        );
        let mismatched = "24 1 8:1 / /run/livi-media/sdb1 ro - vfat /dev/sda1 ro";
        assert!(mounted_usb_device(mismatched, Path::new("/run/livi-media/sdb1")).is_none());
    }

    #[test]
    fn eject_is_available_in_usb_subfolders_but_not_internal_or_library_root() {
        let dir = TestDir::new();
        let internal = dir.0.join("internal");
        let usb = dir.0.join("usb");
        fs::create_dir_all(&internal).unwrap();
        fs::create_dir_all(usb.join("album")).unwrap();
        let catalog = Catalog::scan(&[
            Root {
                label: "Internal".into(),
                path: internal.clone(),
                eject_device: None,
            },
            Root {
                label: "USB".into(),
                path: usb.clone(),
                eject_device: Some("sda1".into()),
            },
        ]);
        let mut state = LocalMusicState::default();
        for folder in [&usb, &usb.join("album")] {
            update_browse(&mut state, &catalog, &path_id(folder));
            assert_eq!(state.eject_device.as_deref(), Some("sda1"));
        }
        for id in ["root".to_string(), path_id(&internal)] {
            update_browse(&mut state, &catalog, &id);
            assert!(state.eject_device.is_none());
        }
    }

    #[test]
    fn pipeline_is_null_after_an_early_error() {
        gst::init().unwrap();
        let pipeline = gst::parse::launch("fakesrc ! fakesink")
            .unwrap()
            .downcast::<gst::Pipeline>()
            .unwrap();
        let fail = || -> Result<(), String> {
            let _cleanup = PipelineGuard(pipeline.clone());
            pipeline.set_state(gst::State::Playing).unwrap();
            Err("simulated seek or state-change failure".into())
        };
        assert!(fail().is_err());
        assert_eq!(pipeline.current_state(), gst::State::Null);
    }

    #[tokio::test]
    async fn stopping_joins_decoder_before_deactivating_and_closing_host_audio() {
        use livi_host_proto::{Framer, ops::*};
        use tokio::io::AsyncReadExt;
        use tokio::net::UnixStream;

        let dir = TestDir::new();
        let socket = dir
            .0
            .strip_prefix(std::env::current_dir().unwrap())
            .unwrap()
            .join("gst.sock");
        let host = GstHost::new(socket.clone());
        let (commands, rx) = std_mpsc::channel();
        let decoder_host = host.clone();
        let runtime = tokio::runtime::Handle::current();
        let thread = thread::spawn(move || {
            let _runtime = runtime.enter();
            let _stream = HostStreamGuard {
                host: decoder_host.clone(),
                stream: 42,
            };
            assert!(matches!(rx.recv().unwrap(), DecoderCommand::Stop));
            decoder_host.push_audio(42, &[1, 2]);
        });
        stop_decoder(Some(Decoder { commands, thread }), &host, Some(42));
        let mut peer = UnixStream::connect(&socket).await.unwrap();
        let mut framer = Framer::new();
        for expected in [OP_AUDIO_DATA, OP_AUDIO_ACTIVE, OP_AUDIO_STOP] {
            let message = loop {
                if let Some(message) = framer.next_message() {
                    break message;
                }
                let mut buf = [0; 1024];
                let count = tokio::time::timeout(Duration::from_secs(2), peer.read(&mut buf))
                    .await
                    .unwrap()
                    .unwrap();
                assert_ne!(count, 0);
                framer.push(&buf[..count]);
            };
            assert_eq!(message.id, 42);
            assert_eq!(message.op, expected);
            if expected == OP_AUDIO_ACTIVE {
                assert_eq!(message.rest, [0]);
            }
        }
    }

    #[tokio::test]
    async fn decoder_startup_error_closes_host_audio_without_waiting_for_actor() {
        use livi_host_proto::{Framer, ops::*};
        use tokio::io::AsyncReadExt;
        use tokio::net::UnixStream;

        let dir = TestDir::new();
        let socket = dir
            .0
            .strip_prefix(std::env::current_dir().unwrap())
            .unwrap()
            .join("gst.sock");
        let host = GstHost::new(socket.clone());
        host.set_audio_active(42, true);
        let mut peer = UnixStream::connect(&socket).await.unwrap();
        let (events, mut rx) = mpsc::unbounded_channel();
        let decoder = decoder(
            dir.0.join("missing.mp3"),
            "missing".into(),
            42,
            host,
            events,
        )
        .unwrap();
        decoder.thread.join().unwrap();
        let mut framer = Framer::new();
        for (op, rest) in [
            (OP_AUDIO_ACTIVE, vec![1]),
            (OP_AUDIO_ACTIVE, vec![0]),
            (OP_AUDIO_STOP, vec![]),
        ] {
            let message = loop {
                if let Some(message) = framer.next_message() {
                    break message;
                }
                let mut buf = [0; 1024];
                let count = tokio::time::timeout(Duration::from_secs(2), peer.read(&mut buf))
                    .await
                    .unwrap()
                    .unwrap();
                assert_ne!(count, 0);
                framer.push(&buf[..count]);
            };
            assert_eq!(message.id, 42);
            assert_eq!(message.op, op);
            assert_eq!(message.rest, rest);
        }
        assert!(matches!(rx.try_recv(), Ok(DecoderEvent::Error(42, _, _))));
    }

    #[test]
    fn m4a_and_wave_are_included_in_folders_and_relative_playlists() {
        let dir = TestDir::new();
        fs::write(dir.0.join("Song.M4A"), []).unwrap();
        fs::write(dir.0.join("Recording.wave"), []).unwrap();
        fs::write(dir.0.join("playlist.m3u8"), "Song.M4A\nRecording.wave\n").unwrap();
        let catalog = Catalog::scan(&[Root {
            label: "Music".into(),
            path: dir.0.clone(),
            eject_device: None,
        }]);
        assert_eq!(catalog.directory_queue(&path_id(&dir.0)).len(), 2);
        assert_eq!(catalog.playlists.values().next().unwrap().tracks.len(), 2);
    }

    #[test]
    fn scans_supported_audio_and_relative_playlists_only_within_root() {
        let dir = TestDir::new();
        fs::create_dir_all(dir.0.join("album")).unwrap();
        fs::write(dir.0.join("album/Artist - Song.flac"), []).unwrap();
        fs::write(dir.0.join("outside.mp3"), []).unwrap();
        fs::write(
            dir.0.join("album/list.m3u8"),
            format!(
                "../outside.mp3\nArtist - Song.flac\n../../elsewhere.mp3\nhttps://example.invalid/song.mp3\n{}\n",
                dir.0.join("outside.mp3").display()
            ),
        )
        .unwrap();
        fs::write(dir.0.join("album/ignore.txt"), []).unwrap();
        let roots = vec![Root {
            label: "Test Music".into(),
            path: dir.0.clone(),
            eject_device: None,
        }];
        let catalog = Catalog::scan(&roots);
        let album = path_id(&dir.0.join("album"));
        let entries = catalog.entries(&album).unwrap().0;
        assert_eq!(
            entries
                .iter()
                .filter(|entry| entry.kind == LocalMusicEntryKind::Track)
                .count(),
            1
        );
        let playlist = catalog.playlists.values().next().unwrap();
        assert_eq!(playlist.tracks.len(), 2);
        assert!(
            playlist
                .tracks
                .iter()
                .all(|id| catalog.tracks.contains_key(id))
        );
    }

    #[test]
    fn recognizes_all_first_release_audio_formats_case_insensitively() {
        for extension in [
            "mp3", "flac", "wav", "wave", "aac", "m4a", "ogg", "opus", "MP3", "M4A",
        ] {
            assert!(supported_audio(Path::new(&format!("song.{extension}"))));
        }
        assert!(!supported_audio(Path::new("cover.jpg")));
        assert!(!supported_audio(Path::new("playlist.m3u8")));
    }

    #[test]
    fn validates_selected_paths_against_canonical_roots() {
        let dir = TestDir::new();
        let root = dir.0.join("music");
        fs::create_dir_all(&root).unwrap();
        let track = root.join("song.mp3");
        fs::write(&track, []).unwrap();
        let outside = dir.0.join("outside.mp3");
        fs::write(&outside, []).unwrap();
        let catalog = Catalog::scan(&[Root {
            label: "Music".into(),
            path: root.clone(),
            eject_device: None,
        }]);
        assert!(catalog.validate(&track).is_some());
        assert!(catalog.validate(&outside).is_none());
        #[cfg(unix)]
        {
            let link = root.join("outside-link.mp3");
            std::os::unix::fs::symlink(&outside, &link).unwrap();
            assert!(catalog.validate(&link).is_none());
        }
    }
}
