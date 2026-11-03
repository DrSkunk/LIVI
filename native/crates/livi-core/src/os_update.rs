// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use livi_core_proto::message::OsUpdateCommand;
use livi_core_proto::state::{OsRelease, OsStatus, OsUpdate, OsUpdatePhase, UpdatePhase};
use serde::Deserialize;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::server::Core;

const HELPER: &str = "/usr/libexec/livi-os-update-helper";
const OUTPUT_LIMIT: u64 = 65536;

pub fn allowed(state: &OsUpdate, command: OsUpdateCommand) -> Result<(), String> {
    if !state.enabled {
        return Err("OS updates are only available on LIVI OS".into());
    }
    if state.phase != OsUpdatePhase::Idle {
        return Err("An OS update operation is already running".into());
    }
    let status = state.status.as_ref();
    let can_stage = status.is_some_and(|s| s.update_key && !s.pending && !s.trial);
    let can_reboot = status.is_some_and(|s| s.pending && !s.trial && s.staged.is_some());
    match command {
        OsUpdateCommand::Stage
            if !can_stage
                || !state
                    .release
                    .as_ref()
                    .is_some_and(|r| r.update && r.channel == state.channel) =>
        {
            Err("Check for an eligible signed OS update before staging".into())
        }
        OsUpdateCommand::RequestReboot if !can_reboot => {
            Err("No staged OS update is ready to reboot".into())
        }
        OsUpdateCommand::ConfirmReboot if !can_reboot || !state.confirm_reboot => {
            Err("OS reboot requires explicit confirmation".into())
        }
        _ => Ok(()),
    }
}

#[derive(Deserialize)]
struct Progress {
    phase: OsUpdatePhase,
    message: String,
    received: u64,
    total: u64,
}

impl Progress {
    fn apply(self, state: &mut OsUpdate) -> Result<(), String> {
        if !matches!(
            self.phase,
            OsUpdatePhase::Downloading | OsUpdatePhase::Staging
        ) || self.received > self.total
        {
            return Err("Invalid OS updater progress".into());
        }
        state.phase = self.phase;
        state.message = self.message;
        state.received = self.received;
        state.total = self.total;
        Ok(())
    }
}

struct Client {
    helper: PathBuf,
    sudo: bool,
}

impl Client {
    fn command(&self, args: &[&str]) -> Command {
        let mut command = if self.sudo {
            let mut command = Command::new("/usr/bin/sudo");
            command.arg("-n").arg(&self.helper);
            command
        } else {
            Command::new(&self.helper)
        };
        command
            .args(args)
            .env_clear()
            .env("PATH", "/usr/sbin:/usr/bin:/sbin:/bin")
            .current_dir("/")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        command
    }

    async fn invoke(
        &self,
        args: &[&str],
        mut progress: impl FnMut(Progress) -> Result<(), String>,
    ) -> Result<Vec<u8>, String> {
        let mut child = self
            .command(args)
            .spawn()
            .map_err(|e| format!("OS helper: {e}"))?;
        let stdout = child.stdout.take().ok_or("OS helper stdout missing")?;
        let stderr = child.stderr.take().ok_or("OS helper stderr missing")?;
        let stream = args.first() == Some(&"stage");
        let out = async {
            let mut lines = BufReader::new(stdout.take(OUTPUT_LIMIT + 1)).lines();
            let mut output = Vec::new();
            let mut count = 0;
            while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
                count += line.len() + 1;
                if count as u64 > OUTPUT_LIMIT {
                    return Err("OS helper output too large".to_string());
                }
                if stream {
                    progress(
                        serde_json::from_str(&line).map_err(|e| format!("OS progress: {e}"))?,
                    )?;
                } else {
                    output.extend_from_slice(line.as_bytes());
                    output.push(b'\n');
                }
            }
            Ok(output)
        };
        let err = async {
            let mut output = Vec::new();
            stderr
                .take(OUTPUT_LIMIT + 1)
                .read_to_end(&mut output)
                .await
                .map_err(|e| e.to_string())?;
            if output.len() as u64 > OUTPUT_LIMIT {
                return Err("OS helper error output too large".to_string());
            }
            Ok(output)
        };
        let (output, errors, status) = tokio::try_join!(out, err, async {
            child.wait().await.map_err(|e| e.to_string())
        })?;
        if !status.success() {
            return Err(format!(
                "OS helper {status}: {}",
                String::from_utf8_lossy(&errors).trim()
            ));
        }
        Ok(output)
    }

    async fn status(&self) -> Result<OsStatus, String> {
        let bytes = tokio::time::timeout(
            Duration::from_secs(10),
            self.invoke(&["status"], |_| Ok(())),
        )
        .await
        .map_err(|_| "OS status timed out".to_string())??;
        serde_json::from_slice(&bytes).map_err(|e| format!("OS status: {e}"))
    }
}

