// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use livi_core_proto::message::{Action, OsUpdateCommand};
use livi_core_proto::state::{OsChannel, OsUpdate, OsUpdatePhase};
use serde_json::Value;

use super::{DASH, info};
use crate::i18n::Strings;
use crate::settings::view::{Change, Dialog, Row, RowKind};

fn state(value: &Value) -> OsUpdate {
    serde_json::from_value(value["system"]["osUpdate"].clone()).unwrap_or_default()
}

fn action(command: OsUpdateCommand) -> Option<Action> {
    Some(Action::OsUpdate { command })
}

fn app_busy(value: &Value) -> bool {
    value["update"]["phase"]
        .as_str()
        .is_some_and(|p| p != "idle" && p != "error")
}

pub fn busy(value: &Value) -> bool {
    let s = state(value);
    s.enabled && (s.phase != OsUpdatePhase::Idle || s.confirm_reboot)
}

pub fn rows(value: &Value, t: &Strings) -> Vec<Row> {
    let s = state(value);
    if !s.enabled {
        return Vec::new();
    }
    let idle = s.phase == OsUpdatePhase::Idle
        && !s.confirm_reboot
        && value["system"]["powerBusy"].as_bool() != Some(true);
    let status = s.status.as_ref();
    let eligible = status.is_some_and(|s| s.update_key && !s.pending && !s.trial);
    let mut rows = vec![
        info(
            t.t("osUpdate.title", "Operating system"),
            None,
            String::new(),
        ),
        info(
            t.t("osUpdate.installed", "Installed OS"),
            None,
            status.map_or_else(|| DASH.into(), |s| s.version.clone()),
        ),
    ];
    if let Some(status) = status {
        rows.push(info(
            t.t("osUpdate.slot", "Board / active slot"),
            None,
            format!("{} / {}", status.board, status.slot),
        ));
        if status.trial {
            rows.push(info(
                t.t("osUpdate.trial", "Trial boot: awaiting health confirmation"),
                None,
                String::new(),
            ));
        }
        if !status.update_key {
            rows.push(Row {
                alert: true,
                ..info(
                    t.t(
                        "osUpdate.noKey",
                        "This OS image has no update signing key. Install a full signed image.",
                    ),
                    None,
                    String::new(),
                )
            });
        }
    }
    rows.extend([
        info(
            t.t("osUpdate.available", "Available OS"),
            None,
            s.release
                .as_ref()
                .map_or_else(|| DASH.into(), |r| r.available.clone()),
        ),
        Row {
            kind: RowKind::Switch,
            label: t.t("osUpdate.nightly", "Nightly OS updates"),
            checked: s.channel == OsChannel::Nightly,
            enabled: idle,
            change: Some(Change::Act(Action::OsUpdate {
                command: OsUpdateCommand::Check {
                    channel: if s.channel == OsChannel::Nightly {
                        OsChannel::Stable
                    } else {
                        OsChannel::Nightly
                    },
                },
            })),
            ..Row::default()
        },
        Row {
            kind: RowKind::Button,
            label: t.t("osUpdate.check", "Check OS updates"),
            button: t.t("softwareUpdate.refresh", "Refresh"),
            outlined: true,
            enabled: idle,
            action: action(OsUpdateCommand::Check { channel: s.channel }),
            ..Row::default()
        },
        Row {
            kind: RowKind::Button,
            label: t.t("osUpdate.stage", "Download and stage OS"),
            button: if s.release.as_ref().is_some_and(|r| !r.update) {
                t.t("softwareUpdate.upToDate", "Up to date")
            } else {
                t.t("osUpdate.download", "Download and stage")
            },
            enabled: idle
                && eligible
                && !app_busy(value)
                && s.release
                    .as_ref()
                    .is_some_and(|r| r.update && r.channel == s.channel),
            action: action(OsUpdateCommand::Stage),
            ..Row::default()
        },
    ]);
    if let Some(status) = status.filter(|s| s.pending) {
        rows.push(info(
            t.t("osUpdate.staged", "Staged OS"),
            None,
            status
                .staged
                .as_ref()
                .map_or_else(|| DASH.into(), |s| s.version.clone()),
        ));
        rows.push(Row {
            kind: RowKind::Button,
            label: t.t("osUpdate.rebootLabel", "Try the staged OS update"),
            button: t.t("osUpdate.reboot", "Reboot..."),
            enabled: idle && !status.trial && status.staged.is_some() && !app_busy(value),
            action: action(OsUpdateCommand::RequestReboot),
            ..Row::default()
        });
    }
    if s.phase != OsUpdatePhase::Idle {
        let label = match s.phase {
            OsUpdatePhase::Checking => t.t("osUpdate.checking", "Checking signed OS release"),
            OsUpdatePhase::Downloading => t.t("osUpdate.downloading", "Downloading OS"),
            OsUpdatePhase::Staging => {
                t.t("osUpdate.staging", "Writing and verifying inactive slots")
            }
            OsUpdatePhase::Rebooting => t.t("osUpdate.rebooting", "Rebooting into OS trial"),
            OsUpdatePhase::Idle => String::new(),
        };
        rows.push(info(label, None, String::new()));
        rows.push(Row {
            kind: RowKind::Progress,
            level: if s.total > 0 {
                s.received as f32 / s.total as f32
            } else {
                0.0
            },
            enabled: true,
            ..Row::default()
        });
        if s.total > 0 {
            rows.push(info(
                t.t("osUpdate.verified", "Verified download"),
                None,
                format!("{} / {} MB", s.received / 1048576, s.total / 1048576),
            ));
        }
    }
    if !s.message.is_empty() {
        rows.push(info(s.message, None, String::new()));
    }
    if let Some(error) = s.error {
        rows.push(Row {
            alert: true,
            ..info(error, None, String::new())
        });
    }
    rows
}

