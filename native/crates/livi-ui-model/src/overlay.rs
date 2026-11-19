// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::collections::BTreeSet;

use livi_core_proto::state::{DeviceStatus, DeviceView, HostPower, State};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VolumeIcon {
    Off,
    Down,
    Up,
}

pub fn volume_icon(level: f64) -> VolumeIcon {
    if level <= 0.0 {
        VolumeIcon::Off
    } else if level < 0.5 {
        VolumeIcon::Down
    } else {
        VolumeIcon::Up
    }
}

pub fn percent(level: f64) -> u32 {
    (level.clamp(0.0, 1.0) * 100.0).round() as u32
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PowerText {
    pub title: String,
    pub detail: String,
}

pub fn power_text(power: HostPower, tr: impl Fn(&str, &str) -> String) -> PowerText {
    match power {
        HostPower::IgnitionOff { seconds_remaining } => PowerText {
            title: tr("power.ignitionOff", "Ignition off"),
            detail: tr("power.shuttingDownIn", "Shutting down in {{seconds}} s")
                .replace("{{seconds}}", &seconds_remaining.to_string()),
        },
        HostPower::Poweroff => PowerText {
            title: tr("power.shuttingDown", "Shutting down..."),
            detail: String::new(),
        },
        HostPower::Reboot => PowerText {
            title: tr("power.restarting", "Restarting..."),
            detail: String::new(),
        },
    }
}

pub fn enabled(state: &State) -> bool {
    state.config.overlay_messages
}

#[derive(Default)]
pub struct Volume {
    seen: Option<f64>,
}

impl Volume {
    pub fn update(&mut self, state: &State) -> Option<f64> {
        let level = Some(state.config.hu_volume);
        let before = std::mem::replace(&mut self.seen, level);
        match (before, level) {
            (Some(b), Some(l)) if b != l && enabled(state) => Some(l),
            _ => None,
        }
    }
}

fn name(d: &DeviceView) -> Option<String> {
    d.name
        .clone()
        .filter(|n| !n.is_empty())
        .or_else(|| d.model.clone().filter(|m| !m.is_empty()))
}

#[derive(Default)]
pub struct Phone {
    seen: Option<(BTreeSet<String>, Option<String>)>,
}

impl Phone {
    pub fn update(&mut self, state: &State) -> Option<String> {
        let list = &state.devices;
        let connected: BTreeSet<String> = list
            .iter()
            .filter(|d| d.status != DeviceStatus::Offline)
            .map(|d| d.id.clone())
            .collect();
        let active = list.iter().find(|d| d.status == DeviceStatus::Active);
        let before = self
            .seen
            .replace((connected.clone(), active.map(|d| d.id.clone())))?;
        let joined = list
            .iter()
            .find(|d| connected.contains(&d.id) && !before.0.contains(&d.id));
        let switched = active.filter(|a| before.1.as_deref() != Some(a.id.as_str()));
        joined
            .or(switched)
            .and_then(name)
            .filter(|_| enabled(state))
    }
}

pub fn cycled(state: &State) -> Option<String> {
    if state.sessions.total > 1 || !enabled(state) {
        return None;
    }
    state
        .devices
        .iter()
        .find(|d| d.status == DeviceStatus::Active)
        .and_then(name)
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::*;
    use crate::testing::state;

    fn with_volume(v: f64) -> State {
        state(json!({ "config": { "huVolume": v } }))
    }

    #[test]
    fn power_text_counts_down_ignition_off_in_english() {
        let en = livi_i18n::Strings::new("en");
        let tr = |k: &str, t: &str| en.t(k, t);
        let counting = power_text(
            HostPower::IgnitionOff {
                seconds_remaining: 7,
            },
            tr,
        );
        assert_eq!(counting.title, "Ignition off");
        assert_eq!(counting.detail, "Shutting down in 7 s");
        assert_eq!(power_text(HostPower::Reboot, tr).title, "Restarting...");
    }

    #[test]
    fn volume_shows_only_on_a_change() {
        let mut w = Volume::default();
        assert_eq!(w.update(&with_volume(0.5)), None);
        assert_eq!(w.update(&with_volume(0.5)), None);
        assert_eq!(w.update(&with_volume(0.6)), Some(0.6));
        let off = state(json!({ "config": { "huVolume": 0.2, "overlayMessages": false } }));
        assert_eq!(w.update(&off), None);
    }

    #[test]
    fn volume_icon_and_percent() {
        assert_eq!(volume_icon(0.0), VolumeIcon::Off);
        assert_eq!(volume_icon(0.3), VolumeIcon::Down);
        assert_eq!(volume_icon(0.5), VolumeIcon::Up);
        assert_eq!(percent(0.954), 95);
        assert_eq!(percent(1.4), 100);
    }

    fn phones(list: Value) -> State {
        state(json!({ "devices": list, "sessions": { "total": 1 } }))
    }

    #[test]
    fn phone_names_a_joined_or_newly_active_phone_but_not_those_at_start() {
        let mut w = Phone::default();
        let start = phones(json!([{ "id": "a", "name": "Anna", "status": "active" }]));
        assert_eq!(w.update(&start), None);
        let joined = phones(json!([
            { "id": "a", "name": "Anna", "status": "active" },
            { "id": "b", "model": "Pixel 8", "status": "available" }
        ]));
        assert_eq!(w.update(&joined).as_deref(), Some("Pixel 8"));
        let switched = phones(json!([
            { "id": "a", "name": "Anna", "status": "available" },
            { "id": "b", "model": "Pixel 8", "status": "active" }
        ]));
        assert_eq!(w.update(&switched).as_deref(), Some("Pixel 8"));
        assert_eq!(w.update(&switched), None);
        assert_eq!(cycled(&switched).as_deref(), Some("Pixel 8"));
    }
}
