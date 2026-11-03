// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

//! Supervises the immutable, read-only Service 01 worker, not arbitrary CAN traffic.

use std::process::Stdio;
use std::time::Duration;

use livi_core_proto::config::Obd2Bitrate;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, watch};

const HELPER: &str = "/usr/libexec/livi-obd2";
const KEYS: [&str; 12] = [
    "rpm",
    "speedKph",
    "coolantC",
    "iatC",
    "mapKpa",
    "throttlePct",
    "timingAdvanceDeg",
    "batteryV",
    "engineRunTimeS",
    "fuelPct",
    "oilC",
    "ethanolPct",
];

fn command(bitrate: Obd2Bitrate) -> Command {
    let mut cmd = Command::new("sudo");
    cmd.args(["-n", HELPER, &(bitrate as u32).to_string()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    cmd
}

fn clear(status: &str, error: Option<&str>) -> Value {
    let mut patch = serde_json::Map::new();
    for key in KEYS {
        patch.insert(key.into(), Value::Null);
    }
    patch.insert("obd2".into(), json!({"status":status, "error":error}));
    Value::Object(patch)
}

fn parse(line: &str) -> Result<Value, String> {
    let value: Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
    let patch = value.as_object().ok_or("OBD update is not an object")?;
    if !patch.get("obd2").is_some_and(Value::is_object)
        || patch.iter().any(|(key, v)| {
            key != "obd2" && (!KEYS.contains(&key.as_str()) || !(v.is_null() || v.is_number()))
        })
    {
        return Err("OBD worker emitted an invalid telemetry update".into());
    }
    Ok(value)
}

async fn drive(
    mut enabled: watch::Receiver<bool>,
    telemetry: mpsc::UnboundedSender<Value>,
    make_command: impl Fn() -> Command,
) {
    let mut backoff = 2;
    loop {
        if !*enabled.borrow_and_update() {
            break;
        }
        let _ = telemetry.send(clear("connecting", None));
        let mut cmd = make_command();
        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(error) => {
                eprintln!("[obd2] worker failed to start: {error}");
                let _ = telemetry.send(clear("canError", Some(&error.to_string())));
                tokio::select! {
                    _ = enabled.changed() => break,
                    () = tokio::time::sleep(Duration::from_secs(backoff)) => {}
                }
                backoff = (backoff * 2).min(30);
                continue;
            }
        };
        let lifeline = child.stdin.take();
        let Some(stdout) = child.stdout.take() else {
            eprintln!("[obd2] worker has no stdout");
            drop(lifeline);
            crate::child::terminate(&mut child, Duration::from_secs(2), false).await;
            let _ = telemetry.send(clear("canError", Some("worker has no stdout")));
            break;
        };
        let stderr = child.stderr.take().map(|stderr| {
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    eprintln!("[obd2] {line}");
                }
            })
        });
        let mut lines = BufReader::new(stdout).lines();
        let mut stopped = false;
        let mut failure = "OBD worker stopped".to_string();
        loop {
            tokio::select! {
                _ = enabled.changed() => {
                    stopped = true;
                    break;
                }
                line = lines.next_line() => {
                    match line {
                        Ok(Some(line)) => match parse(&line) {
                            Ok(patch) => {
                                if patch["obd2"]["status"] == "available" {
                                    backoff = 2;
                                }
                                let _ = telemetry.send(patch);
                            }
                            Err(error) => {
                                failure = error;
                                break;
                            }
                        },
                        Ok(None) => break,
                        Err(error) => {
                            failure = error.to_string();
                            break;
                        }
                    }
                }
            }
        }
        // Closing stdin stops requests even when sudo owns the root child.
        drop(lifeline);
        if tokio::time::timeout(Duration::from_secs(2), child.wait())
            .await
            .is_err()
        {
            crate::child::terminate(&mut child, Duration::from_secs(1), false).await;
        }
        if let Some(stderr) = stderr {
            stderr.abort();
        }
        if stopped {
            break;
        }
        eprintln!("[obd2] {failure}; retrying in {backoff}s");
        let _ = telemetry.send(clear("canError", Some(&failure)));
        tokio::select! {
            _ = enabled.changed() => break,
            () = tokio::time::sleep(Duration::from_secs(backoff)) => {}
        }
        backoff = (backoff * 2).min(30);
    }
    let _ = telemetry.send(clear("disabled", None));
}

pub async fn receive(
    enabled: watch::Receiver<bool>,
    telemetry: mpsc::UnboundedSender<Value>,
    bitrate: Obd2Bitrate,
) {
    drive(enabled, telemetry, move || command(bitrate)).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_normalized_readings_and_health_are_accepted() {
        assert!(parse(r#"{"rpm":0,"obd2":{"status":"available"}}"#).is_ok());
        assert!(parse(r#"{"rpm":null,"obd2":{"status":"stale"}}"#).is_ok());
        for line in [
            "not json",
            "[]",
            r#"{"rpm":1}"#,
            r#"{"rpm":"0","obd2":{}}"#,
            r#"{"volume":1,"obd2":{}}"#,
        ] {
            assert!(parse(line).is_err(), "{line}");
        }
        assert!(clear("disabled", None)["rpm"].is_null());
        let cmd = command(Obd2Bitrate::Kbit500);
        assert_eq!(
            cmd.as_std().get_args().collect::<Vec<_>>(),
            ["-n", HELPER, "500000"]
        );
    }

    #[tokio::test]
    async fn disabling_closes_lifeline_and_clears_all_values() {
        let (on, enabled) = watch::channel(true);
        let (tx, mut rx) = mpsc::unbounded_channel();
        let worker = tokio::spawn(drive(enabled, tx, || {
            let mut cmd = Command::new("sh");
            cmd.args([
                "-c",
                r#"echo '{"rpm":0,"obd2":{"status":"available"}}'; cat >/dev/null"#,
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
            cmd
        }));
        assert_eq!(rx.recv().await.unwrap()["obd2"]["status"], "connecting");
        assert_eq!(rx.recv().await.unwrap()["rpm"], 0);
        on.send(false).unwrap();
        let cleared = tokio::time::timeout(Duration::from_secs(3), rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(cleared["obd2"]["status"], "disabled");
        for key in KEYS {
            assert!(cleared[key].is_null());
        }
        worker.await.unwrap();
    }
}