fn publish(core: &Core, state: &OsUpdate) {
    core.hub.update(|s| s.system.os_update = state.clone());
}

async fn refresh(client: &Client, state: &mut OsUpdate) -> Result<(), String> {
    let status = match client.status().await {
        Ok(status) => status,
        Err(e) => {
            state.status = None;
            state.confirm_reboot = false;
            return Err(e);
        }
    };
    if state.status.as_ref() != Some(&status) {
        state.confirm_reboot = false;
    }
    if state
        .release
        .as_ref()
        .is_some_and(|r| r.installed != status.version)
    {
        state.release = None;
    }
    state.status = Some(status);
    Ok(())
}

async fn execute(
    client: &Client,
    state: &mut OsUpdate,
    command: OsUpdateCommand,
    mut changed: impl FnMut(&OsUpdate),
) -> Result<(), String> {
    allowed(state, command)?;
    state.error = None;
    state.message.clear();
    match command {
        OsUpdateCommand::Status => refresh(client, state).await?,
        OsUpdateCommand::Check { channel } => {
            state.confirm_reboot = false;
            state.channel = channel;
            state.release = None;
            state.phase = OsUpdatePhase::Checking;
            changed(state);
            refresh(client, state).await?;
            let bytes = tokio::time::timeout(
                Duration::from_secs(120),
                client.invoke(&["check", channel.as_str()], |_| Ok(())),
            )
            .await
            .map_err(|_| "OS release check timed out".to_string())??;
            let release: OsRelease =
                serde_json::from_slice(&bytes).map_err(|e| format!("OS release: {e}"))?;
            if release.channel != channel {
                return Err("OS helper returned a different release channel".into());
            }
            state.release = Some(release);
        }
        OsUpdateCommand::Stage => {
            state.confirm_reboot = false;
            state.phase = OsUpdatePhase::Checking;
            changed(state);
            refresh(client, state).await?;
            state.phase = OsUpdatePhase::Idle;
            allowed(state, command)?;
            state.received = 0;
            state.total = 0;
            state.phase = OsUpdatePhase::Downloading;
            state.message = "Fetching signed OS manifest".into();
            changed(state);
            let result = client
                .invoke(&["stage", state.channel.as_str()], |progress| {
                    progress.apply(state)?;
                    changed(state);
                    Ok(())
                })
                .await;
            let status_result = refresh(client, state).await;
            result?;
            status_result?;
            if !state
                .status
                .as_ref()
                .is_some_and(|s| s.pending && s.staged.is_some())
            {
                state.release = None;
                return Err("OS updater finished without a staged image; check again".into());
            }
            state.message = "Signed OS update staged. Reboot when ready.".into();
        }
        OsUpdateCommand::RequestReboot => {
            refresh(client, state).await?;
            allowed(state, command)?;
            state.confirm_reboot = true;
        }
        OsUpdateCommand::CancelReboot => state.confirm_reboot = false,
        OsUpdateCommand::ConfirmReboot => {
            let expected = state.status.clone();
            state.confirm_reboot = false;
            state.phase = OsUpdatePhase::Rebooting;
            changed(state);
            refresh(client, state).await?;
            if state.status != expected {
                return Err("Staged OS update changed; review and confirm again".into());
            }
            // The helper's apply command retains the slot manager's tryboot checks.
            client.invoke(&["apply"], |_| Ok(())).await?;
        }
    }
    Ok(())
}

