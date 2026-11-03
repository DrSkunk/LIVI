// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use livi_core_proto::config::{CarType, EvConnectorType};
use livi_core_proto::message::Action;
use serde_json::Value;

use super::info;
use crate::i18n::Strings;
use crate::settings::view::{Row, RowKind, Tool};

fn finite(v: &Value) -> Option<f64> {
    v.as_f64().filter(|f| f.is_finite())
}

pub fn readings(state: &Value, t: &Strings) -> Vec<Row> {
    let tel = &state["telemetry"];
    let config = &state["config"];
    let capacity = finite(&tel["batteryCapacityKwh"]);
    let level = finite(&tel["batteryLevelKwh"]);
    let electric = serde_json::from_value::<CarType>(config["carType"].clone())
        .is_ok_and(|c| c == CarType::Electric);
    let charge = match (level, capacity) {
        (Some(l), Some(c)) if c != 0.0 => Some(l / c * 100.0),
        _ if electric => finite(&tel["fuelPct"]),
        _ => None,
    };
    let connectors: Vec<String> =
        serde_json::from_value::<Vec<EvConnectorType>>(config["evConnectorTypes"].clone())
            .unwrap_or_default()
            .iter()
            .map(|c| format!("{c:?}"))
            .collect();
    let mut out = Vec::new();
    if let Some(c) = capacity {
        out.push(info(
            t.t("settings.batteryCapacity", "Battery Capacity"),
            None,
            format!("{c:.1} kWh"),
        ));
    }
    if let Some(c) = charge {
        out.push(info(
            t.t("settings.stateOfCharge", "State of Charge"),
            None,
            format!("{} %", c.round()),
        ));
    }
    if !connectors.is_empty() {
        out.push(info(
            t.t("settings.evConnectors", "Charging Connectors"),
            None,
            connectors.join(", "),
        ));
    }
    out
}

