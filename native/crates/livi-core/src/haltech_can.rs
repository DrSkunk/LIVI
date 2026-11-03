// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

//! Listen-only receiver for the Haltech CAN V2 broadcast on can0 (1 Mbit/s). The interface
//! itself is brought up by the host. Signal offsets and conversions follow Haltech ECU
//! Broadcast CAN Protocol 2.0. A value without a frame for [`STALE`] goes back to null.

use std::collections::BTreeMap;
use std::io;
use std::process::Stdio;
use std::time::Duration;

use serde_json::{Map, Value};
use tokio::io::{AsyncBufReadExt, BufReader, Lines};
use tokio::process::{Child, ChildStdout, Command};
use tokio::sync::{mpsc, watch};
use tokio::time::Instant;

const INTERFACE: &str = "can0";
const CANDUMP_FILTER: &str = "can0,360:7FF,361:7FF,368:7FF,36A:7FF,370:7FF,372:7FF,3E0:7FF";
const RPM_ID: u16 = 0x360;
const SPEED_ID: u16 = 0x370;
pub const STALE: Duration = Duration::from_millis(1500);
const RETRY_FIRST: Duration = Duration::from_secs(2);
const RETRY_MAX: Duration = Duration::from_secs(30);
const STOP_GRACE: Duration = Duration::from_secs(1);

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Reading {
    Rpm(f64),
    SpeedKph(f64),
    BatteryV(f64),
    CoolantC(f64),
    OilPressureKpa(f64),
    Lambda(f64),
    KnockLevels(f64, f64),
}

impl Reading {
    fn values(self) -> Vec<(&'static str, f64)> {
        match self {
            Reading::Rpm(v) => vec![("rpm", v)],
            Reading::SpeedKph(v) => vec![("speedKph", v)],
            Reading::BatteryV(v) => vec![("batteryV", v)],
            Reading::CoolantC(v) => vec![("coolantC", v)],
            Reading::OilPressureKpa(v) => vec![("oilPressureKpa", v)],
            Reading::Lambda(v) => vec![("lambda", v)],
            Reading::KnockLevels(a, b) => vec![("knock1Db", a), ("knock2Db", b)],
        }
    }
}

fn hex(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_hexdigit())
}

/// One `candump -L` line, `(1712345678.123456) can0 360#0BB8...`, the timestamp optional.
pub fn decode(line: &str) -> Option<Reading> {
    let mut rest = line.trim();
    if let Some(stamped) = rest.strip_prefix('(') {
        let (_, after) = stamped.split_once(')')?;
        if !after.starts_with(char::is_whitespace) {
            return None;
        }
        rest = after.trim_start();
    }
    let (iface, frame) = rest.split_once(char::is_whitespace)?;
    if !iface.eq_ignore_ascii_case(INTERFACE) {
        return None;
    }
    let (id, data) = frame.trim_start().split_once('#')?;
    if !hex(id) || id.len() > 3 || !(data.is_empty() || hex(data)) {
        return None;
    }
    if data.len() > 16 || data.len() % 2 != 0 {
        return None;
    }
    let id = u16::from_str_radix(id, 16).ok().filter(|id| *id <= 0x7ff)?;
    let byte = |i: usize| u8::from_str_radix(data.get(i * 2..i * 2 + 2)?, 16).ok();
    let word = |offset| {
        Some(f64::from(u16::from_be_bytes([
            byte(offset)?,
            byte(offset + 1)?,
        ])))
    };
    match id {
        RPM_ID => Some(Reading::Rpm(word(0)?)),
        SPEED_ID => Some(Reading::SpeedKph(word(0)? / 10.0)),
        0x372 => Some(Reading::BatteryV(word(0)? / 10.0)),
        0x3e0 => Some(Reading::CoolantC(word(0)? / 10.0 - 273.15)),
        0x361 => Some(Reading::OilPressureKpa(word(2)? / 10.0 - 101.3)),
        0x368 => Some(Reading::Lambda(word(0)? / 1000.0)),
        0x36a => Some(Reading::KnockLevels(word(0)? / 100.0, word(2)? / 100.0)),
        _ => None,
    }
}

#[derive(Debug, Default)]
struct Slot {
    sent: Option<f64>,
    seen: Option<Instant>,
}

/// What the receiver last pushed, and when each value last came in.
#[derive(Debug, Default)]
struct Fresh {
    slots: BTreeMap<&'static str, Slot>,
}