pub async fn run(core: Arc<Core>, mut asks: mpsc::Receiver<OsUpdateCommand>) {
    let mut state = OsUpdate {
        enabled: crate::livi_os::active(),
        ..Default::default()
    };
    publish(&core, &state);
    if !state.enabled {
        return;
    }
    let client = Client {
        helper: HELPER.into(),
        sudo: true,
    };
    let mut poll = tokio::time::interval(Duration::from_secs(10));
    loop {
        let command = tokio::select! {
            ask = asks.recv() => match ask { Some(ask) => ask, None => return },
            _ = poll.tick() => {
                if let Err(e) = refresh(&client, &mut state).await {
                    eprintln!("[os-update] {e}");
                    state.error = Some(e);
                }
                publish(&core, &state);
                continue;
            },
        };
        let current = core.hub.watch().borrow().clone();
        let app_phase = current.update.phase;
        let result = if current.system.power_busy {
            Err("A host power request is in progress".into())
        } else if matches!(
            command,
            OsUpdateCommand::Stage
                | OsUpdateCommand::RequestReboot
                | OsUpdateCommand::ConfirmReboot
        ) && !matches!(app_phase, UpdatePhase::Idle | UpdatePhase::Error)
        {
            Err("Finish or abort the application update first".into())
        } else {
            execute(&client, &mut state, command, |s| publish(&core, s)).await
        };
        if let Err(e) = result {
            eprintln!("[os-update] {e}");
            state.error = Some(e);
        }
        if state.phase != OsUpdatePhase::Rebooting || state.error.is_some() {
            state.phase = OsUpdatePhase::Idle;
        }
        publish(&core, &state);
        if state.phase == OsUpdatePhase::Rebooting {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use livi_core_proto::state::{OsChannel, OsStaged};

    use super::*;
    use crate::config_file::tests::TempDir;

    fn status(pending: bool) -> OsStatus {
        OsStatus {
            board: "rpi5".into(),
            version: "v1".into(),
            serial: 1,
            slot: "root-a".into(),
            trial: false,
            pending,
            update_key: true,
            staged: pending.then(|| OsStaged {
                version: "v2".into(),
                serial: 2,
            }),
        }
    }

    fn ready() -> OsUpdate {
        OsUpdate {
            enabled: true,
            status: Some(status(false)),
            release: Some(OsRelease {
                channel: OsChannel::Stable,
                installed: "v1".into(),
                available: "v2".into(),
                update: true,
            }),
            ..Default::default()
        }
    }

    fn client(dir: &TempDir, stage: &str) -> Client {
        for (file, value) in [
            ("status.json", status(false)),
            ("pending.json", status(true)),
        ] {
            std::fs::write(dir.0.join(file), serde_json::to_vec(&value).unwrap()).unwrap();
        }
        std::fs::write(
            dir.0.join("release.json"),
            serde_json::to_vec(&ready().release.unwrap()).unwrap(),
        )
        .unwrap();
        let helper = dir.0.join("helper");
        std::fs::write(&helper, format!(
                    "#!/bin/sh\nbase=\"$(dirname \"$0\")\"\nprintf '%s\\n' \"$*\" >> \"$base/calls\"\ncase \"$1\" in\n\
                     status) cat \"$base/status.json\";;\ncheck) cat \"$base/release.json\";;\n\
                     stage) {stage};;\napply) exit 0;;\nesac\n"
                )).unwrap();
        std::fs::set_permissions(&helper, std::fs::Permissions::from_mode(0o755)).unwrap();
        Client {
            helper,
            sudo: false,
        }
    }

    #[test]
    fn only_fixed_helper_receives_sudo_and_no_caller_environment() {
        let client = Client {
            helper: HELPER.into(),
            sudo: true,
        };
        let command = client.command(&["stage", "nightly"]);
        let command = command.as_std();
        assert_eq!(command.get_program(), "/usr/bin/sudo");
        assert_eq!(
            command.get_args().collect::<Vec<_>>(),
            ["-n", HELPER, "stage", "nightly"]
        );
        assert_eq!(
            command.get_envs().collect::<Vec<_>>(),
            [(
                std::ffi::OsStr::new("PATH"),
                Some(std::ffi::OsStr::new("/usr/sbin:/usr/bin:/sbin:/bin"))
            )]
        );
    }

    #[test]
    fn stage_requires_verified_check_key_idle_slots_and_matching_channel() {
        let mut state = ready();
        assert!(allowed(&state, OsUpdateCommand::Stage).is_ok());
        state.channel = OsChannel::Nightly;
        assert!(allowed(&state, OsUpdateCommand::Stage).is_err());
        state = ready();
        for change in [
            |s: &mut OsUpdate| s.status.as_mut().unwrap().update_key = false,
            |s: &mut OsUpdate| s.status.as_mut().unwrap().trial = true,
            |s: &mut OsUpdate| s.status.as_mut().unwrap().pending = true,
            |s: &mut OsUpdate| s.phase = OsUpdatePhase::Staging,
            |s: &mut OsUpdate| s.enabled = false,
            |s: &mut OsUpdate| s.release = None,
        ] {
            change(&mut state);
            assert!(allowed(&state, OsUpdateCommand::Stage).is_err());
            state = ready();
        }
        assert!(allowed(&state, OsUpdateCommand::ConfirmReboot).is_err());
    }

    #[tokio::test]
    async fn stage_streams_progress_but_only_confirmation_applies_the_trial() {
        let dir = TempDir::new();
        let client = client(
            &dir,
            "printf '%s\\n' '{\"phase\":\"downloading\",\"message\":\"root\",\"received\":1,\"total\":2}' \
                    '{\"phase\":\"staging\",\"message\":\"verify\",\"received\":0,\"total\":0}'; \
                    cp \"$base/pending.json\" \"$base/status.json\"",
        );
        let mut state = ready();
        let mut phases = Vec::new();
        execute(&client, &mut state, OsUpdateCommand::Stage, |s| {
            phases.push(s.phase)
        })
        .await
        .unwrap();
        assert!(phases.contains(&OsUpdatePhase::Downloading));
        assert!(phases.contains(&OsUpdatePhase::Staging));
        assert!(state.status.as_ref().unwrap().pending);
        assert!(!state.confirm_reboot);
        assert!(
            !std::fs::read_to_string(dir.0.join("calls"))
                .unwrap()
                .contains("apply")
        );
        state.phase = OsUpdatePhase::Idle;
        assert!(
            execute(&client, &mut state, OsUpdateCommand::ConfirmReboot, |_| {})
                .await
                .is_err()
        );
        execute(&client, &mut state, OsUpdateCommand::RequestReboot, |_| {})
            .await
            .unwrap();
        execute(&client, &mut state, OsUpdateCommand::CancelReboot, |_| {})
            .await
            .unwrap();
        assert!(!state.confirm_reboot);
        execute(&client, &mut state, OsUpdateCommand::RequestReboot, |_| {})
            .await
            .unwrap();
        execute(&client, &mut state, OsUpdateCommand::ConfirmReboot, |_| {})
            .await
            .unwrap();
        assert_eq!(state.phase, OsUpdatePhase::Rebooting);
        assert!(
            std::fs::read_to_string(dir.0.join("calls"))
                .unwrap()
                .ends_with("status\napply\n")
        );
    }

    #[tokio::test]
    async fn changed_staging_invalidates_reboot_confirmation() {
        let dir = TempDir::new();
        let client = client(&dir, "exit 1");
        let mut state = ready();
        std::fs::copy(dir.0.join("pending.json"), dir.0.join("status.json")).unwrap();
        execute(&client, &mut state, OsUpdateCommand::RequestReboot, |_| {})
            .await
            .unwrap_err();
        state.status = Some(status(true));
        execute(&client, &mut state, OsUpdateCommand::RequestReboot, |_| {})
            .await
            .unwrap();
        std::fs::write(
            dir.0.join("status.json"),
            serde_json::to_vec(&status(false)).unwrap(),
        )
        .unwrap();
        let error = execute(&client, &mut state, OsUpdateCommand::ConfirmReboot, |_| {})
            .await
            .unwrap_err();
        assert!(error.contains("changed"));
        assert!(!state.confirm_reboot);
        assert!(
            !std::fs::read_to_string(dir.0.join("calls"))
                .unwrap()
                .contains("apply")
        );
    }

    #[tokio::test]
    async fn failed_check_clears_stale_release_and_reports_signature_error() {
        let dir = TempDir::new();
        let client = client(&dir, "echo 'manifest signature is not valid' >&2; exit 1");
        let mut state = ready();
        let error = execute(&client, &mut state, OsUpdateCommand::Stage, |_| {})
            .await
            .unwrap_err();
        assert!(error.contains("signature is not valid"));
        assert!(!state.status.unwrap().pending);
        state = ready();
        std::fs::write(dir.0.join("release.json"), b"not JSON").unwrap();
        assert!(
            execute(
                &client,
                &mut state,
                OsUpdateCommand::Check {
                    channel: OsChannel::Nightly
                },
                |_| {}
            )
            .await
            .is_err()
        );
        assert_eq!(state.channel, OsChannel::Nightly);
        assert!(state.release.is_none());
    }

    #[tokio::test]
    async fn malformed_progress_or_success_without_pending_is_not_success() {
        for stage in ["echo invalid", "true"] {
            let dir = TempDir::new();
            let client = client(&dir, stage);
            assert!(
                execute(&client, &mut ready(), OsUpdateCommand::Stage, |_| {})
                    .await
                    .is_err()
            );
        }
    }

    #[test]
    fn progress_rejects_impossible_values_and_privileged_phase_changes() {
        for (phase, received, total) in [
            (OsUpdatePhase::Downloading, 3, 2),
            (OsUpdatePhase::Rebooting, 0, 0),
        ] {
            assert!(
                Progress {
                    phase,
                    received,
                    total,
                    message: String::new()
                }
                .apply(&mut ready())
                .is_err()
            );
        }
    }
}
