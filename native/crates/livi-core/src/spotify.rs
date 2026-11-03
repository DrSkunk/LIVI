// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::io;
use std::path::Path;
use std::time::Duration;

use futures_util::future::pending;
use librespot_core::{Session, SpotifyUri, authentication::Credentials, config::SessionConfig};
use librespot_metadata::audio::UniqueFields;
use librespot_playback::{
    audio_backend,
    config::{AudioFormat, PlayerConfig},
    mixer::{self, MixerConfig},
    player::{Player, PlayerEvent},
};
use livi_core_proto::message::{MediaControl, SpotifyCommand};
use livi_core_proto::state::{MediaSource, NowPlaying, SpotifyItem};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

mod api;
mod auth;

#[derive(Debug)]
pub enum Ask {
    Control(MediaControl),
    Seek(u32),
    Command(SpotifyCommand),
    Shutdown,
}

pub type Asks = mpsc::UnboundedReceiver<Ask>;
pub type Sender = mpsc::UnboundedSender<Ask>;

pub fn channel() -> (Sender, Asks) {
    mpsc::unbounded_channel()
}

struct Playback {
    session: Session,
    player: Option<std::sync::Arc<Player>>,
    mixer: Option<std::sync::Arc<dyn mixer::Mixer>>,
}

impl Drop for Playback {
    fn drop(&mut self) {
        if let Some(player) = &self.player {
            player.stop();
        }
        self.session.shutdown();
    }
}

enum Outcome {
    Ready {
        account: auth::Account,
        playback: Playback,
        name: String,
        output_device: Option<String>,
    },
    NoLogin,
    Page(api::Page),
    Tracks {
        items: Vec<SpotifyItem>,
        append: bool,
    },
}

type Job = JoinHandle<Result<Outcome, String>>;

async fn abort(job: &mut Option<Job>) {
    if let Some(job) = job.take() {
        job.abort();
        let _ = job.await;
    }
}

fn fail(hub: &crate::hub::Hub, error: String) {
    eprintln!("[spotify] {error}");
    hub.update(|s| {
        s.spotify.error = Some(error);
    });
}

fn start_queue(hub: &crate::hub::Hub, playback: &Playback, index: usize) -> Result<(), String> {
    let snapshot = hub.watch().borrow().spotify.clone();
    let item = snapshot
        .queue
        .get(index)
        .ok_or("Spotify queue position is out of range")?;
    let uri = SpotifyUri::from_uri(&item.uri).map_err(|_| "Invalid Spotify queue track")?;
    let player = playback
        .player
        .as_ref()
        .ok_or("Spotify player is not ready")?;
    player.load(uri, true, 0);
    hub.update(|s| {
        s.media_source = MediaSource::Spotify;
        s.spotify.queue_index = Some(index);
        s.spotify.error = None;
    });
    Ok(())
}

fn queue_step(index: Option<usize>, length: usize, next: bool) -> Option<usize> {
    if length == 0 {
        return None;
    }
    if next {
        index.map_or(Some(0), |i| i.checked_add(1).filter(|i| *i < length))
    } else {
        Some(index.unwrap_or(0).saturating_sub(1).min(length - 1))
    }
}

