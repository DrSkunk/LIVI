// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use livi_core_proto::message::Action;
use livi_core_proto::state::{Update, UpdatePhase};
use serde_json::Value;

use super::{DASH, info, mono, os_update};
use crate::i18n::Strings;
use crate::settings::value::patch;
use crate::settings::view::{Change, Dialog, Facts, Local, Row, RowKind};

/// Attribution required by NOTICE (GPL-3.0 section 7(b)) for this fork.
pub const UPSTREAM_ATTRIBUTION: &str = "LIVI by Lasse Heitgres (https://github.com/f-io/LIVI)";

pub fn power(state: &Value, t: &Strings, restart: bool) -> Vec<Row> {
    let busy = state["system"]["powerBusy"].as_bool() == Some(true);
    let update: Update = serde_json::from_value(state["update"].clone()).unwrap_or_default();
    let updating =
        !matches!(update.phase, UpdatePhase::Idle | UpdatePhase::Error) || os_update::busy(state);
    let mut rows = vec![
        info(
            if restart {
                t.t("settings.confirmRestart", "Confirm restart? On a kiosk this reboots the host; on a desktop it restarts LIVI.")
            } else {
                t.t("settings.confirmPowerOff", "Confirm power off? On a kiosk this shuts down the host; on a desktop it closes LIVI.")
            },
            None,
            String::new(),
        ),
        Row {
            kind: RowKind::Button,
            button: if busy {
                t.t("settings.powerRequested", "Power request in progress")
            } else if restart {
                t.t("settings.restartNow", "Restart now")
            } else {
                t.t("settings.powerOffNow", "Power off now")
            },
            enabled: !busy && !updating,
            action: Some(if restart {
                Action::Restart
            } else {
                Action::Quit
            }),
            ..Row::default()
        },
    ];
    if updating {
        rows.push(info(
            t.t(
                "settings.powerUpdateBusy",
                "Finish the software update operation first.",
            ),
            None,
            String::new(),
        ));
    }
    if state["system"]["osUpdate"]["status"]["pending"].as_bool() == Some(true) {
        rows.push(info(
            t.t(
                "settings.powerPendingOs",
                "A staged OS update will be tried at the next boot.",
            ),
            None,
            String::new(),
        ));
    }
    if let Some(error) = state["system"]["powerError"].as_str() {
        rows.push(Row {
            alert: true,
            ..info(error.into(), None, String::new())
        });
    }
    rows
}

pub fn about(t: &Strings, f: &Facts) -> Vec<Row> {
    let or_dash = |s: &str| {
        if s.trim().is_empty() {
            DASH.to_string()
        } else {
            s.to_string()
        }
    };
    let build = if f.run.is_empty() {
        or_dash(&f.sha)
    } else {
        format!("#{} - {}", f.run, or_dash(&f.sha))
    };
    vec![
        info(t.t("settings.name", "Name"), None, or_dash(&f.name)),
        info(t.t("settings.url", "URL"), None, or_dash(&f.homepage)),
        info(
            t.t("settings.sourceCode", "Source code"),
            None,
            or_dash(&f.source),
        ),
        info(
            t.t("settings.basedOn", "Based on"),
            None,
            UPSTREAM_ATTRIBUTION.to_string(),
        ),
        info(
            t.t("settings.copyright", "Copyright"),
            None,
            or_dash(&f.copyright),
        ),
        info(
            t.t("settings.license", "License"),
            None,
            or_dash(&f.license),
        ),
        info(
            t.t("settings.warranty", "Warranty"),
            None,
            t.t(
                "settings.noWarranty",
                "None, to the extent permitted by law",
            ),
        ),
        mono(t.t("settings.version", "Version"), or_dash(&f.version)),
        mono(t.t("settings.build", "Build"), build),
    ]
}

pub fn link_speed(state: &Value, t: &Strings) -> Vec<Row> {
    let speed = &state["system"]["linkSpeed"];
    let leg = |mbps: &str, phy: &str| match speed[mbps].as_f64() {
        Some(m) => {
            let rate = format!("{m:.1} Mbps");
            match speed[phy].as_f64().filter(|p| *p > 0.0) {
                Some(p) => format!("{rate} · {p} PHY"),
                None => rate,
            }
        }
        None => DASH.to_string(),
    };
    vec![
        mono(
            t.t("settings.wifiLinkDown", "Link ↓"),
            leg("downMbps", "downRate"),
        ),
        mono(
            t.t("settings.wifiLinkUp", "Link ↑"),
            leg("upMbps", "upRate"),
        ),
    ]
}

