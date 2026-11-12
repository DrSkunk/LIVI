// SPDX-FileCopyrightText: 2026 LIVI contributors
// SPDX-License-Identifier: GPL-3.0-or-later

use std::io::Read;
use std::os::unix::fs::MetadataExt;
use std::sync::Arc;
use std::time::Duration;
use std::{
    fs,
    path::{Path, PathBuf},
};

use livi_core_proto::message::MusicSyncCommand;
use livi_core_proto::state::{MusicSync, MusicSyncPhase};
use livi_music_sync::{Command, Config, Event, IceServer};
use serde::Deserialize;
use tokio::sync::{mpsc, oneshot};
use tokio::task::JoinHandle;

use crate::server::Core;

const DEFAULT_MUSIC_WEB_URL: &str = "https://drskunk.github.io/livi-music/";

fn optional_env(name: &str) -> Result<Option<String>, String> {
    match std::env::var(name) {
        Ok(value) if !value.trim().is_empty() => Ok(Some(value)),
        Ok(_) | Err(std::env::VarError::NotPresent) => Ok(None),
        Err(error) => Err(format!("{name} is invalid: {error}")),
    }
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Settings {
    // Keep reading old configs even though PeerJS Cloud now provides signaling.
    #[serde(rename = "signalUrl")]
    _legacy_signal_url: Option<String>,
    web_url: Option<String>,
    #[serde(default)]
    ice_servers: Vec<IceServer>,
}

fn parse_settings(contents: &str, mode: u32) -> Result<Settings, String> {
    if contents.len() > 16 * 1024 {
        return Err("Music sync configuration is too large".into());
    }
    let settings = serde_json::from_str::<Settings>(contents)
        .map_err(|error| format!("Invalid music sync configuration: {error}"))?;
    if settings
        .ice_servers
        .iter()
        .any(|server| !server.credential.is_empty())
        && mode & 0o077 != 0
    {
        return Err(
            "Music sync configuration containing TURN credentials must have mode 0600".into(),
        );
    }
    Ok(settings)
}

fn configuration(path: &Path) -> Result<(Config, Option<String>), String> {
    let settings = match fs::File::open(path) {
        Ok(file) => {
            let mode = file
                .metadata()
                .map_err(|error| format!("Cannot inspect music sync configuration: {error}"))?
                .mode();
            let mut contents = String::new();
            file.take(16 * 1024 + 1)
                .read_to_string(&mut contents)
                .map_err(|error| format!("Cannot read music sync configuration: {error}"))?;
            parse_settings(&contents, mode)?
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Settings::default(),
        Err(error) => return Err(format!("Cannot read music sync configuration: {error}")),
    };
    let ice_servers: Vec<IceServer> = match optional_env("LIVI_MUSIC_ICE_SERVERS")? {
        Some(value) => serde_json::from_str(&value)
            .map_err(|error| format!("LIVI_MUSIC_ICE_SERVERS is invalid: {error}"))?,
        None => settings.ice_servers,
    };
    let website = optional_env("LIVI_MUSIC_WEB_URL")?
        .or(settings.web_url.filter(|value| !value.trim().is_empty()))
        .unwrap_or_else(|| DEFAULT_MUSIC_WEB_URL.to_string());
    Ok((
        Config {
            ice_servers,
            web_url: website.clone(),
            music_root: crate::local_music::INTERNAL_MUSIC.into(),
        },
        Some(website),
    ))
}

fn failed(core: &Core, error: String) {
    eprintln!("[music-sync] {error}");
    core.hub.update(|state| {
        state.local_music.sync.phase = MusicSyncPhase::Error;
        state.local_music.sync.code = None;
        state.local_music.sync.verification = None;
        state.local_music.sync.error = Some(error);
    });
}

fn refresh(core: &Core) {
    if let Err(error) = core.ask_local_music(crate::local_music::Ask::Rescan) {
        eprintln!("[music-sync] cannot refresh local music: {error}");
        core.hub
            .update(|state| state.local_music.error = Some(error));
    }
}

fn handle_event(core: &Core, event: Event, dirty: &mut bool) {
    match event {
        Event::Pairing { code, website } => core.hub.update(|state| {
            state.local_music.sync.phase = MusicSyncPhase::Pairing;
            state.local_music.sync.code = Some(code);
            state.local_music.sync.website = Some(website);
        }),
        Event::ApprovalRequested { verification } => core.hub.update(|state| {
            state.local_music.sync.phase = MusicSyncPhase::Pending;
            state.local_music.sync.verification = Some(verification);
        }),
        Event::Connected => core.hub.update(|state| {
            state.local_music.sync.phase = MusicSyncPhase::Connected;
            state.local_music.sync.code = None;
        }),
        Event::Saved { path } => {
            *dirty = true;
            core.hub
                .update(|state| state.local_music.sync.last_file = Some(path));
        }
    }
}

pub async fn run(
    core: Arc<Core>,
    config_path: PathBuf,
    mut asks: mpsc::UnboundedReceiver<MusicSyncCommand>,
    mut shutdown: oneshot::Receiver<()>,
) {
    let mut commands: Option<mpsc::UnboundedSender<Command>> = None;
    let mut events: Option<mpsc::UnboundedReceiver<Event>> = None;
    let mut task: Option<JoinHandle<Result<(), String>>> = None;
    let mut dirty = false;
    let mut stopping = false;
    let mut refresh_interval = tokio::time::interval(Duration::from_secs(2));
    refresh_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            Some(command) = asks.recv() => match command {
                MusicSyncCommand::Start if task.is_none() => match configuration(&config_path) {
                    Ok((config, website)) => {
                        let (command_tx, command_rx) = mpsc::unbounded_channel();
                        let (event_tx, event_rx) = mpsc::unbounded_channel();
                        core.hub.update(|state| {
                            state.local_music.sync = MusicSync {
                                phase: MusicSyncPhase::Starting,
                                website,
                                ..MusicSync::default()
                            };
                        });
                        commands = Some(command_tx);
                        events = Some(event_rx);
                        stopping = false;
                        task = Some(tokio::spawn(async move {
                            livi_music_sync::run(config, event_tx, command_rx)
                                .await
                                .map_err(|error| format!("{error:#}"))
                        }));
                    }
                    Err(error) => failed(&core, error),
                },
                MusicSyncCommand::Start => failed(&core, "Wireless sync is already running".into()),
                other => {
                    let action = match other {
                        MusicSyncCommand::Approve => Command::Approve,
                        MusicSyncCommand::Reject => Command::Reject,
                        MusicSyncCommand::Stop => Command::Stop,
                        MusicSyncCommand::Start => unreachable!(),
                    };
                    if matches!(other, MusicSyncCommand::Stop | MusicSyncCommand::Reject) {
                        stopping = true;
                    }
                    if let Some(commands) = &commands {
                        if let Err(error) = commands.send(action) {
                            failed(&core, format!("Cannot control wireless sync: {error}"));
                        }
                    } else if other == MusicSyncCommand::Stop {
                        core.hub.update(|state| state.local_music.sync = MusicSync::default());
                    } else {
                        failed(&core, "No wireless sync session is active".into());
                    }
                }
            },
            event = async { events.as_mut().expect("event receiver exists").recv().await }, if events.is_some() => {
                if let Some(event) = event {
                    handle_event(&core, event, &mut dirty);
                } else {
                    events = None;
                }
            },
            result = async { task.as_mut().expect("worker exists").await }, if task.is_some() => {
                if let Some(events) = &mut events {
                    while let Ok(event) = events.try_recv() {
                        handle_event(&core, event, &mut dirty);
                    }
                }
                if dirty {
                    refresh(&core);
                    dirty = false;
                }
                task = None;
                commands = None;
                events = None;
                match result {
                    Ok(Ok(())) if stopping => core.hub.update(|state| state.local_music.sync = MusicSync::default()),
                    Ok(Ok(())) => failed(&core, "The browser disconnected".into()),
                    Ok(Err(error)) => failed(&core, error),
                    Err(error) => failed(&core, format!("Wireless sync stopped unexpectedly: {error}")),
                }
            },
            _ = refresh_interval.tick(), if dirty => {
                refresh(&core);
                dirty = false;
            },
        }
    }
    if let Some(commands) = commands
        && let Err(error) = commands.send(Command::Stop)
    {
        eprintln!("[music-sync] cannot stop session: {error}");
    }
    if let Some(mut task) = task
        && tokio::time::timeout(Duration::from_secs(5), &mut task)
            .await
            .is_err()
    {
        eprintln!("[music-sync] session did not stop in time");
        task.abort();
    }
    if dirty {
        refresh(&core);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_validate_configuration_and_turn_credential_permissions() {
        let config = r#"{"signalUrl":"wss://music.example/signal","iceServers":[{"urls":["turn:relay.example"],"username":"user","credential":"secret"}]}"#;
        assert!(parse_settings(config, 0o600).is_ok());
        assert!(parse_settings("{}", 0o600).is_ok());
        assert!(
            parse_settings(config, 0o644)
                .err()
                .unwrap()
                .contains("mode 0600")
        );
        assert!(parse_settings(r#"{"signalingUrl":"wss://example.test"}"#, 0o600).is_err());
        assert!(parse_settings(&" ".repeat(16 * 1024 + 1), 0o600).is_err());
    }
}
