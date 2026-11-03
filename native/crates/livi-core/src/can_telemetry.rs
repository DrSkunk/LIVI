// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::sync::Arc;

use livi_core_proto::config::{CanTelemetryBackend, Config, Obd2Bitrate};
use serde_json::{Value, json};
use tokio::sync::{mpsc, watch};

use crate::server::Core;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Mode {
    Disabled,
    NotConfigured,
    HaltechV2,
    Obd2(Obd2Bitrate),
}

fn mode(config: &Config) -> Mode {
    if !config.haltech_can_enabled {
        Mode::Disabled
    } else {
        match config.can_telemetry_backend {
            CanTelemetryBackend::HaltechV2 => Mode::HaltechV2,
            CanTelemetryBackend::HaltechObd2 if config.obd2_bus_validated => {
                Mode::Obd2(config.obd2_bitrate)
            }
            CanTelemetryBackend::HaltechObd2 => Mode::NotConfigured,
        }
    }
}

pub async fn run(core: Arc<Core>, telemetry: mpsc::UnboundedSender<Value>) {
    if !cfg!(target_os = "linux") {
        return;
    }
    let mut state = core.hub.watch();
    let mut current = mode(&state.borrow_and_update().config);
    loop {
        let (stop, enabled) = watch::channel(true);
        let task = match current {
            Mode::HaltechV2 => Some(tokio::spawn(crate::haltech_can::receive(
                enabled,
                telemetry.clone(),
            ))),
            Mode::Obd2(bitrate) => Some(tokio::spawn(crate::obd2::receive(
                enabled,
                telemetry.clone(),
                bitrate,
            ))),
            Mode::Disabled | Mode::NotConfigured => {
                let status = if current == Mode::Disabled {
                    "disabled"
                } else {
                    "notConfigured"
                };
                let _ = telemetry.send(json!({"obd2":{"status":status}}));
                None
            }
        };
        let next = loop {
            if state.changed().await.is_err() {
                break None;
            }
            let next = mode(&state.borrow_and_update().config);
            if next != current {
                break Some(next);
            }
        };
        // Reap the previous backend before the next one can reconfigure/transmit on can0.
        let _ = stop.send(false);
        drop(stop);
        if let Some(task) = task
            && let Err(error) = task.await
        {
            eprintln!("[can-telemetry] backend failed: {error}");
            let _ = telemetry.send(json!({"obd2":{"status":"canError","error":error.to_string()}}));
        }
        match next {
            Some(next) => current = next,
            None => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use livi_core_proto::config::defaults;

    #[test]
    fn old_settings_preserve_passive_mode_and_obd_requires_opt_in() {
        let mut config = defaults();
        assert_eq!(mode(&config), Mode::Disabled);
        config.haltech_can_enabled = true;
        assert_eq!(mode(&config), Mode::HaltechV2);
        config.can_telemetry_backend = CanTelemetryBackend::HaltechObd2;
        assert_eq!(mode(&config), Mode::NotConfigured);
        config.obd2_bus_validated = true;
        assert_eq!(mode(&config), Mode::Obd2(Obd2Bitrate::Kbit500));
        config.obd2_bitrate = Obd2Bitrate::Mbit1;
        assert_eq!(mode(&config), Mode::Obd2(Obd2Bitrate::Mbit1));
        config.haltech_can_enabled = false;
        assert_eq!(mode(&config), Mode::Disabled);
    }
}
