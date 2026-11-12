// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

use livi_core::{Exit, Instance, Paths, Resources, log_file, telemetry_cli};
use livi_core_proto::LIFELINE_ENV;
use tokio::sync::Notify;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        None => {}
        Some("telemetry") => return telemetry_cli::run(&args[1..]),
        Some(arg) => {
            eprintln!("livi-core: unknown argument {arg}, livi-core takes none or telemetry");
            return ExitCode::FAILURE;
        }
    }
    let resources = Resources::from_env();
    if let Some(root) = &resources.gstreamer {
        for (name, value) in livi_core::resources::gst_env(root) {
            // SAFETY: startup is single-threaded, before Tokio or GStreamer is initialized.
            unsafe { std::env::set_var(name, value) };
        }
    }
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("[core] no runtime: {e}");
            return ExitCode::FAILURE;
        }
    };
    let outcome = runtime.block_on(start(resources));
    runtime.shutdown_timeout(Duration::from_secs(2));
    let code = match outcome {
        Ok(Exit::Quit | Exit::PowerOff) => ExitCode::SUCCESS,
        Ok(Exit::Restart(_)) if cfg!(target_os = "macos") => {
            println!("[core] the app starts again");
            ExitCode::from(RELAUNCH_THE_APP)
        }
        Ok(Exit::Restart(program)) => restart(program),
        Err(e) => {
            eprintln!("[core] {e}");
            ExitCode::FAILURE
        }
    };
    log_file::finish();
    code
}

const RELAUNCH_THE_APP: u8 = 75;

fn restart(program: Option<PathBuf>) -> ExitCode {
    println!("[core] restarting");
    log_file::finish();
    let err = match program.map_or_else(std::env::current_exe, Ok) {
        Ok(exe) => std::process::Command::new(exe).exec(),
        Err(e) => e,
    };
    eprintln!("[core] cannot restart: {err}");
    ExitCode::FAILURE
}

async fn start(resources: Resources) -> Result<Exit, String> {
    // SAFETY: geteuid has no preconditions.
    let uid = unsafe { libc::geteuid() };
    let instance = Instance::claim(Paths::from_env(uid)?)?;
    let ui_gone = Arc::new(Notify::new());
    if std::env::var(LIFELINE_ENV).is_ok_and(|v| v == "1") {
        let ui_gone = ui_gone.clone();
        log_file::follow_ui(move || ui_gone.notify_one());
    }
    let stop = async move {
        tokio::select! {
            _ = shutdown_signal() => {}
            _ = ui_gone.notified() => println!("[core] the UI that started core is gone"),
        }
    };
    livi_core::run(instance, resources, stop).await
}

async fn shutdown_signal() {
    let Ok(mut term) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
    else {
        let _ = tokio::signal::ctrl_c().await;
        return;
    };
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {}
        _ = term.recv() => {}
    }
}