pub fn dialog(value: &Value, t: &Strings) -> Option<Dialog> {
    let s = state(value);
    if !s.enabled || !s.confirm_reboot || s.phase != OsUpdatePhase::Idle {
        return None;
    }
    let staged = s.status.as_ref()?.staged.as_ref()?;
    Some(Dialog {
        title: t.t("osUpdate.confirmTitle", "Reboot for OS update?"),
        key: format!("os-reboot:{}:{}", staged.serial, staged.version),
        rows: vec![
            info(t.t("osUpdate.staged", "Staged OS"), None, staged.version.clone()),
            info(t.t("osUpdate.confirmText", "Reboot now to try the signed OS update. The previous OS is retained for automatic rollback if the trial fails."), None, String::new()),
            Row {
                kind: RowKind::Button,
                button: t.t("osUpdate.later", "Later"),
                outlined: true,
                enabled: true,
                action: action(OsUpdateCommand::CancelReboot),
                ..Row::default()
            },
            Row {
                kind: RowKind::Button,
                button: t.t("osUpdate.rebootNow", "Reboot now"),
                enabled: true,
                action: action(OsUpdateCommand::ConfirmReboot),
                ..Row::default()
            },
        ],
    })
}

#[cfg(test)]
mod tests {
    use livi_core_proto::state::{OsRelease, OsStaged, OsStatus};
    use serde_json::json;

    use super::*;

    fn ready() -> OsUpdate {
        OsUpdate {
            enabled: true,
            status: Some(OsStatus {
                board: "rpi5".into(),
                version: "v1".into(),
                serial: 1,
                slot: "a".into(),
                pending: false,
                staged: None,
                trial: false,
                update_key: true,
            }),
            release: Some(OsRelease {
                installed: "v1".into(),
                available: "v2".into(),
                update: true,
                channel: OsChannel::Stable,
            }),
            ..Default::default()
        }
    }

    fn value(state: &OsUpdate) -> Value {
        json!({ "system": { "osUpdate": state }, "update": { "phase": "idle" } })
    }

    #[test]
    fn desktop_has_no_os_controls_and_os_channel_is_independent() {
        assert!(rows(&json!({}), &Strings::new("en")).is_empty());
        let rows = rows(&value(&ready()), &Strings::new("en"));
        let channel = rows.iter().find(|r| r.kind == RowKind::Switch).unwrap();
        assert_eq!(
            channel.change,
            Some(Change::Act(Action::OsUpdate {
                command: OsUpdateCommand::Check {
                    channel: OsChannel::Nightly
                },
            }))
        );
        assert!(channel.action.is_none());
        assert!(
            rows.iter()
                .find(|r| r.action == action(OsUpdateCommand::Stage))
                .unwrap()
                .enabled
        );
    }

    #[test]
    fn no_key_trial_pending_and_busy_app_disable_staging() {
        let mut state = ready();
        for change in [
            |s: &mut OsUpdate| s.status.as_mut().unwrap().update_key = false,
            |s: &mut OsUpdate| s.status.as_mut().unwrap().pending = true,
            |s: &mut OsUpdate| s.status.as_mut().unwrap().trial = true,
            |s: &mut OsUpdate| s.phase = OsUpdatePhase::Downloading,
            |s: &mut OsUpdate| s.release = None,
        ] {
            change(&mut state);
            assert!(
                !rows(&value(&state), &Strings::new("en"))
                    .iter()
                    .find(|r| r.action == action(OsUpdateCommand::Stage))
                    .unwrap()
                    .enabled
            );
            state = ready();
        }
        let mut value = value(&state);
        value["update"]["phase"] = json!("installing");
        assert!(
            !rows(&value, &Strings::new("en"))
                .iter()
                .find(|r| r.action == action(OsUpdateCommand::Stage))
                .unwrap()
                .enabled
        );
    }

    #[test]
    fn progress_errors_and_staged_state_are_visible_without_auto_reboot() {
        let mut state = ready();
        state.phase = OsUpdatePhase::Downloading;
        state.received = 1;
        state.total = 4;
        state.error = Some("Signature invalid".into());
        let rows = rows(&value(&state), &Strings::new("en"));
        assert_eq!(
            rows.iter()
                .find(|r| r.kind == RowKind::Progress)
                .unwrap()
                .level,
            0.25
        );
        assert!(
            rows.iter()
                .any(|r| r.alert && r.label == "Signature invalid")
        );
        state.status.as_mut().unwrap().pending = true;
        state.status.as_mut().unwrap().staged = Some(OsStaged {
            version: "v2".into(),
            serial: 2,
        });
        state.phase = OsUpdatePhase::Idle;
        assert!(dialog(&value(&state), &Strings::new("en")).is_none());
        state.confirm_reboot = true;
        let dialog = dialog(&value(&state), &Strings::new("en")).unwrap();
        assert!(
            dialog
                .rows
                .iter()
                .any(|r| r.action == action(OsUpdateCommand::ConfirmReboot))
        );
        assert!(
            dialog
                .rows
                .iter()
                .any(|r| r.action == action(OsUpdateCommand::CancelReboot))
        );
    }
}