pub async fn run(hub: std::sync::Arc<crate::hub::Hub>, user_data: &Path, mut asks: Asks) {
    let directory = user_data.join("spotify");
    let mut state = hub.watch();
    let mut config = state.borrow().config.clone();
    let mut account: Option<auth::Account> = None;
    let mut playback: Option<Playback> = None;
    let mut events: Option<librespot_playback::player::PlayerEventChannel> = None;
    let mut now_playing = NowPlaying::default();
    let mut resume: Option<(usize, u32, bool)> = None;
    let mut job: Option<Job> = None;
    let mut health = tokio::time::interval(Duration::from_secs(5));
    if !config.spotify_client_id.is_empty() {
        let (id, dir, cfg) = (
            config.spotify_client_id.clone(),
            directory.clone(),
            config.clone(),
        );
        job = Some(tokio::spawn(async move {
            match auth::Account::restore(&id, &dir).await? {
                Some(account) => ready(account, &dir, &cfg).await,
                None => Ok(Outcome::NoLogin),
            }
        }));
        hub.update(|s| {
            s.spotify.busy = true;
            s.spotify.connecting = true;
        });
    } else if let Err(error) = auth::forget(&directory) {
        fail(&hub, error);
    }
    loop {
        tokio::select! {
            ask = asks.recv() => {
                let result = match ask {
                    None | Some(Ask::Shutdown) => break,
                    Some(Ask::Command(SpotifyCommand::Logout)) => {
                        abort(&mut job).await;
                        events = None;
                        playback = None;
                        account = None;
                        resume = None;
                        now_playing = NowPlaying::default();
                        hub.update(|s| {
                            s.spotify = Default::default();
                            if s.media_source == MediaSource::Spotify {
                                s.now_playing = NowPlaying::default();
                            }
                        });
                        auth::forget(&directory)
                    }
                    Some(Ask::Command(SpotifyCommand::Cancel)) => {
                        abort(&mut job).await;
                        resume = None;
                        hub.update(|s| {
                            s.spotify.busy = false;
                            s.spotify.connecting = false;
                            s.spotify.auth_url = None;
                        });
                        if account.is_none() { auth::forget(&directory) } else { Ok(()) }
                    }
                    Some(Ask::Command(SpotifyCommand::Login)) => {
                        abort(&mut job).await;
                        events = None;
                        playback = None;
                        account = None;
                        resume = None;
                        now_playing = NowPlaying::default();
                        let (hub, dir, cfg) = (hub.clone(), directory.clone(), config.clone());
                        hub.update(|s| {
                            s.spotify.logged_in = false;
                            s.spotify.connecting = true;
                            s.spotify.busy = true;
                            s.spotify.error = None;
                        });
                        job = Some(tokio::spawn(async move {
                            let account = auth::login(hub, cfg.spotify_client_id.clone(), dir.clone()).await?;
                            ready(account, &dir, &cfg).await
                        }));
                        Ok(())
                    }
                    Some(Ask::Command(SpotifyCommand::ClearQueue)) => {
                        abort(&mut job).await;
                        if let Some(p) = &playback && let Some(p) = &p.player { p.stop(); }
                        now_playing = NowPlaying::default();
                        hub.update(|s| {
                            s.spotify.queue.clear();
                            s.spotify.queue_index = None;
                            s.spotify.busy = false;
                        });
                        Ok(())
                    }
                    Some(Ask::Command(SpotifyCommand::RemoveQueue { index })) => {
                        let current = hub.watch().borrow().spotify.clone();
                        if index >= current.queue.len() {
                            Err("Spotify queue position is out of range".into())
                        } else {
                            if current.queue_index == Some(index) {
                                if let Some(p) = &playback && let Some(p) = &p.player { p.stop(); }
                                now_playing = NowPlaying::default();
                            }
                            hub.update(|s| {
                                s.spotify.queue.remove(index);
                                s.spotify.queue_index = match current.queue_index {
                                    Some(i) if i == index => None,
                                    Some(i) if i > index => Some(i - 1),
                                    other => other,
                                };
                            });
                            Ok(())
                        }
                    }
                    Some(Ask::Command(SpotifyCommand::PlayQueue { index })) => {
                        match &playback {
                            Some(p) => start_queue(&hub, p, index),
                            None => Err("Log in to Spotify before playing".into()),
                        }
                    }
                    Some(Ask::Command(command)) => {
                        if let Some(a) = account.clone() {
                            abort(&mut job).await;
                            hub.update(|s| {
                                s.spotify.busy = true;
                                s.spotify.error = None;
                                if matches!(command,
                                    SpotifyCommand::Playlists { offset: 0 }
                                    | SpotifyCommand::Albums { offset: 0 }
                                    | SpotifyCommand::Search { offset: 0, .. }
                                    | SpotifyCommand::Open { offset: 0, .. }
                                ) {
                                    s.spotify.items.clear();
                                    s.spotify.next_offset = None;
                                }
                            });
                            job = Some(tokio::spawn(async move {
                                match command {
                                    SpotifyCommand::Play { uri } => Ok(Outcome::Tracks { items: a.tracks(&uri).await?, append: false }),
                                    SpotifyCommand::Enqueue { uri } => Ok(Outcome::Tracks { items: a.tracks(&uri).await?, append: true }),
                                    other => a.browse(&other).await.map(Outcome::Page),
                                }
                            }));
                            Ok(())
                        } else {
                            Err("Log in to Spotify first".into())
                        }
                    }
                    Some(Ask::Seek(position)) => {
                        match playback.as_ref().and_then(|p| p.player.as_ref()) {
                            Some(p) => { p.seek(position); Ok(()) }
                            None => Err("Spotify player is not connected".into()),
                        }
                    }
                    Some(Ask::Control(control)) => {
                        match &playback {
                            Some(p) => {
                                let player = p.player.as_ref().expect("connected player");
                                match control {
                                    MediaControl::PlayPause if now_playing.playing == Some(true) => { player.pause(); Ok(()) }
                                    MediaControl::PlayPause | MediaControl::Play => {
                                        if hub.watch().borrow().spotify.queue_index.is_none() {
                                            start_queue(&hub, p, 0)
                                        } else {
                                            player.play(); Ok(())
                                        }
                                    }
                                    MediaControl::Pause => { player.pause(); Ok(()) }
                                    MediaControl::Next | MediaControl::Prev => {
                                        let current = hub.watch().borrow().spotify.clone();
                                        match queue_step(current.queue_index, current.queue.len(), control == MediaControl::Next) {
                                            Some(index) => start_queue(&hub, p, index),
                                            None => {
                                                player.stop();
                                                hub.update(|s| s.spotify.queue_index = None);
                                                Ok(())
                                            }
                                        }
                                    }
                                }
                            }
                            None => Err("Spotify player is not connected".into()),
                        }
                    }
                };
                if let Err(error) = result { fail(&hub, error); }
            }
            result = async {
                match &mut job { Some(job) => job.await, None => pending().await }
            } => {
                job = None;
                hub.update(|s| {
                    s.spotify.busy = false;
                    s.spotify.connecting = false;
                    s.spotify.auth_url = None;
                });
                let result = match result {
                    Ok(result) => result,
                    Err(_) => Err("Spotify background operation failed".into()),
                };
                match result {
                    Ok(Outcome::Ready { account: a, playback: p, name, output_device }) => {
                        let latest = hub.watch().borrow().config.clone();
                        if a.client_id != latest.spotify_client_id {
                            drop(p);
                            if let Err(error) = auth::forget(&directory) { fail(&hub, error); }
                            continue;
                        }
                        if output_device != latest.audio_output_device {
                            drop(p);
                            let dir = directory.clone();
                            hub.update(|s| { s.spotify.busy = true; s.spotify.connecting = true; });
                            job = Some(tokio::spawn(async move { ready(a, &dir, &latest).await }));
                            continue;
                        }
                        events = p.player.as_ref().map(|p| p.get_player_event_channel());
                        account = Some(a);
                        playback = Some(p);
                        hub.update(|s| {
                            s.spotify.logged_in = true;
                            s.spotify.account = name;
                            s.spotify.error = None;
                        });
                        if let Some((index, position, playing)) = resume.take()
                            && let Some(p) = &playback
                        {
                            if let Err(error) = start_queue(&hub, p, index) { fail(&hub, error); }
                            if let Some(player) = &p.player {
                                player.seek(position);
                                if !playing { player.pause(); }
                            }
                        }
                    }
                    Ok(Outcome::NoLogin) => {}
                    Ok(Outcome::Page(page)) => hub.update(|s| {
                        if page.append { s.spotify.items.extend(page.items); }
                        else { s.spotify.items = page.items; }
                        s.spotify.next_offset = page.next_offset;
                    }),
                    Ok(Outcome::Tracks { items, append }) => {
                        let size = hub.watch().borrow().spotify.queue.len();
                        if append && size.saturating_add(items.len()) > 10000 {
                            fail(&hub, "The LIVI Spotify queue is limited to 10,000 tracks".into());
                        } else {
                            hub.update(|s| {
                                if append { s.spotify.queue.extend(items); }
                                else { s.spotify.queue = items; s.spotify.queue_index = None; }
                            });
                            if !append && let Some(p) = &playback
                                && let Err(error) = start_queue(&hub, p, 0)
                            { fail(&hub, error); }
                        }
                    }
                    Err(error) => { resume = None; fail(&hub, error); }
                }
            }
            event = async {
                match &mut events { Some(events) => events.recv().await, None => pending().await }
            } => {
                if let Some(event) = event {
                    match &event {
                        PlayerEvent::EndOfTrack { track_id, .. } => {
                            let current = hub.watch().borrow().spotify.clone();
                            let expected = current.queue_index.and_then(|i| current.queue.get(i));
                            if expected.is_some_and(|i| track_id.to_uri().ok().as_deref() == Some(i.uri.as_str())) {
                                if let Some(index) = queue_step(current.queue_index, current.queue.len(), true)
                                    && let Some(p) = &playback
                                {
                                    if let Err(error) = start_queue(&hub, p, index) { fail(&hub, error); }
                                } else {
                                    now_playing.playing = Some(false);
                                    hub.update(|s| s.spotify.queue_index = None);
                                }
                            }
                        }
                        PlayerEvent::Unavailable { .. } => {
                            now_playing.playing = Some(false);
                            fail(&hub, "Spotify track is unavailable for this account or region".into());
                        }
                        _ => {}
                    }
                    apply_event(&hub, event, &mut now_playing);
                } else {
                    abort(&mut job).await;
                    events = None;
                    playback = None;
                    account = None;
                    now_playing.playing = Some(false);
                    hub.update(|s| {
                        s.spotify.logged_in = false;
                        s.spotify.busy = false;
                        s.spotify.connecting = false;
                    });
                    fail(&hub, "Spotify player disconnected. Log in again.".into());
                }
            }
            changed = state.changed() => {
                if changed.is_err() { break; }
                let snapshot = state.borrow_and_update().clone();
                if snapshot.config.spotify_client_id != config.spotify_client_id {
                    abort(&mut job).await;
                    events = None;
                    playback = None;
                    account = None;
                    now_playing = NowPlaying::default();
                    resume = None;
                    hub.update(|s| s.spotify = Default::default());
                    if let Err(error) = auth::forget(&directory) { fail(&hub, error); }
                } else if snapshot.config.audio_output_device != config.audio_output_device
                    && let Some(a) = account.take()
                {
                    abort(&mut job).await;
                    resume = snapshot.spotify.queue_index.map(|i| (
                        i, now_playing.elapsed_ms.unwrap_or(0.0).max(0.0) as u32,
                        now_playing.playing == Some(true),
                    ));
                    events = None;
                    playback = None;
                    let (dir, cfg) = (directory.clone(), snapshot.config.clone());
                    hub.update(|s| {
                        s.spotify.logged_in = false;
                        s.spotify.busy = true;
                        s.spotify.connecting = true;
                    });
                    job = Some(tokio::spawn(async move { ready(a, &dir, &cfg).await }));
                }
                config = snapshot.config;
                if let Some(p) = &playback && let Some(mixer) = &p.mixer {
                    mixer.set_volume(volume(&config));
                }
                if snapshot.media_source == MediaSource::Spotify {
                    hub.update(|s| {
                        if s.media_source == MediaSource::Spotify { s.now_playing = now_playing.clone(); }
                    });
                }
            }
            _ = health.tick() => {
                if playback.as_ref().is_some_and(|p| p.session.is_invalid()
                    || p.player.as_ref().is_some_and(|p| p.is_invalid()))
                {
                    abort(&mut job).await;
                    playback = None;
                    events = None;
                    account = None;
                    now_playing.playing = Some(false);
                    hub.update(|s| {
                        s.spotify.logged_in = false;
                        s.spotify.busy = false;
                        s.spotify.connecting = false;
                        if s.media_source == MediaSource::Spotify {
                            s.now_playing = now_playing.clone();
                        }
                    });
                    fail(&hub, "Spotify connection closed. Log in again.".into());
                }
            }
        }
    }
    abort(&mut job).await;
}