impl Fresh {
    fn seen(&mut self, reading: Reading, now: Instant) -> Option<Value> {
        let mut patch = Map::new();
        for (key, value) in reading.values() {
            let slot = self.slots.entry(key).or_default();
            slot.seen = Some(now);
            if slot.sent != Some(value) {
                slot.sent = Some(value);
                patch.insert(key.into(), value.into());
            }
        }
        (!patch.is_empty()).then_some(Value::Object(patch))
    }

    fn expire(&mut self, now: Instant, stale: Duration) -> Option<Value> {
        self.clear_if(|slot| slot.seen.is_some_and(|at| now.duration_since(at) >= stale))
    }

    fn clear(&mut self) -> Option<Value> {
        self.clear_if(|slot| slot.seen.is_some() || slot.sent.is_some())
    }

    fn clear_if(&mut self, gone: impl Fn(&Slot) -> bool) -> Option<Value> {
        let mut patch = Map::new();
        for (&key, slot) in &mut self.slots {
            if gone(slot) {
                *slot = Slot::default();
                patch.insert(key.into(), Value::Null);
            }
        }
        (!patch.is_empty()).then_some(Value::Object(patch))
    }

    fn next_deadline(&self, stale: Duration) -> Option<Instant> {
        self.slots
            .values()
            .filter_map(|slot| slot.seen)
            .min()
            .map(|at| at + stale)
    }
}

#[derive(Debug)]
struct Backoff {
    next: Duration,
    first: Duration,
    max: Duration,
}

impl Backoff {
    fn new(first: Duration, max: Duration) -> Self {
        Self {
            next: first,
            first,
            max,
        }
    }

    fn take(&mut self) -> Duration {
        let now = self.next;
        self.next = (self.next * 2).min(self.max);
        now
    }

    fn reset(&mut self) {
        self.next = self.first;
    }
}

#[derive(Debug, Clone, Copy)]
struct Timing {
    stale: Duration,
    retry_first: Duration,
    retry_max: Duration,
}

const TIMING: Timing = Timing {
    stale: STALE,
    retry_first: RETRY_FIRST,
    retry_max: RETRY_MAX,
};

fn capture_command(livi_os: bool) -> Command {
    let mut cmd = if livi_os {
        let mut c = Command::new("sudo");
        c.arg("-n").arg(crate::livi_os::CAN_CAPTURE);
        c
    } else {
        let mut c = Command::new("candump");
        c.arg("-L").arg(CANDUMP_FILTER);
        c
    };
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    cmd
}

struct Capture {
    child: Child,
    lines: Lines<BufReader<ChildStdout>>,
}

impl Capture {
    fn start(mut cmd: Command) -> io::Result<Self> {
        let mut child = cmd.spawn()?;
        let out = child
            .stdout
            .take()
            .ok_or_else(|| io::Error::other("no stdout"))?;
        if let Some(err) = child.stderr.take() {
            tokio::spawn(async move {
                let mut lines = BufReader::new(err).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if !line.trim().is_empty() {
                        eprintln!("[haltech-can] capture: {}", line.trim());
                    }
                }
            });
        }
        Ok(Self {
            child,
            lines: BufReader::new(out).lines(),
        })
    }

    async fn stop(mut self) {
        crate::child::terminate(&mut self.child, STOP_GRACE, false).await;
    }
}

async fn next_line(capture: &mut Option<Capture>) -> Option<String> {
    match capture.as_mut() {
        Some(c) => c.lines.next_line().await.ok().flatten(),
        None => std::future::pending().await,
    }
}

async fn until(at: Option<Instant>) {
    match at {
        Some(at) => tokio::time::sleep_until(at).await,
        None => std::future::pending().await,
    }
}

