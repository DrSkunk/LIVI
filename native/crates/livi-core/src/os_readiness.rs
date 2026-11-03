// SPDX-FileCopyrightText: 2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

//! API-2 reports are derived from owned children and the compositor's completed DRM flips.

use std::fs::{self, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

use livi_host_proto::readiness::PresentedOutput;
use livi_media::compositor::CompositorControl;
use tokio::sync::{oneshot, watch};

const LIMIT: usize = 16 * 1024;
const PERIOD: Duration = Duration::from_millis(500);
const MAX_EVIDENCE_AGE: Duration = Duration::from_millis(1500);

pub struct Reporter {
    stop: oneshot::Sender<()>,
    task: tokio::task::JoinHandle<()>,
}

impl Reporter {
    pub fn start(
        ctrl: CompositorControl,
        compositor: Option<u32>,
        ui: Option<watch::Receiver<Option<u32>>>,
    ) -> Option<Self> {
        if !crate::livi_os::active() || std::env::var("LIVI_OS_API").as_deref() != Ok("2") {
            return None;
        }
        let path = PathBuf::from(std::env::var_os("LIVI_OS_READY_FILE")?);
        let _ = fs::remove_file(&path);
        let session = match session() {
            Ok(session) => session,
            Err(e) => {
                eprintln!("[livi-os] readiness disabled: {e}");
                return None;
            }
        };
        let (stop, mut stopped) = oneshot::channel();
        let task = tokio::spawn(async move {
            let evidence = ctrl.health();
            let mut tick = tokio::time::interval(PERIOD);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                tokio::select! {
                    _ = &mut stopped => break,
                    _ = tick.tick() => {}
                }
                ctrl.poll_health();
                let report = evidence.borrow().clone().and_then(|(at, report)| {
                    let ui_pid = ui.as_ref().and_then(|ui| *ui.borrow())?;
                    eligible(at.elapsed(), &report, compositor, Some(ui_pid), live)
                        .then_some(report)
                });
                let result = match report {
                    Some(report) => monotonic().and_then(|now| {
                        let bytes = serde_json::to_vec(&document(&session, now, report))?;
                        atomic_report(&path, &bytes)
                    }),
                    None => {
                        let _ = fs::remove_file(&path);
                        continue;
                    }
                };
                if let Err(e) = result {
                    let _ = fs::remove_file(&path);
                    eprintln!("[livi-os] readiness: {e}");
                }
            }
            let _ = fs::remove_file(&path);
        });
        Some(Self { stop, task })
    }

    pub async fn stop(self) {
        let _ = self.stop.send(());
        let _ = self.task.await;
    }
}

fn eligible(
    age: Duration,
    report: &PresentedOutput,
    compositor: Option<u32>,
    ui: Option<u32>,
    live: impl Fn(u32) -> bool,
) -> bool {
    age <= MAX_EVIDENCE_AGE
        && compositor == Some(report.compositor)
        && ui == Some(report.ui)
        && [std::process::id(), report.ui, report.compositor]
            .into_iter()
            .all(live)
}

fn document(session: &str, now: f64, report: PresentedOutput) -> serde_json::Value {
    serde_json::json!({
        "api": 2, "session": session, "monotonic": now,
        "core": std::process::id(), "ui": report.ui,
        "compositor": report.compositor, "framePresented": true,
        "output": {
            "connector": report.connector, "width": report.width,
            "height": report.height, "transform": report.transform,
            "scale": report.scale
        }
    })
}

fn session() -> io::Result<String> {
    let path = std::env::var_os("LIVI_OS_SESSION_FILE")
        .ok_or_else(|| io::Error::other("LIVI_OS_SESSION_FILE missing"))?;
    let mut value = String::new();
    fs::File::open(path)?
        .take(1025)
        .read_to_string(&mut value)?;
    if value.len() > 1024 || value.trim().is_empty() {
        return Err(io::Error::other("invalid OS session"));
    }
    Ok(value.trim().to_string())
}