async fn ready(
    account: auth::Account,
    directory: &Path,
    config: &livi_core_proto::config::Config,
) -> Result<Outcome, String> {
    let name = account.profile().await?;
    let token = account.access_token().await?;
    let session_config = SessionConfig {
        client_id: account.client_id.clone(),
        device_id: device_id(directory)
            .map_err(|e| format!("Cannot load Spotify device ID: {e}"))?,
        ..SessionConfig::default()
    };
    let mut playback = Playback {
        session: Session::new(session_config, None),
        player: None,
        mixer: None,
    };
    tokio::time::timeout(
        Duration::from_secs(45),
        playback
            .session
            .connect(Credentials::with_access_token(token), false),
    )
    .await
    .map_err(|_| "Spotify player connection timed out".to_string())?
    .map_err(|_| {
        "Spotify player login failed. Check Premium and developer app permissions.".to_string()
    })?;
    let mixer_factory = mixer::find(None).ok_or("no librespot volume mixer available")?;
    let mixer = mixer_factory(MixerConfig::default()).map_err(|e| e.to_string())?;
    let backend = audio_backend::find(Some("gstreamer".into()))
        .ok_or("librespot GStreamer backend is unavailable")?;
    let device = audio_device(config.audio_output_device.as_deref());
    let format = AudioFormat::default();
    let player_config = PlayerConfig {
        position_update_interval: Some(Duration::from_secs(1)),
        ..PlayerConfig::default()
    };
    let player = Player::new(
        player_config,
        playback.session.clone(),
        mixer.get_soft_volume(),
        move || backend(device, format),
    );
    mixer.set_volume(volume(config));
    playback.player = Some(player);
    playback.mixer = Some(mixer);
    Ok(Outcome::Ready {
        account,
        playback,
        name,
        output_device: config.audio_output_device.clone(),
    })
}

