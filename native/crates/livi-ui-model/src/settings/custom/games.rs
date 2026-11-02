// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use livi_core_proto::config::DEFAULT_ROM_DIRECTORY;
use livi_core_proto::message::Action;
use serde_json::Value;

use crate::i18n::Strings;
use crate::settings::custom::files::Wanted;
use crate::settings::view::{Local, Row, RowKind};

pub fn rows(state: &Value, t: &Strings) -> Vec<Row> {
    let importing = state["games"]["importing"].as_bool() == Some(true);
    let busy = importing
        || state["games"]["run"]
            .as_str()
            .is_some_and(|run| run != "idle");
    let mut rows = vec![
        Row {
            kind: RowKind::Info,
            label: t.t("games.addHint", "Choose a ROM from local storage or a mounted USB drive. It is copied into your library; existing games are never replaced. Use a gamepad to play."),
            enabled: true,
            ..Row::default()
        },
        Row {
            kind: RowKind::Button,
            label: t.t("games.addGames", "Add games"),
            button: t.t("games.browse", "Browse"),
            enabled: !busy,
            local: Some(Local::Browse(Wanted::Game)),
            ..Row::default()
        },
        Row {
            kind: RowKind::Button,
            label: t.t("games.scanFolder", "Scan games folder"),
            button: t.t("games.rescan", "Rescan"),
            enabled: !busy,
            action: Some(Action::GamesImport),
            ..Row::default()
        },
        Row {
            kind: RowKind::Info,
            label: t.t("settings.romDirectory", "ROM Directory"),
            value: state["config"]["games"]["romDirectory"]
                .as_str()
                .unwrap_or(DEFAULT_ROM_DIRECTORY)
                .to_string(),
            enabled: true,
            mono: true,
            ..Row::default()
        },
        Row {
            kind: RowKind::Button,
            label: t.t("games.advanced", "Full RetroArch settings"),
            button: t.t("games.openRetroArch", "Open RetroArch"),
            enabled: !busy,
            action: Some(Action::GamesOpenRetroArch),
            ..Row::default()
        },
    ];
    let games = crate::games::read(state);
    let notice = if let Some(error) = games.error {
        Some((error, true))
    } else if importing {
        Some((t.t("games.importing", "Importing…"), false))
    } else {
        games
            .last_import
            .map(|import| (crate::games::notice(&import, &|k, v| t.t(k, v)), false))
    };
    if let Some((label, alert)) = notice {
        rows.insert(
            0,
            Row {
                kind: RowKind::Info,
                label,
                alert,
                enabled: true,
                ..Row::default()
            },
        );
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn library_tools_show_the_configured_path_and_keep_advanced_settings_available() {
        let rows = rows(
            &json!({"config": {"games": {"romDirectory": "/data/games/roms"}}}),
            &Strings::default(),
        );
        assert!(rows.iter().any(|r| r.value == "/data/games/roms"));
        assert!(
            rows.iter()
                .any(|r| r.local == Some(Local::Browse(Wanted::Game)))
        );
        assert!(
            rows.iter()
                .any(|r| r.action == Some(Action::GamesOpenRetroArch))
        );
    }

    #[test]
    fn imports_disable_tools_and_errors_are_visible() {
        let rows = rows(
            &json!({"games": {"importing": true, "error": "Disk full"}}),
            &Strings::default(),
        );
        assert!(rows[0].alert);
        assert_eq!(rows[0].label, "Disk full");
        assert!(
            rows.iter()
                .filter(|r| r.kind == RowKind::Button)
                .all(|r| !r.enabled)
        );
    }
}