fn semver(v: &str) -> Option<[u64; 3]> {
    let mut it = v.trim().split('.').map(|p| p.parse::<u64>().ok());
    let out = [it.next()??, it.next()??, it.next()??];
    it.next().is_none().then_some(out)
}

fn same_build(installed: &str, release: &str) -> bool {
    let a = installed.trim().to_lowercase();
    let b = release.trim().to_lowercase();
    if a.is_empty() || b.is_empty() || a == "dev" {
        return false;
    }
    let n = a.len().min(b.len());
    a[..n] == b[..n]
}

fn build_tag(run: &str, sha: &str) -> String {
    let parts: Vec<String> = [
        (!run.is_empty()).then(|| format!("#{run}")),
        (!sha.trim().is_empty()).then(|| sha.trim().to_string()),
    ]
    .into_iter()
    .flatten()
    .collect();
    if parts.is_empty() {
        String::new()
    } else {
        format!(" ({})", parts.join(" · "))
    }
}

fn human(n: f64) -> String {
    if n >= 1024.0 * 1024.0 {
        format!("{:.1} MB", n / (1024.0 * 1024.0))
    } else {
        format!("{} KB", (n / 1024.0).round())
    }
}

struct Plan {
    update: Update,
    nightly: bool,
    order: Option<std::cmp::Ordering>,
    in_flight: bool,
    error: String,
}

fn plan(state: &Value, t: &Strings, f: &Facts) -> Plan {
    let update: Update = serde_json::from_value(state["update"].clone()).unwrap_or_default();
    let nightly = state["config"]["updateNightly"].as_bool() == Some(true);
    let latest = update.latest.clone().unwrap_or_default();
    let has_url = latest.url.is_some();
    let order = if nightly {
        has_url.then(|| {
            if same_build(&f.sha, &latest.commit) {
                std::cmp::Ordering::Equal
            } else {
                std::cmp::Ordering::Less
            }
        })
    } else {
        match (semver(&f.version), semver(&latest.version)) {
            (Some(a), Some(b)) if has_url => Some(a.cmp(&b)),
            _ => None,
        }
    };
    let error = if update.phase == UpdatePhase::Error {
        update
            .error
            .clone()
            .filter(|e| !e.is_empty())
            .unwrap_or_else(|| t.t("softwareUpdate.updateFailed", "Update failed"))
    } else {
        String::new()
    };
    let in_flight = !matches!(update.phase, UpdatePhase::Idle | UpdatePhase::Error)
        || os_update::busy(state)
        || state["system"]["powerBusy"].as_bool() == Some(true);
    Plan {
        update,
        nightly,
        order,
        in_flight,
        error,
    }
}

pub fn update(state: &Value, t: &Strings, f: &Facts) -> Vec<Row> {
    let p = plan(state, t, f);
    let latest = p.update.latest.clone().unwrap_or_default();
    let available = if latest.version.is_empty() {
        DASH.to_string()
    } else if p.nightly {
        let short: String = latest.commit.chars().take(7).collect();
        format!("{}{}", latest.version, build_tag(&latest.run, &short))
    } else {
        latest.version.clone()
    };
    let downgrade = p.order == Some(std::cmp::Ordering::Greater);
    let can_update = p.order.is_some_and(|o| o.is_ne()) && !p.in_flight;
    let mut out = vec![
        info(
            t.t("softwareUpdate.installedVersion", "Installed"),
            None,
            format!("{}{}", f.version, build_tag(&f.run, &f.sha)),
        ),
        info(
            t.t("softwareUpdate.availableVersion", "Available"),
            None,
            available,
        ),
        Row {
            kind: RowKind::Switch,
            label: t.t("softwareUpdate.channelNightly", "Nightly"),
            checked: p.nightly,
            enabled: !p.in_flight,
            change: Some(Change::Config(patch(
                "updateNightly",
                Value::from(!p.nightly),
            ))),
            action: Some(Action::CheckUpdate),
            ..Row::default()
        },
        Row {
            kind: RowKind::Button,
            label: t.t("softwareUpdate.check", "Check for Updates"),
            button: t.t("softwareUpdate.refresh", "Refresh"),
            outlined: true,
            enabled: !p.in_flight,
            action: Some(Action::CheckUpdate),
            ..Row::default()
        },
        Row {
            kind: RowKind::Button,
            label: t.t("softwareUpdate.install", "Install"),
            button: if p.order == Some(std::cmp::Ordering::Equal) {
                t.t("softwareUpdate.upToDate", "Up to date")
            } else if downgrade {
                t.t("softwareUpdate.downgrade", "Downgrade")
            } else {
                t.t("softwareUpdate.update", "Update")
            },
            enabled: can_update,
            action: Some(Action::DownloadUpdate),
            ..Row::default()
        },
    ];
    let could_not_check = p.update.checked && !p.update.checking && latest.url.is_none();
    let message = if !p.error.is_empty() {
        p.error.clone()
    } else if could_not_check {
        t.t(
            "softwareUpdate.couldNotCheckLatestRelease",
            "Could not check latest release.",
        )
    } else {
        String::new()
    };
    if !message.is_empty() {
        out.push(Row {
            alert: !p.error.is_empty(),
            ..info(message, None, String::new())
        });
    }
    out.extend(os_update::rows(state, t));
    out
}