async fn drive(
    mut enabled: watch::Receiver<bool>,
    telemetry: mpsc::UnboundedSender<Value>,
    command: impl Fn() -> Command,
    timing: Timing,
) {
    let mut fresh = Fresh::default();
    let mut backoff = Backoff::new(timing.retry_first, timing.retry_max);
    let mut capture: Option<Capture> = None;
    let mut retry_at: Option<Instant> = None;
    let mut on = *enabled.borrow_and_update();
    loop {
        if on && capture.is_none() && retry_at.is_none_or(|at| at <= Instant::now()) {
            retry_at = None;
            match Capture::start(command()) {
                Ok(c) => capture = Some(c),
                Err(e) => {
                    let wait = backoff.take();
                    eprintln!("[haltech-can] capture does not start: {e}, again in {wait:?}");
                    retry_at = Some(Instant::now() + wait);
                }
            }
        }
        let wake = [fresh.next_deadline(timing.stale), retry_at]
            .into_iter()
            .flatten()
            .min();
        tokio::select! {
            changed = enabled.changed() => {
                if changed.is_err() {
                    break;
                }
                let next = *enabled.borrow_and_update();
                if next == on {
                    continue;
                }
                on = next;
                println!("[haltech-can] receiver {}", if on { "on" } else { "off" });
                if !on {
                    if let Some(c) = capture.take() {
                        c.stop().await;
                    }
                    retry_at = None;
                    backoff.reset();
                    if let Some(patch) = fresh.clear() {
                        let _ = telemetry.send(patch);
                    }
                }
            }
            line = next_line(&mut capture) => match line {
                Some(line) => {
                    if let Some(reading) = decode(&line) {
                        backoff.reset();
                        if let Some(patch) = fresh.seen(reading, Instant::now()) {
                            let _ = telemetry.send(patch);
                        }
                    }
                }
                None => {
                    if let Some(mut c) = capture.take() {
                        let status = c.child.wait().await;
                        let wait = backoff.take();
                        eprintln!("[haltech-can] capture ended ({status:?}), again in {wait:?}");
                        retry_at = Some(Instant::now() + wait);
                    }
                }
            },
            () = until(wake) => {
                if let Some(patch) = fresh.expire(Instant::now(), timing.stale) {
                    let _ = telemetry.send(patch);
                }
            }
        }
    }
    if let Some(c) = capture.take() {
        c.stop().await;
    }
    if let Some(patch) = fresh.clear() {
        let _ = telemetry.send(patch);
    }
}

