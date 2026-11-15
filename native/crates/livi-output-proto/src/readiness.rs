// SPDX-FileCopyrightText: 2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

//! Private compositor control reply, not an external health-check socket.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PresentedOutput {
    pub compositor: u32,
    pub ui: u32,
    pub connector: String,
    pub width: u32,
    pub height: u32,
    pub transform: String,
    pub scale: u32,
}

impl PresentedOutput {
    pub fn line(&self) -> String {
        format!(
            "presented {} {} {} {} {} {} {}\n",
            self.compositor,
            self.ui,
            self.connector,
            self.width,
            self.height,
            self.transform,
            self.scale
        )
    }

    pub fn parse(line: &str) -> Option<Self> {
        let fields: Vec<_> = line.split_whitespace().collect();
        let [
            "presented",
            compositor,
            ui,
            connector,
            width,
            height,
            transform,
            scale,
        ] = fields.as_slice()
        else {
            return None;
        };
        let report = Self {
            compositor: compositor.parse().ok()?,
            ui: ui.parse().ok()?,
            connector: connector.to_string(),
            width: width.parse().ok()?,
            height: height.parse().ok()?,
            transform: transform.to_string(),
            scale: scale.parse().ok()?,
        };
        (report.compositor > 0
            && report.ui > 0
            && report.width > 0
            && report.height > 0
            && report.scale == 1
            && matches!(*transform, "normal" | "90" | "180" | "270"))
        .then_some(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_and_fail_closed() {
        let line = "presented 12 13 HDMI-A-1 400 1280 90 1\n";
        assert_eq!(PresentedOutput::parse(line).unwrap().line(), line);
        for line in [
            "presented -",
            "presented 12 0 HDMI-A-1 400 1280 90 1",
            "presented 12 13 HDMI-A-1 400 1280 90 2",
            "presented 12 13 HDMI-A-1 400 1280 90 1 extra",
        ] {
            assert!(PresentedOutput::parse(line).is_none());
        }
    }
}