pub fn obd2(state: &Value, t: &Strings) -> Vec<Row> {
    let data = &state["telemetry"]["obd2"];
    let status = match data["status"].as_str() {
        Some("disabled") => "Disabled",
        Some("connecting") => "Connecting",
        Some("available") => "Available",
        Some("unsupported") => "Unsupported",
        Some("stale") => "Stale",
        Some("disconnected") => "Disconnected",
        Some("canError") => "CAN error",
        _ => "Not configured",
    };
    let mut out = vec![info(
        t.t("settings.obd2Status", "OBD-II status"),
        None,
        status.into(),
    )];
    for (key, label) in [
        ("interface", "CAN interface"),
        ("bitrate", "Active bitrate (bit/s)"),
        ("ecu", "ECU response ID"),
        ("lastResponseAgeMs", "Last response age (ms)"),
        ("requests", "Requests"),
        ("timeouts", "Timeouts"),
        ("errors", "CAN errors"),
        ("error", "Last error"),
    ] {
        if let Some(value) = data.get(key).filter(|v| !v.is_null()) {
            let shown = value
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| value.to_string());
            out.push(info(
                t.t(&format!("settings.obd2_{key}"), label),
                None,
                shown,
            ));
        }
    }
    let pids = data["supportedPids"]
        .as_array()
        .map(|pids| {
            pids.iter()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_else(|| "—".into());
    out.push(info(
        t.t("settings.obd2SupportedPids", "Supported PIDs"),
        None,
        pids,
    ));
    if let Some(signals) = data["signals"].as_object() {
        for (key, signal) in signals {
            let value = finite(&state["telemetry"][key]);
            let unit = signal["unit"].as_str().unwrap_or("");
            let freshness = signal["state"].as_str().unwrap_or("stale");
            let shown = match value.filter(|_| freshness == "available") {
                Some(value) => format!("{value:.2} {unit} · {freshness}"),
                None => format!("— {unit} · {freshness}"),
            };
            out.push(info(key.clone(), None, shown));
        }
    }
    out
}

fn layout_name(cluster: &Value, id: &str) -> String {
    cluster["theme"]["displays"]
        .as_array()
        .into_iter()
        .flatten()
        .flat_map(|d| d["layouts"].as_array().into_iter().flatten())
        .find(|l| l["id"].as_str() == Some(id))
        .and_then(|l| l["name"].as_str())
        .unwrap_or(id)
        .to_string()
}

pub fn layouts(state: &Value, t: &Strings) -> Vec<Row> {
    let cluster = &state["cluster"];
    let arranged = cluster["arranged"].as_array().cloned().unwrap_or_default();
    let last = arranged.len().saturating_sub(1);
    arranged
        .iter()
        .enumerate()
        .map(|(i, l)| {
            let id = l["id"].as_str().unwrap_or("").to_string();
            let on = l["on"].as_bool().unwrap_or(false);
            let name = layout_name(cluster, &id);
            let label = t.t(&format!("settings.layout_{}", id.replace('.', "_")), &name);
            let mv = |icon: &'static str, key: &str, text: &str, by: i32, enabled: bool| Tool {
                icon,
                label: t.t(key, text),
                on: false,
                tint: None,
                enabled,
                switch: false,
                action: Action::MoveClusterLayout {
                    layout: id.clone(),
                    by,
                },
            };
            Row {
                kind: RowKind::Item,
                label: label.clone(),
                enabled: true,
                tools: vec![
                    Tool {
                        icon: "",
                        label,
                        on,
                        tint: None,
                        enabled: true,
                        switch: true,
                        action: Action::ShowClusterLayout {
                            layout: id.clone(),
                            on: !on,
                        },
                    },
                    mv("ExpandLess", "settings.moveUp", "Move up", -1, i > 0),
                    mv("ExpandMore", "settings.moveDown", "Move down", 1, i < last),
                ],
                ..Row::default()
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn an_electric_car_reads_its_charge_from_the_fuel_level() {
        let s = json!({ "telemetry": { "fuelPct": 63.4 }, "config": { "carType": 10, "evConnectorTypes": [2, 5] } });
        let rows = readings(&s, &Strings::new("en"));
        assert_eq!(rows[0].value, "63 %");
        assert_eq!(rows[1].value, "Mennekes, Combo2");
    }

    #[test]
    fn layouts_switch_and_move() {
        let s = json!({ "cluster": {
            "theme": { "displays": [ { "layouts": [ { "id": "x.one", "name": "One" } ] } ] },
            "arranged": [ { "id": "x.one", "on": true }, { "id": "x.two", "on": false } ] } });
        let rows = layouts(&s, &Strings::new("en"));
        assert_eq!(rows[0].label, "One");
        assert_eq!(rows[1].label, "x.two");
        assert!(rows[0].tools[0].switch && rows[0].tools[0].on);
        assert!(!rows[0].tools[1].enabled && !rows[1].tools[2].enabled);
    }

    #[test]
    fn obd_diagnostics_distinguish_zero_stale_unsupported_and_errors() {
        let s = json!({"telemetry": {
            "speedKph": 0, "rpm": null,
            "obd2": {
                "status": "available", "interface": "can0", "bitrate": 500000,
                "supportedPids": ["0C", "0D"], "timeouts": 2,
                "signals": {
                    "speedKph": {"state":"available","unit":"km/h"},
                    "rpm": {"state":"stale","unit":"rpm"},
                    "oilC": {"state":"unsupported","unit":"C"}
                }
            }
        }});
        let rows = obd2(&s, &Strings::new("en"));
        assert_eq!(rows[0].value, "Available");
        assert!(rows.iter().any(|r| r.value == "0.00 km/h · available"));
        assert!(rows.iter().any(|r| r.value == "— rpm · stale"));
        assert!(rows.iter().any(|r| r.value == "— C · unsupported"));
        let error = json!({"telemetry":{"obd2":{"status":"canError","error":"can0 down"}}});
        assert_eq!(obd2(&error, &Strings::new("en"))[0].value, "CAN error");
    }
}
