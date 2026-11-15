// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

const DESKTOP_HELPER: &str = "/usr/local/lib/livi/livi-power.sh";
const OS_HELPER: &str = "/usr/libexec/livi-power-helper";

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