fn monotonic() -> io::Result<f64> {
    let mut time = std::mem::MaybeUninit::<libc::timespec>::uninit();
    // SAFETY: clock_gettime initializes a valid timespec on success.
    if unsafe { libc::clock_gettime(libc::CLOCK_MONOTONIC, time.as_mut_ptr()) } != 0 {
        return Err(io::Error::last_os_error());
    }
    // SAFETY: the successful call above initialized time.
    let time = unsafe { time.assume_init() };
    Ok(time.tv_sec as f64 + time.tv_nsec as f64 / 1_000_000_000.0)
}

fn running_stat(stat: &str) -> bool {
    stat.rsplit_once(')')
        .and_then(|(_, tail)| tail.split_whitespace().next())
        .is_some_and(|state| matches!(state, "R" | "S" | "D" | "I"))
}

fn live(pid: u32) -> bool {
    fs::read_to_string(format!("/proc/{pid}/stat")).is_ok_and(|stat| running_stat(&stat))
}

fn atomic_report(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if bytes.len() > LIMIT {
        return Err(io::Error::other("readiness exceeds 16 KiB"));
    }
    let staging = path.with_extension(format!("{}.new", std::process::id()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&staging)?;
        file.write_all(bytes)?;
        drop(file);
        fs::rename(&staging, path)
    })();
    let _ = fs::remove_file(staging);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn presented() -> PresentedOutput {
        PresentedOutput::parse("presented 12 13 HDMI-A-1 400 1280 90 1").unwrap()
    }

    #[test]
    fn evidence_must_be_fresh_and_match_both_live_owned_children() {
        let report = presented();
        let valid =
            |age, compositor, ui, dead| eligible(age, &report, compositor, ui, |pid| pid != dead);
        assert!(valid(Duration::ZERO, Some(12), Some(13), 0));
        assert!(!valid(Duration::from_secs(2), Some(12), Some(13), 0));
        assert!(!valid(Duration::ZERO, None, Some(13), 0));
        assert!(!valid(Duration::ZERO, Some(12), None, 0));
        assert!(!valid(Duration::ZERO, Some(22), Some(13), 0));
        assert!(!valid(Duration::ZERO, Some(12), Some(23), 0));
        for dead in [12, 13, std::process::id()] {
            assert!(!valid(Duration::ZERO, Some(12), Some(13), dead));
        }
    }

    #[test]
    fn api2_document_reports_actual_physical_output_and_processes() {
        let value = document("this-boot", 1234.5, presented());
        assert_eq!(value["api"], 2);
        assert_eq!(value["session"], "this-boot");
        assert_eq!(value["monotonic"], 1234.5);
        assert_eq!(value["core"], std::process::id());
        assert_eq!(value["ui"], 13);
        assert_eq!(value["compositor"], 12);
        assert_eq!(value["framePresented"], true);
        assert_eq!(
            value["output"],
            serde_json::json!({
                "connector": "HDMI-A-1", "width": 400, "height": 1280,
                "transform": "90", "scale": 1
            })
        );
    }

    #[test]
    fn reports_atomically_replace_the_previous_document() {
        let path = PathBuf::from(format!(".ready-test-{}.json", std::process::id()));
        let bytes = serde_json::to_vec(&document("boot", 1234.5, presented())).unwrap();
        atomic_report(&path, b"old").unwrap();
        atomic_report(&path, &bytes).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn zombie_stopped_and_invalid_processes_are_not_live() {
        assert!(running_stat("1 (livi ui) S 0 0"));
        for stat in ["1 (livi) Z 0", "1 (livi) X 0", "1 (livi) T 0", "malformed"] {
            assert!(!running_stat(stat));
        }
    }

    #[test]
    fn timestamp_is_the_system_monotonic_clock() {
        let before = monotonic().unwrap();
        let after = monotonic().unwrap();
        assert!(before > 0.0 && after >= before && after - before < 1.0);
    }

    #[test]
    fn oversized_reports_never_create_files() {
        assert!(
            atomic_report(Path::new("must-not-exist-ready.json"), &vec![0; LIMIT + 1]).is_err()
        );
        assert!(!Path::new("must-not-exist-ready.json").exists());
    }
}