pub fn update_dialog(state: &Value, t: &Strings, f: &Facts) -> Option<Dialog> {
    if let Some(dialog) = os_update::dialog(state, t) {
        return Some(dialog);
    }
    let p = plan(state, t, f);
    let phase = p.update.phase;
    if phase == UpdatePhase::Idle {
        return None;
    }
    let pct = (phase == UpdatePhase::Download && p.update.total > 0.0)
        .then(|| (p.update.received / p.update.total * 100.0).round());
    let (key, text) = match phase {
        UpdatePhase::Download => ("downloading", "Downloading"),
        UpdatePhase::Ready => ("readyToInstall", "Ready to install"),
        UpdatePhase::Installing => ("installing", "Installing"),
        UpdatePhase::Relaunching => ("relaunching", "Relaunching"),
        UpdatePhase::Error => ("error", "Error"),
        UpdatePhase::Idle => ("starting", "Starting…"),
    };
    let mut rows = vec![
        info(
            t.t(&format!("softwareUpdate.{key}"), text),
            None,
            String::new(),
        ),
        Row {
            kind: RowKind::Progress,
            level: pct.map_or(0.0, |v| v as f32 / 100.0),
            enabled: true,
            ..Row::default()
        },
    ];
    if let Some(v) = pct {
        rows.push(mono(
            format!("{v}%"),
            format!("{} / {}", human(p.update.received), human(p.update.total)),
        ));
    }
    if !p.error.is_empty() {
        rows.push(Row {
            alert: true,
            ..info(p.error.clone(), None, String::new())
        });
    }
    if matches!(phase, UpdatePhase::Installing | UpdatePhase::Relaunching) {
        rows.push(info(
            t.t(
                "softwareUpdate.restartsAutomaticallyWhenDone",
                "Restarts automatically when done.",
            ),
            None,
            String::new(),
        ));
    }
    let can_abort = match phase {
        UpdatePhase::Download => pct.is_none_or(|v| v < 100.0),
        UpdatePhase::Ready => true,
        _ => false,
    };
    rows.push(Row {
        kind: RowKind::Button,
        button: t.t("softwareUpdate.abort", "Abort"),
        outlined: true,
        enabled: can_abort,
        action: Some(Action::AbortUpdate),
        ..Row::default()
    });
    if phase == UpdatePhase::Ready {
        rows.push(Row {
            kind: RowKind::Button,
            button: t.t("softwareUpdate.installNow", "Install now"),
            enabled: true,
            action: Some(Action::InstallUpdate),
            ..Row::default()
        });
    }
    if phase == UpdatePhase::Error {
        rows.push(Row {
            kind: RowKind::Button,
            button: t.t("softwareUpdate.close", "Close"),
            outlined: true,
            enabled: true,
            local: Some(Local::CloseDialog),
            ..Row::default()
        });
    }
    let downgrade = p.order == Some(std::cmp::Ordering::Greater);
    Some(Dialog {
        title: if downgrade {
            "Software Downgrade"
        } else {
            "Software Update"
        }
        .to_string(),
        rows,
        key: format!("{phase:?}:{}", p.error),
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn facts() -> Facts {
        Facts {
            version: "9.5.0".into(),
            sha: "0f404b2".into(),
            run: "41".into(),
            ..Facts::default()
        }
    }

    #[test]
    fn power_pages_require_a_button_press_not_an_entry_side_effect() {
        use crate::settings::custom::{rows, watch};
        use crate::settings::node::CustomPage;
        for (page, action) in [
            (CustomPage::Restart, Action::Restart),
            (CustomPage::PowerOff, Action::Quit),
        ] {
            assert!(watch(page).is_none());
            let rows = rows(page, &json!({}), &Strings::new("en"), &facts()).unwrap();
            assert_eq!(rows[1].action, Some(action));
            assert!(rows[1].enabled);
            assert!(rows[0].label.contains("Confirm"));
        }
    }

    #[test]
    fn power_pages_show_failures_and_disable_operations_during_updates() {
        let t = Strings::new("en");
        let failed = json!({ "system": { "powerError": "sudo denied", "powerBusy": false } });
        let rows = power(&failed, &t, false);
        assert!(rows[1].enabled);
        assert!(rows.iter().any(|r| r.alert && r.label == "sudo denied"));
        let busy = json!({ "system": { "powerBusy": true } });
        assert!(!power(&busy, &t, true)[1].enabled);
        let mut updating = json!({ "system": { "osUpdate": livi_core_proto::state::OsUpdate {
            enabled: true, phase: livi_core_proto::state::OsUpdatePhase::Staging, ..Default::default()
        } } });
        assert!(!power(&updating, &t, false)[1].enabled);
        updating =
            json!({ "update": Update { phase: UpdatePhase::Installing, ..Default::default() } });
        assert!(!power(&updating, &t, false)[1].enabled);
    }

    fn state(update: Value, nightly: bool) -> Value {
        json!({ "config": { "updateNightly": nightly }, "update": update })
    }

    #[test]
    fn about_shows_the_legal_notices() {
        let rows = about(&Strings::new("en"), &facts());
        let labels: Vec<&str> = rows.iter().map(|r| r.label.as_str()).collect();
        for label in [
            "Source code",
            "Based on",
            "Copyright",
            "License",
            "Warranty",
        ] {
            assert!(labels.contains(&label), "{label} missing");
        }
    }

    #[test]
    fn about_credits_upstream_livi() {
        let rows = about(&Strings::new("en"), &facts());
        let row = rows.iter().find(|r| r.label == "Based on").unwrap();
        assert_eq!(
            format!("{} {}", row.label, row.value),
            "Based on LIVI by Lasse Heitgres (https://github.com/f-io/LIVI)"
        );
    }

    #[test]
    fn a_newer_release_offers_an_update() {
        let s = state(
            json!({ "latest": { "version": "9.6.0", "commit": "abc", "run": "50", "url": "u" },
                "checking": false, "checked": true, "phase": "idle", "received": 0, "total": 0 }),
            false,
        );
        let rows = update(&s, &Strings::new("en"), &facts());
        assert_eq!(rows[0].value, "9.5.0 (#41 · 0f404b2)");
        assert_eq!(rows[4].button, "Update");
        assert!(rows[4].enabled);
        assert!(update_dialog(&s, &Strings::new("en"), &facts()).is_none());
    }

    #[test]
    fn the_same_nightly_is_up_to_date() {
        let s = state(
            json!({ "latest": { "version": "9.5.0", "commit": "0f404b2ffff", "run": "41", "url": "u" },
                "checking": false, "checked": true, "phase": "idle", "received": 0, "total": 0 }),
            true,
        );
        let rows = update(&s, &Strings::new("en"), &facts());
        assert_eq!(rows[4].button, "Up to date");
        assert!(!rows[4].enabled);
    }

    #[test]
    fn a_download_shows_progress_in_the_dialog() {
        let s = state(
            json!({ "latest": { "version": "9.6.0", "commit": "abc", "run": "50", "url": "u" },
                "checking": false, "checked": true, "phase": "download",
                "received": 1048576.0, "total": 4194304.0 }),
            false,
        );
        let d = update_dialog(&s, &Strings::new("en"), &facts()).unwrap();
        assert_eq!(d.rows[0].label, "Downloading");
        assert!((d.rows[1].level - 0.25).abs() < 1e-6);
        assert_eq!(d.rows[2].value, "1.0 MB / 4.0 MB");
        assert_eq!(d.rows[3].action, Some(Action::AbortUpdate));
    }

    #[test]
    fn link_speed_names_the_phy_rate_when_known() {
        let s = json!({ "system": { "linkSpeed": { "downMbps": 42.24, "downRate": 866, "upMbps": 3.0, "upRate": 0 } } });
        let rows = link_speed(&s, &Strings::new("en"));
        assert_eq!(rows[0].value, "42.2 Mbps · 866 PHY");
        assert_eq!(rows[1].value, "3.0 Mbps");
    }
}
