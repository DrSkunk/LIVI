// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use livi_core_proto::state::HostPower;
use tokio::process::Command;

use crate::hub::Hub;

const DESKTOP_HELPER: &str = "/usr/local/lib/livi/livi-power.sh";
const OS_HELPER: &str = "/usr/libexec/livi-power-helper";
const OS_STATE: &str = "/run/livi-power/state";
const STATE_POLL: Duration = Duration::from_millis(250);
const STATE_LIMIT: u64 = 4096;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Power {
    Off,
    Reboot,
}

impl Power {
    fn arg(self) -> &'static str {
        match self {
            Power::Off => "poweroff",
            Power::Reboot => "reboot",
        }
    }

    pub fn notice(self) -> HostPower {
        match self {
            Power::Off => HostPower::Poweroff,
            Power::Reboot => HostPower::Reboot,
        }
    }
}

/// What a LIVI OS power state document says: `None` is running, `Err` is unreadable or unknown.
fn parse_state(bytes: &[u8]) -> Result<Option<HostPower>, ()> {
    let doc: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| ())?;
    match doc.get("state").and_then(|s| s.as_str()).ok_or(())? {
        "running" => Ok(None),
        "poweroff" => Ok(Some(HostPower::Poweroff)),
        "reboot" => Ok(Some(HostPower::Reboot)),
        "ignition-off" => {
            let seconds = doc
                .get("seconds_remaining")
                .and_then(|s| s.as_u64())
                .ok_or(())?;
            Ok(Some(HostPower::IgnitionOff {
                seconds_remaining: u32::try_from(seconds).map_err(|_| ())?,
            }))
        }
        _ => Err(()),
    }
}

fn read_state(path: &Path) -> Result<Option<HostPower>, ()> {
    use std::io::Read;
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(()),
    };
    let mut bytes = Vec::new();
    file.take(STATE_LIMIT)
        .read_to_end(&mut bytes)
        .map_err(|_| ())?;
    parse_state(&bytes)
}

/// Mirrors the OS power state file into `system.hostPower`, only when the file changes so a
/// notice set by a local power request is not cleared before the helper publishes it.
async fn follow_state(hub: Arc<Hub>, path: PathBuf, period: Duration) {
    let mut seen = None;
    let mut tick = tokio::time::interval(period);
    tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    loop {
        tick.tick().await;
        let Ok(next) = read_state(&path) else {
            continue;
        };
        if seen == Some(next) {
            continue;
        }
        seen = Some(next);
        hub.update(|s| {
            if s.system.host_power != next {
                s.system.host_power = next;
            }
        });
    }
}

pub fn follow_os_state(hub: Arc<Hub>) {
    if crate::livi_os::active() {
        tokio::spawn(follow_state(hub, PathBuf::from(OS_STATE), STATE_POLL));
    }
}

pub fn owns_host() -> bool {
    crate::livi_os::active() || std::env::var("LIVI_KIOSK").is_ok_and(|v| v == "1")
}

fn helper(livi_os: bool) -> &'static str {
    if livi_os { OS_HELPER } else { DESKTOP_HELPER }
}

fn command(helper: &Path, action: Power) -> Command {
    let mut command = Command::new("/usr/bin/sudo");
    command
        .args(["-n"])
        .arg(helper)
        .arg(action.arg())
        .env_clear()
        .env("PATH", "/usr/sbin:/usr/bin:/sbin:/bin")
        .current_dir("/")
        .stdin(Stdio::null())
        .kill_on_drop(true);
    command
}