fn audio_device(device: Option<&str>) -> Option<String> {
    let device = device.filter(|device| !device.is_empty())?;
    let (element, property) = if cfg!(target_os = "macos") {
        ("osxaudiosink", "unique-id")
    } else {
        ("pulsesink", "device")
    };
    let escaped = device.replace('\\', "\\\\").replace('"', "\\\"");
    Some(format!(
        "audioconvert dithering=none ! audioresample ! {element} {property}=\"{escaped}\""
    ))
}

fn volume(config: &livi_core_proto::config::Config) -> u16 {
    let level = if config.disable_audio_output {
        0.0
    } else {
        config.audio_volume.clamp(0.0, 1.0)
    };
    (level * f64::from(u16::MAX)).round() as u16
}

fn apply_event(hub: &crate::hub::Hub, event: PlayerEvent, now_playing: &mut NowPlaying) {
    use PlayerEvent::*;

    match event {
        TrackChanged { audio_item } => {
            let (artist, album) = match &audio_item.unique_fields {
                UniqueFields::Track { artists, album, .. } => (
                    Some(
                        artists
                            .iter()
                            .map(|artist| artist.name.as_str())
                            .collect::<Vec<_>>()
                            .join(", "),
                    ),
                    Some(album.clone()),
                ),
                UniqueFields::Local { artists, album, .. } => (artists.clone(), album.clone()),
                UniqueFields::Episode { show_name, .. } => (Some(show_name.clone()), None),
            };
            now_playing.title = Some(audio_item.name);
            now_playing.artist = artist;
            now_playing.album = album;
            now_playing.app = Some("Spotify".into());
            now_playing.duration_ms = Some(f64::from(audio_item.duration_ms));
            now_playing.elapsed_ms = Some(0.0);
            now_playing.artwork = None;
        }
        Playing { position_ms, .. } => {
            now_playing.elapsed_ms = Some(f64::from(position_ms));
            now_playing.playing = Some(true);
        }
        Paused { position_ms, .. } => {
            now_playing.elapsed_ms = Some(f64::from(position_ms));
            now_playing.playing = Some(false);
        }
        PositionChanged { position_ms, .. }
        | PositionCorrection { position_ms, .. }
        | Seeked { position_ms, .. } => {
            now_playing.elapsed_ms = Some(f64::from(position_ms));
        }
        SessionConnected { .. } => {}
        SessionDisconnected { .. } => {
            *now_playing = NowPlaying::default();
            hub.update(|s| {
                if s.media_source == MediaSource::Spotify {
                    s.media_source = if s.dab.active {
                        MediaSource::Dab
                    } else {
                        MediaSource::Phone
                    };
                    s.now_playing = NowPlaying::default();
                }
            });
        }
        Stopped { .. } => now_playing.playing = Some(false),
        _ => {}
    }
    let updated = now_playing.clone();
    hub.update(|s| {
        if s.media_source == MediaSource::Spotify {
            s.now_playing = updated;
        }
    });
}

