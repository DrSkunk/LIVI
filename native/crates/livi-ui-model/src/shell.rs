// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use livi_base::hex::rgb;
use livi_core_proto::config::{ClockStyle, Config, HandDriveType, UiStyle};
use serde_json::{Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tab {
    Projection,
    Telemetry,
    Media,
    Clock,
    Camera,
    Games,
    MiniDsp,
    Settings,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Look {
    pub tabs: Vec<Tab>,
    pub right_hand: bool,
    pub dark: bool,
    pub primary: Option<[u8; 3]>,
    pub highlight: Option<[u8; 3]>,
    pub background: Option<[u8; 3]>,
    pub text: Option<[u8; 3]>,
    pub zoom: f32,
    pub stream: (i32, i32),
    pub language: String,
    pub style: Style,
    pub clock_style: ClockStyle,
    pub clock_auto_hide: bool,
}

/// Which visual style the UI draws with (`uiStyle` in the config).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Style {
    Standard,
    Comand,
}

pub fn style(config: &Config) -> Style {
    match config.ui_style {
        UiStyle::Standard => Style::Standard,
        UiStyle::Comand => Style::Comand,
    }
}

pub fn tabs(config: &Config) -> Vec<Tab> {
    let side = &config.sidebar_tabs;
    let mut tabs = Vec::new();
    if side.projection {
        tabs.push(Tab::Projection);
    }
    if config.dashboard.main && side.telemetry {
        tabs.push(Tab::Telemetry);
    }
    if config.media.main && side.media {
        tabs.push(Tab::Media);
    }
    if side.clock {
        tabs.push(Tab::Clock);
    }
    if config.camera.main && !config.camera_id.is_empty() && side.camera {
        tabs.push(Tab::Camera);
    }
    if config.games.enabled && side.games {
        tabs.push(Tab::Games);
    }
    if config.minidsp.enabled && side.minidsp {
        tabs.push(Tab::MiniDsp);
    }
    tabs.push(Tab::Settings);
    tabs
}

pub const MIN_UI_HEIGHT: f32 = 292.0;

pub fn ui_scale(base: f32, zoom: f32, physical_height: f32) -> f32 {
    let height = physical_height / base.max(f32::EPSILON);
    let fit = if height > 0.0 {
        (height / MIN_UI_HEIGHT).min(1.0)
    } else {
        1.0
    };
    base * zoom * fit
}

pub const NIGHT_PRIMARY: [u8; 3] = [0xd9, 0x36, 0x36];
pub const NIGHT_HIGHLIGHT: [u8; 3] = [0xa8, 0x28, 0x28];

pub fn look(config: &Config) -> Look {
    look_at(config, &Map::new())
}

pub fn look_at(config: &Config, telemetry: &Map<String, Value>) -> Look {
    let night = telemetry.get("nightMode").and_then(Value::as_bool) == Some(true);
    let dark = config.dark_mode;
    let pick = |on_dark: &Option<String>, on_light: &Option<String>| {
        if dark { on_dark } else { on_light }
            .as_deref()
            .and_then(rgb)
    };
    let positive = |v: u32, fallback: i32| if v > 0 { v as i32 } else { fallback };
    Look {
        tabs: tabs(config),
        right_hand: config.hand == HandDriveType::Rhd,
        dark,
        primary: if night {
            Some(NIGHT_PRIMARY)
        } else {
            pick(&config.primary_color_dark, &config.primary_color_light)
        },
        highlight: if night {
            Some(NIGHT_HIGHLIGHT)
        } else {
            pick(&config.highlight_color_dark, &config.highlight_color_light)
        },
        background: pick(
            &config.background_color_dark,
            &config.background_color_light,
        ),
        text: pick(&config.text_color_dark, &config.text_color_light),
        zoom: if config.ui_zoom_percent > 0 {
            config.ui_zoom_percent as f32 / 100.0
        } else {
            1.0
        },
        stream: (
            positive(config.projection_width, 1280),
            positive(config.projection_height, 720),
        ),
        language: config.language.clone(),
        style: style(config),
        clock_style: config.clock_style,
        clock_auto_hide: config.clock_auto_hide,
    }
}

#[cfg(test)]
mod tests {
    use livi_core_proto::config::{SidebarTabs, defaults};
    use serde_json::json;

    use super::*;

    fn telemetry(night: bool) -> Map<String, Value> {
        json!({ "nightMode": night }).as_object().unwrap().clone()
    }

    fn plain() -> Config {
        let mut config = defaults();
        config.dashboard.main = false;
        config.media.main = true;
        config.camera.main = true;
        config.camera_id.clear();
        config.games.enabled = false;
        config.minidsp.enabled = false;
        config.sidebar_tabs = SidebarTabs::default();
        config
    }

    #[test]
    fn tabs_follow_the_config() {
        let mut config = plain();
        assert_eq!(
            tabs(&config),
            vec![Tab::Projection, Tab::Media, Tab::Clock, Tab::Settings]
        );
        config.dashboard.main = true;
        config.camera_id = "cam0".into();
        assert_eq!(
            tabs(&config),
            vec![
                Tab::Projection,
                Tab::Telemetry,
                Tab::Media,
                Tab::Clock,
                Tab::Camera,
                Tab::Settings
            ]
        );
        let mut config = plain();
        config.games.enabled = true;
        config.minidsp.enabled = true;
        assert_eq!(
            tabs(&config),
            vec![
                Tab::Projection,
                Tab::Media,
                Tab::Clock,
                Tab::Games,
                Tab::MiniDsp,
                Tab::Settings
            ]
        );
    }

    #[test]
    fn sidebar_tabs_can_be_hidden_without_disabling_their_features() {
        let mut config = plain();
        config.dashboard.main = true;
        config.sidebar_tabs.projection = false;
        config.sidebar_tabs.telemetry = false;
        config.sidebar_tabs.media = false;
        config.sidebar_tabs.clock = false;
        assert_eq!(tabs(&config), vec![Tab::Settings]);
    }

    #[test]
    fn the_scale_zooms_and_shrinks_below_the_minimum_height() {
        assert_eq!(ui_scale(2.0, 1.0, 1440.0), 2.0);
        assert_eq!(ui_scale(1.0, 1.5, 1440.0), 1.5);
        assert_eq!(ui_scale(1.0, 0.8, 720.0), 0.8);
        assert_eq!(ui_scale(1.0, 1.0, 146.0), 0.5);
        assert_eq!(ui_scale(2.0, 1.0, 292.0), 1.0);
        assert_eq!(ui_scale(1.0, 1.0, 0.0), 1.0);
    }

    #[test]
    fn colors_and_zoom() {
        let mut config = defaults();
        config.dark_mode = true;
        config.primary_color_dark = Some("#00ADAD".into());
        config.ui_zoom_percent = 200;
        config.hand = HandDriveType::Rhd;
        let l = look(&config);
        assert_eq!(l.primary, Some([0, 0xad, 0xad]));
        assert_eq!(l.zoom, 2.0);
        assert!(l.right_hand);
    }

    #[test]
    fn night_swaps_the_accents_for_low_glare_red() {
        let mut config = defaults();
        config.dark_mode = true;
        config.primary_color_dark = Some("#00ADAD".into());
        config.highlight_color_dark = None;
        let day = look_at(&config, &telemetry(false));
        assert_eq!(day.primary, Some([0, 0xad, 0xad]));
        assert_eq!(day.highlight, None);
        let night = look_at(&config, &telemetry(true));
        assert_eq!(night.primary, Some(NIGHT_PRIMARY));
        assert_eq!(night.highlight, Some(NIGHT_HIGHLIGHT));
        assert_eq!(look(&config), day);
    }

    #[test]
    fn the_style_and_clock_follow_the_config() {
        let mut config = defaults();
        assert_eq!(look(&config).style, Style::Comand);
        assert_eq!(look(&config).clock_style, ClockStyle::Classic);
        assert!(!look(&config).clock_auto_hide);
        config.ui_style = UiStyle::Standard;
        config.clock_style = ClockStyle::Amber;
        config.clock_auto_hide = true;
        let l = look(&config);
        assert_eq!(l.style, Style::Standard);
        assert_eq!(l.clock_style, ClockStyle::Amber);
        assert!(l.clock_auto_hide);
    }
}