async fn request_with(command: &mut Command) -> Result<(), String> {
    let out = tokio::time::timeout(Duration::from_secs(10), command.output())
        .await
        .map_err(|_| "Power helper timed out; host power state is unknown".to_string())?
        .map_err(|e| format!("Could not run power helper: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "Power helper {}: {}",
            out.status,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    Ok(())
}

pub async fn request(action: Power) -> Result<(), String> {
    let helper = Path::new(helper(crate::livi_os::active()));
    if !helper.is_file() {
        return Err(format!(
            "Power helper missing: {}. Install the matching OS image or desktop helper.",
            helper.display()
        ));
    }
    request_with(&mut command(helper, action)).await?;
    println!("[power] host {} accepted", action.arg());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_and_desktop_use_their_own_fixed_helpers() {
        assert_eq!(helper(true), OS_HELPER);
        assert_eq!(helper(false), DESKTOP_HELPER);
        for action in [Power::Off, Power::Reboot] {
            let command = command(Path::new(OS_HELPER), action);
            let command = command.as_std();
            assert_eq!(command.get_program(), "/usr/bin/sudo");
            assert_eq!(
                command.get_args().collect::<Vec<_>>(),
                ["-n", OS_HELPER, action.arg()]
            );
            assert_eq!(
                command.get_envs().collect::<Vec<_>>(),
                [(
                    std::ffi::OsStr::new("PATH"),
                    Some(std::ffi::OsStr::new("/usr/sbin:/usr/bin:/sbin:/bin"))
                )]
            );
        }
    }

    #[test]
    fn os_power_state_documents_parse_and_unknown_ones_are_ignored() {
        assert_eq!(parse_state(br#"{"state":"running"}"#), Ok(None));
        assert_eq!(
            parse_state(br#"{"state":"poweroff","extra":1}"#),
            Ok(Some(HostPower::Poweroff))
        );
        assert_eq!(
            parse_state(br#"{"state":"reboot"}"#),
            Ok(Some(HostPower::Reboot))
        );
        assert_eq!(
            parse_state(br#"{"state":"ignition-off","seconds_remaining":7}"#),
            Ok(Some(HostPower::IgnitionOff {
                seconds_remaining: 7
            }))
        );
        for bad in [
            &b"{\"state\":\"ignition-off\"}"[..],
            b"{\"state\":\"ignition-off\",\"seconds_remaining\":-1}",
            b"{\"state\":\"suspend\"}",
            b"{}",
            b"not json",
        ] {
            assert_eq!(parse_state(bad), Err(()));
        }
    }

    async fn wait_for(hub: &Hub, want: Option<HostPower>) {
        tokio::time::timeout(
            Duration::from_secs(2),
            hub.watch().wait_for(|s| s.system.host_power == want),
        )
        .await
        .unwrap()
        .unwrap();
    }

    #[tokio::test]
    async fn followed_state_file_drives_host_power_without_clobbering_local_requests() {
        let dir = crate::files::config_file::tests::TempDir::new();
        let path = dir.0.join("state");
        let hub = Arc::new(Hub::new(livi_core_proto::state::State::default()));
        let task = tokio::spawn(follow_state(
            hub.clone(),
            path.clone(),
            Duration::from_millis(5),
        ));
        tokio::time::sleep(Duration::from_millis(30)).await;
        hub.update(|s| s.system.host_power = Some(HostPower::Reboot));
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(
            hub.watch().borrow().system.host_power,
            Some(HostPower::Reboot)
        );
        std::fs::write(&path, br#"{"state":"ignition-off","seconds_remaining":3}"#).unwrap();
        let counting = Some(HostPower::IgnitionOff {
            seconds_remaining: 3,
        });
        wait_for(&hub, counting).await;
        std::fs::write(&path, br#"{"state":"unknown"}"#).unwrap();
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert_eq!(hub.watch().borrow().system.host_power, counting);
        std::fs::write(&path, br#"{"state":"running"}"#).unwrap();
        wait_for(&hub, None).await;
        task.abort();
    }

    #[tokio::test]
    async fn permission_failure_is_not_reported_as_success() {
        let mut denied = Command::new("/bin/sh");
        denied.args(["-c", "echo 'sudo: permission denied' >&2; exit 1"]);
        let error = request_with(&mut denied).await.unwrap_err();
        assert!(error.contains("permission denied"));
        let mut accepted = Command::new("/bin/sh");
        accepted.args(["-c", "exit 0"]);
        request_with(&mut accepted).await.unwrap();
    }
}