pub(crate) async fn receive(
    enabled: watch::Receiver<bool>,
    telemetry: mpsc::UnboundedSender<Value>,
) {
    let livi_os = crate::livi_os::active();
    drive(enabled, telemetry, move || capture_command(livi_os), TIMING).await;
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn rpm_and_speed_come_from_their_frames() {
        assert_eq!(
            decode("(1712345678.123456) can0 360#0BB8000000000000"),
            Some(Reading::Rpm(3000.0))
        );
        assert_eq!(decode("can0 370#04D2"), Some(Reading::SpeedKph(123.4)));
        assert_eq!(decode("  CAN0   360#ffff  "), Some(Reading::Rpm(65535.0)));
        assert_eq!(decode("(0.0) can0 370#0000"), Some(Reading::SpeedKph(0.0)));
    }

    #[test]
    fn other_frames_and_garbage_are_ignored() {
        assert_eq!(decode("can0 361#0BB8"), None);
        assert_eq!(decode("can1 360#0BB8"), None);
        assert_eq!(decode("can0 360#0B"), None);
        assert_eq!(decode("can0 360#0BB"), None);
        assert_eq!(decode("can0 360#"), None);
        assert_eq!(decode("can0 800#0BB8"), None);
        assert_eq!(decode("can0 0360#0BB8"), None);
        assert_eq!(decode("can0 360#0BB8000000000000FF"), None);
        assert_eq!(decode("can0 360#0BZ8"), None);
        assert_eq!(decode("(1.0)can0 360#0BB8"), None);
        assert_eq!(decode("(1.0 can0 360#0BB8"), None);
        assert_eq!(decode(""), None);
        assert_eq!(decode("candump: interface can0 down"), None);
    }

    #[test]
    fn haltech_v2_offsets_units_and_scaling() {
        assert_eq!(decode("can0 372#008E"), Some(Reading::BatteryV(14.2)));
        let Some(Reading::CoolantC(celsius)) = decode("can0 3E0#0E30") else {
            panic!("missing coolant");
        };
        assert!((celsius - 90.05).abs() < 1e-9);
        let Some(Reading::CoolantC(celsius)) = decode("can0 3E0#09E4") else {
            panic!("missing cold coolant");
        };
        assert!((celsius + 19.95).abs() < 1e-9);
        let Some(Reading::OilPressureKpa(kpa)) = decode("can0 361#FFFF1395") else {
            panic!("missing oil pressure");
        };
        assert!((kpa - 400.0).abs() < 1e-9);
        assert_eq!(decode("can0 368#03E8044C"), Some(Reading::Lambda(1.0)));
        assert_eq!(
            decode("can0 36A#04D20929"),
            Some(Reading::KnockLevels(12.34, 23.45))
        );
        for id in ["361", "36A"] {
            for data in ["", "00", "0000", "000000"] {
                assert_eq!(decode(&format!("can0 {id}#{data}")), None);
            }
        }
        for id in ["372", "3E0", "368"] {
            assert_eq!(decode(&format!("can0 {id}#00")), None);
        }
        for data in ["0000#0000", "R", "##0000", "000000000000000000"] {
            assert_eq!(decode(&format!("can0 36A#{data}")), None);
        }
    }

    #[test]
    fn every_signal_refreshes_and_expires_independently() {
        let t0 = Instant::now();
        let mut fresh = Fresh::default();
        let readings = [
            Reading::Rpm(3000.0),
            Reading::SpeedKph(42.0),
            Reading::BatteryV(14.2),
            Reading::CoolantC(90.0),
            Reading::OilPressureKpa(400.0),
            Reading::Lambda(1.0),
            Reading::KnockLevels(12.34, 23.45),
        ];
        let mut snap = crate::telemetry::Snapshot::new();
        for reading in readings {
            let patch = fresh.seen(reading, t0).unwrap();
            crate::telemetry::merge(&mut snap, &patch);
            assert_eq!(fresh.seen(reading, t0), None);
        }
        assert_eq!(snap["oilPressureKpa"], 400.0);
        assert_eq!(snap["knock1Db"], 12.34);
        assert_eq!(snap["knock2Db"], 23.45);
        assert!(
            !snap.contains_key("afr"),
            "no fuel-independent AFR conversion"
        );
        assert_eq!(fresh.seen(Reading::BatteryV(14.2), t0 + STALE / 2), None);
        let expired = fresh.expire(t0 + STALE, STALE).unwrap();
        assert_eq!(expired.as_object().unwrap().len(), 7);
        assert!(expired.get("batteryV").is_none());
        assert!(expired.as_object().unwrap().values().all(Value::is_null));
        assert_eq!(fresh.clear(), Some(json!({"batteryV": null})));
        assert_eq!(fresh.clear(), None);
        for reading in readings {
            assert!(fresh.seen(reading, t0 + STALE * 2).is_some());
        }
        assert_eq!(fresh.clear().unwrap().as_object().unwrap().len(), 8);
    }

    #[test]
    fn a_value_is_pushed_on_change_and_nulled_when_stale() {
        let t0 = Instant::now();
        let mut fresh = Fresh::default();
        assert_eq!(
            fresh.seen(Reading::Rpm(3000.0), t0),
            Some(json!({ "rpm": 3000.0 }))
        );
        assert_eq!(fresh.seen(Reading::Rpm(3000.0), t0), None);
        let t1 = t0 + Duration::from_millis(1000);
        assert_eq!(
            fresh.seen(Reading::SpeedKph(42.0), t1),
            Some(json!({ "speedKph": 42.0 }))
        );
        assert_eq!(fresh.next_deadline(STALE), Some(t0 + STALE));
        assert_eq!(fresh.expire(t0 + Duration::from_millis(1499), STALE), None);
        assert_eq!(
            fresh.expire(t0 + STALE, STALE),
            Some(json!({ "rpm": null }))
        );
        assert_eq!(fresh.next_deadline(STALE), Some(t1 + STALE));
        assert_eq!(
            fresh.seen(Reading::Rpm(3000.0), t1),
            Some(json!({ "rpm": 3000.0 }))
        );
        assert_eq!(
            fresh.clear(),
            Some(json!({ "rpm": null, "speedKph": null }))
        );
        assert_eq!(fresh.clear(), None);
        assert_eq!(fresh.next_deadline(STALE), None);
    }

    #[test]
    fn a_null_takes_the_value_out_of_the_telemetry() {
        let mut snap = crate::telemetry::Snapshot::new();
        crate::telemetry::merge(&mut snap, &json!({ "rpm": 3000.0 }));
        crate::telemetry::merge(&mut snap, &json!({ "rpm": null }));
        assert_eq!(snap["rpm"].as_f64(), None);
    }

    #[test]
    fn retries_back_off_and_reset() {
        let mut b = Backoff::new(Duration::from_secs(2), Duration::from_secs(5));
        assert_eq!(b.take(), Duration::from_secs(2));
        assert_eq!(b.take(), Duration::from_secs(4));
        assert_eq!(b.take(), Duration::from_secs(5));
        b.reset();
        assert_eq!(b.take(), Duration::from_secs(2));
    }

    #[test]
    fn the_capture_is_the_filtered_candump_or_the_os_helper() {
        let line = |cmd: Command| {
            let cmd = cmd.as_std();
            std::iter::once(cmd.get_program())
                .chain(cmd.get_args())
                .map(|a| a.to_string_lossy().into_owned())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            line(capture_command(false)),
            ["candump", "-L", CANDUMP_FILTER]
        );
        assert_eq!(
            line(capture_command(true)),
            ["sudo", "-n", "/usr/libexec/livi-can-capture"]
        );
    }

    fn fake(script: &'static str) -> impl Fn() -> Command {
        move || {
            let mut c = Command::new("sh");
            c.arg("-c").arg(script);
            c.stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .kill_on_drop(true);
            c
        }
    }

    const QUICK: Timing = Timing {
        stale: Duration::from_millis(300),
        retry_first: Duration::from_millis(50),
        retry_max: Duration::from_millis(200),
    };

    async fn recv(rx: &mut mpsc::UnboundedReceiver<Value>) -> Value {
        tokio::time::timeout(Duration::from_secs(5), rx.recv())
            .await
            .unwrap()
            .unwrap()
    }

    #[tokio::test]
    async fn frames_flow_go_stale_and_the_capture_comes_back() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let (on, enabled) = watch::channel(true);
        let task = tokio::spawn(drive(
            enabled,
            tx,
            fake("echo '(1.0) can0 360#0BB8'; echo 'can0 370#04D2'; sleep 1"),
            QUICK,
        ));
        assert_eq!(recv(&mut rx).await, json!({ "rpm": 3000.0 }));
        assert_eq!(recv(&mut rx).await, json!({ "speedKph": 123.4 }));
        let mut stale = Map::new();
        while stale.len() < 2 {
            let Value::Object(patch) = recv(&mut rx).await else {
                panic!("not an object");
            };
            assert!(patch.values().all(Value::is_null), "{patch:?}");
            stale.extend(patch);
        }
        assert_eq!(recv(&mut rx).await, json!({ "rpm": 3000.0 }));
        on.send(false).unwrap();
        loop {
            let patch = recv(&mut rx).await;
            if patch.get("rpm") == Some(&Value::Null) {
                break;
            }
            assert_eq!(patch, json!({ "speedKph": 123.4 }));
        }
        drop(on);
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn off_starts_nothing() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let (on, enabled) = watch::channel(false);
        let task = tokio::spawn(drive(enabled, tx, fake("echo 'can0 360#0BB8'"), QUICK));
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(rx.try_recv().is_err());
        on.send(true).unwrap();
        assert_eq!(recv(&mut rx).await, json!({ "rpm": 3000.0 }));
        drop(on);
        tokio::time::timeout(Duration::from_secs(5), task)
            .await
            .unwrap()
            .unwrap();
    }

    #[tokio::test]
    async fn additional_signals_reach_telemetry_and_clear_when_disabled() {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let (on, enabled) = watch::channel(true);
        let task = tokio::spawn(drive(
            enabled,
            tx,
            fake(
                "echo 'can0 372#008E'; echo 'can0 3E0#0E30'; echo 'can0 361#00001395'; echo 'can0 368#03E8'; echo 'can0 36A#04D20929'; sleep 10",
            ),
            TIMING,
        ));
        let mut snap = Map::new();
        while snap.len() < 6 {
            snap.extend(recv(&mut rx).await.as_object().unwrap().clone());
        }
        assert_eq!(snap["batteryV"], 14.2);
        assert!((snap["coolantC"].as_f64().unwrap() - 90.05).abs() < 1e-9);
        assert!((snap["oilPressureKpa"].as_f64().unwrap() - 400.0).abs() < 1e-9);
        assert_eq!(snap["lambda"], 1.0);
        assert_eq!(snap["knock1Db"], 12.34);
        assert_eq!(snap["knock2Db"], 23.45);
        on.send(false).unwrap();
        let cleared = recv(&mut rx).await;
        assert_eq!(cleared.as_object().unwrap().len(), 6);
        assert!(cleared.as_object().unwrap().values().all(Value::is_null));
        drop(on);
        task.await.unwrap();
    }
}