fn device_id(directory: &Path) -> io::Result<String> {
    let path = directory.join("device-id");
    match std::fs::read_to_string(&path) {
        Ok(id) if !id.trim().is_empty() => return Ok(id.trim().to_owned()),
        Ok(_) => eprintln!("[spotify] stored device id is empty; creating a new one"),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    std::fs::create_dir_all(directory)?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let temporary = directory.join("device-id.tmp");
    std::fs::write(&temporary, &id)?;
    std::fs::rename(temporary, path)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn until(hub: &crate::hub::Hub, test: impl Fn(&livi_core_proto::state::Spotify) -> bool) {
        let mut state = hub.watch();
        tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if test(&state.borrow().spotify) {
                    return;
                }
                state.changed().await.unwrap();
            }
        })
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn login_validates_state_and_can_be_cancelled_logged_out_and_shutdown() {
        let hub = std::sync::Arc::new(crate::hub::tests::hub());
        let dir = crate::config_file::tests::TempDir::new();
        let (send, asks) = channel();
        let (service_hub, path) = (hub.clone(), dir.0.clone());
        let service = tokio::spawn(async move { run(service_hub, &path, asks).await });
        send.send(Ask::Command(SpotifyCommand::Login)).unwrap();
        until(&hub, |s| {
            s.error.as_deref().is_some_and(|s| s.contains("client ID"))
        })
        .await;
        assert!(hub.watch().borrow().spotify.auth_url.is_none());

        hub.update(|s| s.config.spotify_client_id = "0123456789abcdef0123456789abcdef".into());
        until(&hub, |s| s.error.is_none()).await;
        send.send(Ask::Command(SpotifyCommand::Login)).unwrap();
        until(&hub, |s| s.auth_url.is_some()).await;
        let url =
            reqwest::Url::parse(hub.watch().borrow().spotify.auth_url.as_ref().unwrap()).unwrap();
        let params: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(params["redirect_uri"], auth::REDIRECT);
        assert_eq!(params["code_challenge_method"], "S256");
        assert_eq!(params["code_challenge"].len(), 43);
        assert!(!params.contains_key("client_secret"));
        let http = reqwest::Client::new();
        let response = http
            .get(auth::REDIRECT)
            .query(&[("code", "test"), ("state", "wrong")])
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
        assert!(hub.watch().borrow().spotify.connecting);

        let response = http
            .get(auth::REDIRECT)
            .query(&[
                ("error", "access_denied"),
                ("state", params["state"].as_str()),
            ])
            .send()
            .await
            .unwrap();
        assert_eq!(response.status(), reqwest::StatusCode::BAD_REQUEST);
        until(&hub, |s| {
            s.error.as_deref() == Some("Spotify login was declined") && !s.connecting
        })
        .await;
        send.send(Ask::Command(SpotifyCommand::Login)).unwrap();
        until(&hub, |s| s.auth_url.is_some()).await;
        send.send(Ask::Command(SpotifyCommand::Cancel)).unwrap();
        until(&hub, |s| !s.connecting && s.auth_url.is_none()).await;
        assert!(!dir.0.join("spotify/credentials.json").exists());
        send.send(Ask::Command(SpotifyCommand::Login)).unwrap();
        until(&hub, |s| s.auth_url.is_some()).await;
        send.send(Ask::Command(SpotifyCommand::Logout)).unwrap();
        until(&hub, |s| !s.connecting && s.auth_url.is_none()).await;
        send.send(Ask::Command(SpotifyCommand::Login)).unwrap();
        until(&hub, |s| s.auth_url.is_some()).await;
        send.send(Ask::Shutdown).unwrap();
        tokio::time::timeout(Duration::from_secs(2), service)
            .await
            .unwrap()
            .unwrap();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:5589")
            .await
            .unwrap();
        drop(listener);
    }

    #[test]
    fn spotify_metadata_does_not_replace_other_sources() {
        let hub = crate::hub::tests::hub();
        hub.update(|s| {
            s.media_source = MediaSource::Phone;
            s.now_playing.title = Some("Phone".into());
        });
        let mut spotify = NowPlaying {
            title: Some("Spotify".into()),
            ..Default::default()
        };
        apply_event(
            &hub,
            PlayerEvent::Stopped {
                play_request_id: 0,
                track_id: SpotifyUri::from_uri("spotify:track:0123456789ABCDEFGHIJKL").unwrap(),
            },
            &mut spotify,
        );
        assert_eq!(
            hub.watch().borrow().now_playing.title.as_deref(),
            Some("Phone")
        );
        hub.update(|s| s.media_source = MediaSource::Spotify);
        apply_event(
            &hub,
            PlayerEvent::Stopped {
                play_request_id: 0,
                track_id: SpotifyUri::from_uri("spotify:track:0123456789ABCDEFGHIJKL").unwrap(),
            },
            &mut spotify,
        );
        assert_eq!(
            hub.watch().borrow().now_playing.title.as_deref(),
            Some("Spotify")
        );
    }

    #[test]
    fn queue_navigation_handles_edges_without_wrapping() {
        assert_eq!(queue_step(None, 0, true), None);
        assert_eq!(queue_step(None, 2, true), Some(0));
        assert_eq!(queue_step(Some(0), 2, true), Some(1));
        assert_eq!(queue_step(Some(1), 2, true), None);
        assert_eq!(queue_step(Some(0), 2, false), Some(0));
        assert_eq!(queue_step(Some(1), 2, false), Some(0));
    }

    #[test]
    fn configured_volume_is_respected_and_mute_is_applied() {
        let mut config = crate::config_file::defaults();
        config.audio_volume = 0.5;
        assert_eq!(volume(&config), 32768);
        config.disable_audio_output = true;
        assert_eq!(volume(&config), 0);
    }

    #[test]
    fn selected_sink_device_is_escaped() {
        let (element, property) = if cfg!(target_os = "macos") {
            ("osxaudiosink", "unique-id")
        } else {
            ("pulsesink", "device")
        };
        assert_eq!(
            audio_device(Some("speakers\"; fakesink")),
            Some(format!(
                r#"audioconvert dithering=none ! audioresample ! {element} {property}="speakers\"; fakesink""#
            ))
        );
    }
}
