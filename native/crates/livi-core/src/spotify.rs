// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::io;
use std::path::Path;
use std::time::Duration;

use futures_util::{StreamExt, future::pending};
use librespot_connect::{ConnectConfig, Spirc};
use librespot_core::{Session, config::SessionConfig};
use librespot_discovery::{DeviceType, Discovery};
use librespot_metadata::audio::UniqueFields;
use librespot_playback::{
    audio_backend,
    config::{AudioFormat, PlayerConfig},
    mixer::{self, MixerConfig},
    player::{Player, PlayerEvent},
};
use livi_core_proto::message::MediaControl;
use livi_core_proto::state::{MediaSource, NowPlaying, State};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

#[derive(Debug)]
pub enum Ask {
    Control(MediaControl),
    Seek(u32),
    Shutdown,
}

pub type Asks = mpsc::UnboundedReceiver<Ask>;
pub type Sender = mpsc::UnboundedSender<Ask>;

pub fn channel() -> (Sender, Asks) {
    mpsc::unbounded_channel()
}

pub async fn run(hub: std::sync::Arc<crate::hub::Hub>, user_data: &Path, mut asks: Asks) {
    let mut session_config = SessionConfig::default();
    let device_id = match device_id(user_data) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("[spotify] cannot load device id: {e}");
            return;
        }
    };
    session_config.device_id = device_id.clone();
    let mut discovery = match Discovery::builder(device_id, session_config.client_id.clone())
        .name("LIVI")
        .device_type(DeviceType::Automobile)
        .launch()
    {
        Ok(discovery) => discovery,
        Err(e) => {
            eprintln!("[spotify] Connect discovery could not start: {e}");
            return;
        }
    };
    println!("[spotify] Connect receiver is discoverable as LIVI");

    let mut state: watch::Receiver<State> = hub.watch();
    let mut spirc: Option<Spirc> = None;
    let mut spirc_task: Option<JoinHandle<()>> = None;
    let mut player_events: Option<librespot_playback::player::PlayerEventChannel> = None;
    let mut spotify_now_playing = NowPlaying::default();

    loop {
        tokio::select! {
            credentials = discovery.next() => {
                let Some(credentials) = credentials else {
                    eprintln!("[spotify] Connect discovery stopped");
                    break;
                };
                if let Some(active) = &spirc {
                    let _ = active.shutdown();
                }
                if let Some(task) = spirc_task.take() {
                    let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
                }
                spirc = None;
                player_events = None;
                let config = state.borrow().config.clone();
                match start_player(&session_config, credentials, &config).await {
                    Ok((handle, task, events)) => {
                        spirc = Some(handle);
                        spirc_task = Some(tokio::spawn(task));
                        player_events = Some(events);
                    }
                    Err(e) => {
                        eprintln!("[spotify] cannot connect player: {e}");
                    }
                }
            }
            ask = asks.recv() => {
                match ask {
                    Some(Ask::Control(control)) => {
                        let Some(player) = &spirc else {
                            eprintln!("[spotify] media control ignored; Connect is not active");
                            continue;
                        };
                        let result = match control {
                            MediaControl::PlayPause => player.play_pause(),
                            MediaControl::Play => player.play(),
                            MediaControl::Pause => player.pause(),
                            MediaControl::Next => player.next(),
                            MediaControl::Prev => player.prev(),
                        };
                        if let Err(e) = result {
                            eprintln!("[spotify] media control failed: {e}");
                        }
                    }
                    Some(Ask::Seek(position_ms)) => {
                        if let Some(player) = &spirc
                            && let Err(e) = player.set_position_ms(position_ms)
                        {
                            eprintln!("[spotify] seek failed: {e}");
                        }
                    }
                    Some(Ask::Shutdown) | None => break,
                }
            }
            event = async {
                match player_events.as_mut() {
                    Some(events) => events.recv().await,
                    None => pending().await,
                }
            } => {
                if let Some(event) = event {
                    apply_event(&hub, event, &mut spotify_now_playing);
                } else {
                    player_events = None;
                }
            }
            _ = async {
                match spirc_task.as_mut() {
                    Some(task) => {
                        let _ = task.await;
                    }
                    None => pending().await,
                }
            } => {
                spirc = None;
                spirc_task = None;
                player_events = None;
                spotify_now_playing = NowPlaying::default();
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
            changed = state.changed() => {
                if changed.is_err() {
                    break;
                }
                let snapshot = state.borrow_and_update().clone();
                let config = snapshot.config.clone();
                if let Some(player) = &spirc
                    && let Err(e) = player.set_volume(volume(&config))
                {
                    eprintln!("[spotify] volume update failed: {e}");
                }
                if snapshot.media_source == MediaSource::Spotify {
                    let now_playing = spotify_now_playing.clone();
                    hub.update(|s| {
                        if s.media_source == MediaSource::Spotify {
                            s.now_playing = now_playing;
                        }
                    });
                }
            }
        }
    }

    if let Some(active) = &spirc {
        let _ = active.shutdown();
    }
    if let Some(task) = spirc_task {
        let _ = tokio::time::timeout(Duration::from_secs(2), task).await;
    }
    discovery.shutdown().await;
}

async fn start_player(
    session_config: &SessionConfig,
    credentials: librespot_discovery::Credentials,
    config: &livi_core_proto::config::Config,
) -> Result<
    (
        Spirc,
        impl std::future::Future<Output = ()> + Send + 'static,
        librespot_playback::player::PlayerEventChannel,
    ),
    String,
> {
    let session = Session::new(session_config.clone(), None);
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
        session.clone(),
        mixer.get_soft_volume(),
        move || backend(device, format),
    );
    let events = player.get_player_event_channel();
    let connect = ConnectConfig {
        name: "LIVI".into(),
        device_type: DeviceType::Automobile,
        initial_volume: volume(config),
        ..ConnectConfig::default()
    };
    let (spirc, task) = Spirc::new(connect, session, credentials, player, mixer)
        .await
        .map_err(|e| e.to_string())?;
    Ok((spirc, task, events))
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

    let connected = matches!(&event, SessionConnected { .. });
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
        if connected {
            s.media_source = MediaSource::Spotify;
        }
        if s.media_source == MediaSource::Spotify {
            s.now_playing = updated;
        }
    });
}

fn device_id(user_data: &Path) -> io::Result<String> {
    let directory = user_data.join("spotify");
    let path = directory.join("device-id");
    match std::fs::read_to_string(&path) {
        Ok(id) if !id.trim().is_empty() => return Ok(id.trim().to_owned()),
        Ok(_) => eprintln!("[spotify] stored device id is empty; creating a new one"),
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(e),
    }
    std::fs::create_dir_all(&directory)?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let temporary = directory.join("device-id.tmp");
    std::fs::write(&temporary, &id)?;
    std::fs::rename(temporary, path)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

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
