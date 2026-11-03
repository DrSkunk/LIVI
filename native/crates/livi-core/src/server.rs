// SPDX-FileCopyrightText: 2025-2026 Lasse Heitgres
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional terms: see NOTICE

use std::io;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use livi_core_proto::PROTOCOL;
use livi_core_proto::frame::{Decoder, FrameError, encode};
use livi_core_proto::message::{Action, FromCore, MediaControl, OsUpdateCommand, ToCore};
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::unix::OwnedWriteHalf;
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::{Mutex, Notify, broadcast, mpsc, oneshot, watch};

use crate::config_file::{ConfigFile, apply_patch};
use crate::dab::DabAsk;
use crate::dongle::LinkSpeedViewer;
use crate::games::GamesAsk;
use crate::hub::{Frame, Hub};
use crate::minidsp::MiniDspAsk;
use crate::network::{Join, NetworkAsk};
use crate::projection::{UiCommand, UiSenders};
use crate::spectrum::Viewer;
use crate::status_file::Activity;
use crate::update::UpdateAsk;

pub struct Core {
    pub hub: Arc<Hub>,
    config_file: ConfigFile,
    config_writes: Mutex<()>,
    pub quit: Arc<Notify>,
    pub restart: AtomicBool,
    pub ui_path: watch::Sender<String>,
    pub open_page: broadcast::Sender<String>,
    pub relaunch: std::sync::Mutex<Option<PathBuf>>,
    asks: UiSenders,
    uid: u32,
    mfi_dir: PathBuf,
    minidsp: tokio::sync::mpsc::UnboundedSender<MiniDspAsk>,
    minidsp_asks: std::sync::Mutex<Option<tokio::sync::mpsc::UnboundedReceiver<MiniDspAsk>>>,
    os_update: mpsc::Sender<OsUpdateCommand>,
    os_update_asks: std::sync::Mutex<Option<mpsc::Receiver<OsUpdateCommand>>>,
    network: tokio::sync::mpsc::UnboundedSender<NetworkAsk>,
    network_asks: std::sync::Mutex<Option<tokio::sync::mpsc::UnboundedReceiver<NetworkAsk>>>,
}

impl Core {
    pub fn new(
        hub: Hub,
        config_file: ConfigFile,
        uid: u32,
        quit: Arc<Notify>,
        asks: UiSenders,
    ) -> Self {
        let (minidsp, minidsp_asks) = tokio::sync::mpsc::unbounded_channel();
        let (os_update, os_update_asks) = mpsc::channel(1);
        let (network, network_asks) = tokio::sync::mpsc::unbounded_channel();
        Self {
            hub: Arc::new(hub),
            config_file,
            config_writes: Mutex::new(()),
            quit,
            restart: AtomicBool::new(false),
            relaunch: std::sync::Mutex::new(None),
            ui_path: watch::channel(String::new()).0,
            open_page: broadcast::channel(8).0,
            asks,
            uid,
            mfi_dir: PathBuf::new(),
            minidsp,
            minidsp_asks: std::sync::Mutex::new(Some(minidsp_asks)),
            os_update,
            os_update_asks: std::sync::Mutex::new(Some(os_update_asks)),
            network,
            network_asks: std::sync::Mutex::new(Some(network_asks)),
        }
    }

    pub fn take_os_update_asks(&self) -> Option<mpsc::Receiver<OsUpdateCommand>> {
        self.os_update_asks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
    }

    fn ask_os_update(&self, command: OsUpdateCommand) -> Result<(), String> {
        let system = self.hub.watch().borrow().system.clone();
        if system.power_busy {
            return Err("A host power request is in progress".into());
        }
        crate::os_update::allowed(&system.os_update, command)?;
        self.os_update
            .try_send(command)
            .map_err(|e| format!("OS updater unavailable or busy: {e}"))
    }

    /// The MiniDSP asks, for the one task that serves them.
    pub fn take_minidsp_asks(&self) -> Option<tokio::sync::mpsc::UnboundedReceiver<MiniDspAsk>> {
        self.minidsp_asks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
    }

    fn ask_minidsp(&self, ask: MiniDspAsk) -> Result<(), String> {
        self.minidsp
            .send(ask)
            .map_err(|_| "MiniDSP is not available".to_string())
    }

    /// The network asks, for the one task that serves them.
    pub fn take_network_asks(&self) -> Option<tokio::sync::mpsc::UnboundedReceiver<NetworkAsk>> {
        self.network_asks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
    }

    fn ask_network(&self, ask: NetworkAsk) -> Result<(), String> {
        self.network
            .send(ask)
            .map_err(|_| "network settings are not available".to_string())
    }

    pub fn with_mfi(mut self, dir: PathBuf) -> Self {
        self.mfi_dir = dir;
        self
    }

    pub fn open_app(&self, target: String) {
        let _ = self.asks.commands.send(UiCommand::OpenApp(target));
    }

    pub async fn refresh_mfi(&self) -> Result<(), String> {
        let view = crate::mfi::read(&self.mfi_dir);
        let files = crate::mfi::digest(&self.mfi_dir);
        self.hub.update(|s| s.mfi = view);
        if self.hub.config().car_play_mfi_files == files {
            return Ok(());
        }
        self.set_config(&serde_json::json!({ "carPlayMfiFiles": files }))
            .await
    }

    pub async fn set_config(&self, patch: &Value) -> Result<(), String> {
        let _one_at_a_time = self.config_writes.lock().await;
        let next = apply_patch(&self.hub.config(), patch)?;
        self.config_file
            .save(&next)
            .map_err(|e| format!("not saved: {e}"))?;
        self.hub.update(|s| s.config = next);
        Ok(())
    }

    pub fn activity(&self) -> watch::Receiver<Activity> {
        self.asks.activity.clone()
    }

    fn ask_update(&self, ask: UpdateAsk) -> Result<(), String> {
        let system = self.hub.watch().borrow().system.clone();
        let os = &system.os_update;
        if matches!(ask, UpdateAsk::Download | UpdateAsk::Install)
            && (os.phase != livi_core_proto::state::OsUpdatePhase::Idle
                || os.confirm_reboot
                || system.power_busy)
        {
            return Err("An OS update is in progress".into());
        }
        self.asks
            .update
            .send(ask)
            .map_err(|_| "updates are not available".to_string())
    }

    pub fn relaunch(&self, program: PathBuf) {
        *self.relaunch.lock().unwrap_or_else(|e| e.into_inner()) = Some(program);
        self.restart.store(true, Ordering::SeqCst);
        self.quit.notify_one();
    }

    pub fn media(&self, control: MediaControl) {
        if !self.dab_media(control) {
            let _ = self.asks.commands.send(UiCommand::Media(control));
        }
    }

    fn ask_dab(&self, ask: DabAsk) -> Result<(), String> {
        self.asks
            .dab
            .send(ask)
            .map_err(|_| "DAB+ is not available".to_string())
    }

    fn ask_games(&self, ask: GamesAsk) -> Result<(), String> {
        self.asks
            .games
            .send(ask)
            .map_err(|_| "games are not available".to_string())
    }

    fn dab_media(&self, control: MediaControl) -> bool {
        let ask = {
            let state = self.hub.watch();
            let s = state.borrow();
            crate::dab::media_ask(&s.dab, s.sessions.active.is_some(), control)
        };
        ask.is_some_and(|ask| self.ask_dab(ask).is_ok())
    }

    pub fn goodbye(&self) -> oneshot::Receiver<()> {
        let (done, heard) = oneshot::channel();
        let _ = self.asks.goodbye.send(done);
        heard
    }

    async fn power(&self, action: crate::power::Power) -> Result<(), String> {
        self.power_with(crate::power::request(action)).await
    }

    async fn power_with(
        &self,
        request: impl std::future::Future<Output = Result<(), String>>,
    ) -> Result<(), String> {
        let mut allowed = Ok(());
        self.hub.update(|s| {
            if s.system.power_busy {
                allowed = Err("A host power request is already in progress".to_string());
            } else if s.system.os_update.phase != livi_core_proto::state::OsUpdatePhase::Idle
                || s.system.os_update.confirm_reboot
                || !matches!(
                    s.update.phase,
                    livi_core_proto::state::UpdatePhase::Idle
                        | livi_core_proto::state::UpdatePhase::Error
                )
            {
                allowed =
                    Err("Finish the software update operation before changing host power".into());
                s.system.power_error = allowed.as_ref().err().cloned();
            } else {
                s.system.power_busy = true;
                s.system.power_error = None;
            }
        });
        allowed?;
        let result = request.await;
        if let Err(e) = &result {
            eprintln!("[power] {e}");
            self.hub.update(|s| {
                s.system.power_busy = false;
                s.system.power_error = Some(e.clone());
            });
        }
        result
    }

    async fn act(&self, action: Action) -> Result<(), String> {
        match action {
            Action::SetConfig { patch } => self.set_config(&patch).await,
            Action::Quit => {
                if crate::power::owns_host() {
                    return self.power(crate::power::Power::Off).await;
                }
                self.quit.notify_one();
                Ok(())
            }
            Action::Restart => {
                if crate::power::owns_host() {
                    return self.power(crate::power::Power::Reboot).await;
                }
                self.restart.store(true, Ordering::SeqCst);
                self.quit.notify_one();
                Ok(())
            }
            Action::Show { screen, front } => {
                self.asks.wants.send_modify(|w| *w.get_mut(screen) = front);
                Ok(())
            }
            Action::Media { control } => {
                self.media(control);
                Ok(())
            }
            Action::ImportMfi { file, path } => {
                match crate::mfi::import(&self.mfi_dir, file, std::path::Path::new(&path)) {
                    Ok(()) => self.refresh_mfi().await,
                    Err(e) => {
                        self.hub.update(|s| s.mfi.error = Some(e.clone()));
                        Err(e)
                    }
                }
            }
            Action::RemoveMfi { file } => {
                crate::mfi::remove(&self.mfi_dir, file)?;
                self.refresh_mfi().await
            }
            Action::DabScan => self.ask_dab(DabAsk::Scan),
            Action::DabStopScan => self.ask_dab(DabAsk::StopScan),
            Action::DabPlay { service_id } => self.ask_dab(DabAsk::Play(service_id)),
            Action::DabResume => self.ask_dab(DabAsk::Resume),
            Action::DabPause => self.ask_dab(DabAsk::Pause),
            Action::DabStop => self.ask_dab(DabAsk::Stop),
            Action::DabFavorite {
                service_id,
                favorite,
            } => self.ask_dab(DabAsk::Favorite {
                service: service_id,
                favorite,
            }),
            Action::DabHide { service_id, hidden } => self.ask_dab(DabAsk::Hide {
                service: service_id,
                hidden,
            }),
            Action::DabMove { service_id, by } => self.ask_dab(DabAsk::Move {
                service: service_id,
                by,
            }),
            Action::Seek { position_ms } => {
                let _ = self.asks.commands.send(UiCommand::Seek(position_ms));
                Ok(())
            }
            Action::NextDevice => {
                let _ = self.asks.commands.send(UiCommand::NextDevice);
                Ok(())
            }
            Action::SelectClusterLayout { layout } => {
                let _ = self
                    .asks
                    .commands
                    .send(UiCommand::SelectClusterLayout(layout));
                Ok(())
            }
            Action::StepClusterLayout { by } => {
                let _ = self.asks.commands.send(UiCommand::StepClusterLayout(by));
                Ok(())
            }
            Action::MoveClusterLayout { layout, by } => {
                let _ = self
                    .asks
                    .commands
                    .send(UiCommand::MoveClusterLayout(layout, by));
                Ok(())
            }
            Action::ShowClusterLayout { layout, on } => {
                let _ = self
                    .asks
                    .commands
                    .send(UiCommand::ShowClusterLayout(layout, on));
                Ok(())
            }
            Action::SelectDevice { id } => {
                let _ = self.asks.commands.send(UiCommand::SelectDevice(id));
                Ok(())
            }
            Action::ForgetDevice { id } => {
                let _ = self.asks.commands.send(UiCommand::ForgetDevice(id));
                Ok(())
            }
            Action::ConnectDevice { id } => {
                tokio::spawn(crate::devices::connect_paired(id));
                Ok(())
            }
            Action::ApplySettings => {
                let _ = self.asks.commands.send(UiCommand::ApplySettings);
                Ok(())
            }
            Action::SetDongleRadio { radio, on } => {
                let _ = self.asks.dongle.send((radio, on));
                Ok(())
            }
            Action::GamesRefresh => self.ask_games(GamesAsk::Refresh),
            Action::GamesImport => self.ask_games(GamesAsk::Import),
            Action::GamesLaunch { id } => self.ask_games(GamesAsk::Launch(id)),
            Action::GamesOpenRetroArch => self.ask_games(GamesAsk::OpenRetroArch),
            Action::GamesStop => self.ask_games(GamesAsk::Stop),
            Action::ControllersList => self.ask_games(GamesAsk::ListControllers),
            Action::ControllersScan => self.ask_games(GamesAsk::ScanControllers),
            Action::ControllerPair { mac } => self.ask_games(GamesAsk::Pair(mac)),
            Action::MiniDspRefresh => self.ask_minidsp(MiniDspAsk::Refresh),
            Action::MiniDspSetVolume { volume_db } => {
                self.ask_minidsp(MiniDspAsk::SetVolume(volume_db))
            }
            Action::MiniDspSetBass { gain_db } => self.ask_minidsp(MiniDspAsk::SetBass(gain_db)),
            Action::NetworkWatch { on } => self.ask_network(NetworkAsk::Watch(on)),
            Action::NetworkRefresh => self.ask_network(NetworkAsk::Refresh),
            Action::NetworkScan => self.ask_network(NetworkAsk::Scan),
            Action::NetworkConnect {
                ssid,
                psk,
                hidden,
                security,
            } => self.ask_network(NetworkAsk::Connect(Join {
                ssid,
                psk,
                hidden,
                security,
            })),
            Action::NetworkForget { uuid } => self.ask_network(NetworkAsk::Forget(uuid)),
            Action::MiniDspSelectPreset { preset } => {
                self.ask_minidsp(MiniDspAsk::SelectPreset(preset))
            }
            Action::CheckUpdate => self.ask_update(UpdateAsk::Check),
            Action::DownloadUpdate => self.ask_update(UpdateAsk::Download),
            Action::InstallUpdate => self.ask_update(UpdateAsk::Install),
            Action::AbortUpdate => self.ask_update(UpdateAsk::Abort),
            Action::OsUpdate { command } => self.ask_os_update(command),
        }
    }
}

pub async fn serve(core: Arc<Core>, listener: UnixListener) {
    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let core = core.clone();
                tokio::spawn(async move {
                    if let Err(e) = client(core, stream).await {
                        println!("[core] client gone: {e}");
                    }
                });
            }
            Err(e) => {
                eprintln!("[core] accept failed: {e}");
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        }
    }
}

async fn send(wr: &mut OwnedWriteHalf, msg: &FromCore) -> io::Result<()> {
    let frame = encode(msg).map_err(io::Error::other)?;
    wr.write_all(&frame).await
}

async fn welcome(core: &Core, wr: &mut OwnedWriteHalf) -> io::Result<broadcast::Receiver<Frame>> {
    let (msg, patches) = core.hub.welcome();
    send(wr, &msg).await?;
    Ok(patches)
}

async fn next_spectrum(viewer: &mut Option<Viewer>) -> Frame {
    match viewer {
        Some(v) => v.next().await,
        None => std::future::pending().await,
    }
}

async fn client(core: Arc<Core>, stream: UnixStream) -> io::Result<()> {
    let peer = stream.peer_cred()?.uid();
    if peer != core.uid {
        println!("[core] refused a client of uid {peer}");
        return Ok(());
    }
    let (mut rd, mut wr) = stream.into_split();
    let mut dec = Decoder::new();
    let mut buf = vec![0u8; 8192];

    let hello = loop {
        if let Some(msg) = dec.next_message::<ToCore>() {
            break msg.map_err(io::Error::other)?;
        }
        let n = rd.read(&mut buf).await?;
        if n == 0 {
            return Ok(());
        }
        dec.push(&buf[..n]);
    };
    let ToCore::Hello { protocol, client } = hello else {
        let reason = "the first message has to be hello".into();
        return send(&mut wr, &FromCore::Refused { reason }).await;
    };
    if protocol != PROTOCOL {
        let reason = format!("core speaks protocol {PROTOCOL}, not {protocol}");
        return send(&mut wr, &FromCore::Refused { reason }).await;
    }
    println!("[core] {client} connected");
    let mut pages = core.open_page.subscribe();
    let mut patches = welcome(&core, &mut wr).await?;
    let mut viewer: Option<Viewer> = None;
    let mut link_speed_viewer: Option<LinkSpeedViewer> = None;

    loop {
        tokio::select! {
            read = rd.read(&mut buf) => {
                let n = read?;
                if n == 0 {
                    break;
                }
                dec.push(&buf[..n]);
                while let Some(msg) = dec.next_message::<ToCore>() {
                    match msg {
                        Ok(ToCore::Resync) => patches = welcome(&core, &mut wr).await?,
                        Ok(ToCore::Action { id, action }) => {
                            let error = core.act(action).await.err();
                            send(&mut wr, &FromCore::Reply { id, error }).await?;
                        }
                        Ok(ToCore::Input { input }) => {
                            let _ = core.asks.input.send(input);
                        }
                        Ok(ToCore::Spectrum { on: true }) => {
                            viewer.get_or_insert_with(|| core.asks.spectrum.watch());
                        }
                        Ok(ToCore::Spectrum { on: false }) => viewer = None,
                        Ok(ToCore::LinkSpeed { on: true }) => {
                            link_speed_viewer.get_or_insert_with(|| {
                                LinkSpeedViewer::new(&core.asks.link_speed_viewers)
                            });
                        }
                        Ok(ToCore::LinkSpeed { on: false }) => link_speed_viewer = None,
                        Ok(ToCore::Path { path }) => {
                            core.ui_path.send_replace(path);
                        }
                        Ok(ToCore::Hello { .. }) => {}
                        Err(FrameError::Json(e)) => println!("[core] {client} sent a broken frame: {e}"),
                        Err(e @ FrameError::TooLarge(_)) => return Err(io::Error::other(e)),
                    }
                }
            }
            patch = patches.recv() => match patch {
                Ok(frame) => wr.write_all(&frame).await?,
                Err(broadcast::error::RecvError::Lagged(_)) => patches = welcome(&core, &mut wr).await?,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            frame = next_spectrum(&mut viewer) => wr.write_all(&frame).await?,
            page = pages.recv() => match page {
                Ok(path) => send(&mut wr, &FromCore::OpenPage { path }).await?,
                Err(broadcast::error::RecvError::Lagged(_)) => {}
                Err(broadcast::error::RecvError::Closed) => break,
            },
        }
    }
    println!("[core] {client} disconnected");
    Ok(())
}

#[cfg(test)]
mod tests {
    use livi_core_proto::patch::PatchOp;
    use livi_core_proto::state::{Front, PerScreen, State};
    use serde_json::json;

    use super::*;
    use crate::config_file::defaults;

    use crate::config_file::tests::TempDir;

    struct Peer {
        stream: UnixStream,
        dec: Decoder,
    }

    impl Peer {
        async fn connect(path: &std::path::Path) -> Self {
            Self {
                stream: UnixStream::connect(path).await.unwrap(),
                dec: Decoder::new(),
            }
        }

        async fn send(&mut self, msg: &ToCore) {
            self.stream.write_all(&encode(msg).unwrap()).await.unwrap();
        }

        async fn recv(&mut self) -> Option<FromCore> {
            let mut buf = [0u8; 4096];
            loop {
                if let Some(msg) = self.dec.next_message() {
                    return Some(msg.unwrap());
                }
                let read = self.stream.read(&mut buf);
                let n = tokio::time::timeout(Duration::from_secs(5), read)
                    .await
                    .unwrap()
                    .unwrap();
                if n == 0 {
                    return None;
                }
                self.dec.push(&buf[..n]);
            }
        }

        async fn hello(path: &std::path::Path) -> Self {
            let mut peer = Self::connect(path).await;
            peer.send(&ToCore::Hello {
                protocol: PROTOCOL,
                client: "test".into(),
            })
            .await;
            assert!(matches!(
                peer.recv().await,
                Some(FromCore::Welcome { rev: 0, .. })
            ));
            peer
        }
    }

    fn start(dir: &TempDir) -> (Arc<Core>, std::path::PathBuf) {
        let (core, path, _, _, _) = start_with_asks(dir);
        (core, path)
    }

    fn start_with_asks(
        dir: &TempDir,
    ) -> (
        Arc<Core>,
        std::path::PathBuf,
        crate::projection::UiAsks,
        crate::projection::DongleAsks,
        crate::projection::UpdateAsks,
    ) {
        let livi = PerScreen {
            main: Front::Livi,
            cluster: Front::Livi,
            aux: Front::Livi,
        };
        let hub = Hub::new(State {
            front: livi,
            sessions: Default::default(),
            now_playing: Default::default(),
            telemetry: Default::default(),
            navigation: Default::default(),
            system: Default::default(),
            devices: Default::default(),
            update: Default::default(),
            cluster: Default::default(),
            dab: Default::default(),
            games: Default::default(),
            cameras: Vec::new(),
            mfi: Default::default(),
            minidsp: Default::default(),
            network: Default::default(),
            config: defaults(),
        });
        let file = ConfigFile::new(dir.0.join("config.json"), dir.0.join("backup.json"));
        // SAFETY: geteuid has no preconditions.
        let uid = unsafe { libc::geteuid() };
        let (senders, asks, dongle, update) = crate::projection::ui_channels(livi);
        let core = Arc::new(Core::new(hub, file, uid, Arc::new(Notify::new()), senders));
        let path = dir.0.join("core.sock");
        let listener = UnixListener::bind(&path).unwrap();
        tokio::spawn(serve(core.clone(), listener));
        (core, path, asks, dongle, update)
    }

    #[tokio::test]
    async fn os_actions_are_gated_and_routed_separately_from_app_updates() {
        use livi_core_proto::state::{OsChannel, OsUpdatePhase};

        let dir = TempDir::new();
        let (core, _, _, _, mut updates) = start_with_asks(&dir);
        let mut asks = core.take_os_update_asks().unwrap();
        let check = OsUpdateCommand::Check {
            channel: OsChannel::Nightly,
        };
        assert!(core.ask_os_update(check).is_err());
        core.hub.update(|s| s.system.os_update.enabled = true);
        core.ask_os_update(check).unwrap();
        assert_eq!(asks.recv().await, Some(check));
        assert!(updates.try_recv().is_err());
        assert!(core.ask_os_update(OsUpdateCommand::ConfirmReboot).is_err());
        core.hub
            .update(|s| s.system.os_update.phase = OsUpdatePhase::Staging);
        assert!(core.ask_os_update(check).is_err());
        assert!(core.ask_update(UpdateAsk::Download).is_err());
        assert!(core.ask_update(UpdateAsk::Install).is_err());
        core.ask_update(UpdateAsk::Check).unwrap();
        assert_eq!(updates.recv().await, Some(UpdateAsk::Check));
    }

    #[tokio::test]
    async fn failed_power_keeps_core_alive_and_exposes_a_retryable_error() {
        let dir = TempDir::new();
        let (core, _) = start(&dir);
        assert!(
            core.power_with(async { Err("sudo denied".into()) })
                .await
                .is_err()
        );
        let current = core.hub.watch().borrow().clone();
        assert!(!current.system.power_busy);
        assert_eq!(current.system.power_error.as_deref(), Some("sudo denied"));
        assert!(!core.restart.load(Ordering::SeqCst));
        assert!(
            tokio::time::timeout(Duration::from_millis(10), core.quit.notified())
                .await
                .is_err()
        );
        core.power_with(async { Ok(()) }).await.unwrap();
        assert!(core.hub.watch().borrow().system.power_busy);
        assert!(core.hub.watch().borrow().system.power_error.is_none());
    }

    #[tokio::test]
    async fn app_update_relaunch_does_not_request_host_power() {
        let dir = TempDir::new();
        let (core, _) = start(&dir);
        let next = PathBuf::from("/data/livi/app/LIVI.AppImage");
        core.relaunch(next.clone());
        assert!(core.restart.load(Ordering::SeqCst));
        assert_eq!(*core.relaunch.lock().unwrap(), Some(next));
        assert!(!core.hub.watch().borrow().system.power_busy);
        tokio::time::timeout(Duration::from_secs(1), core.quit.notified())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn power_refuses_updates_and_duplicate_requests_without_running_helper() {
        use livi_core_proto::state::{OsUpdatePhase, UpdatePhase};
        let dir = TempDir::new();
        let (core, _) = start(&dir);
        core.hub
            .update(|s| s.system.os_update.phase = OsUpdatePhase::Staging);
        assert!(
            core.power_with(async { panic!("must not run") })
                .await
                .is_err()
        );
        core.hub.update(|s| {
            s.system.os_update.phase = OsUpdatePhase::Idle;
            s.update.phase = UpdatePhase::Installing;
        });
        assert!(
            core.power_with(async { panic!("must not run") })
                .await
                .is_err()
        );
        core.hub.update(|s| {
            s.update.phase = UpdatePhase::Idle;
            s.system.power_busy = true;
        });
        assert!(
            core.power_with(async { panic!("must not run") })
                .await
                .is_err()
        );
        assert!(core.hub.watch().borrow().system.power_busy);
        assert!(core.ask_update(UpdateAsk::Download).is_err());
        assert!(core.ask_os_update(OsUpdateCommand::Status).is_err());
    }

    #[tokio::test]
    async fn what_the_ui_asks_reaches_the_services() {
        use livi_core_proto::input::Input;
        use livi_core_proto::message::MediaControl;
        use livi_core_proto::state::Screen;

        let dir = TempDir::new();
        let (_core, path, mut asks, mut dongle, mut update) = start_with_asks(&dir);
        let mut ui = Peer::hello(&path).await;
        let show = Action::Show {
            screen: Screen::Main,
            front: Front::Projection,
        };
        ui.send(&ToCore::Action {
            id: 1,
            action: show,
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply { id: 1, error: None })
        );
        assert_eq!(asks.wants.borrow().main, Front::Projection);
        let next = Action::Media {
            control: MediaControl::Next,
        };
        ui.send(&ToCore::Action {
            id: 2,
            action: next,
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply { id: 2, error: None })
        );
        assert_eq!(
            asks.commands.recv().await,
            Some(UiCommand::Media(MediaControl::Next))
        );
        ui.send(&ToCore::Action {
            id: 3,
            action: Action::NextDevice,
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply { id: 3, error: None })
        );
        assert_eq!(asks.commands.recv().await, Some(UiCommand::NextDevice));
        ui.send(&ToCore::Action {
            id: 9,
            action: Action::Seek { position_ms: 61000 },
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply { id: 9, error: None })
        );
        assert_eq!(asks.commands.recv().await, Some(UiCommand::Seek(61000)));
        for (id, action, ask) in [
            (
                10,
                Action::SelectClusterLayout { layout: "a".into() },
                UiCommand::SelectClusterLayout("a".into()),
            ),
            (
                11,
                Action::StepClusterLayout { by: -1 },
                UiCommand::StepClusterLayout(-1),
            ),
            (
                12,
                Action::MoveClusterLayout {
                    layout: "a".into(),
                    by: 1,
                },
                UiCommand::MoveClusterLayout("a".into(), 1),
            ),
            (
                13,
                Action::ShowClusterLayout {
                    layout: "a".into(),
                    on: false,
                },
                UiCommand::ShowClusterLayout("a".into(), false),
            ),
        ] {
            ui.send(&ToCore::Action { id, action }).await;
            assert_eq!(ui.recv().await, Some(FromCore::Reply { id, error: None }));
            assert_eq!(asks.commands.recv().await, Some(ask));
        }
        let radio = Action::SetDongleRadio {
            radio: livi_core_proto::message::Radio::Bt,
            on: true,
        };
        ui.send(&ToCore::Action {
            id: 4,
            action: radio,
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply { id: 4, error: None })
        );
        assert_eq!(
            dongle.radios.recv().await,
            Some((livi_core_proto::message::Radio::Bt, true))
        );
        for (id, action, ask) in [
            (5, Action::CheckUpdate, UpdateAsk::Check),
            (6, Action::DownloadUpdate, UpdateAsk::Download),
            (7, Action::InstallUpdate, UpdateAsk::Install),
            (8, Action::AbortUpdate, UpdateAsk::Abort),
        ] {
            ui.send(&ToCore::Action { id, action }).await;
            assert_eq!(ui.recv().await, Some(FromCore::Reply { id, error: None }));
            assert_eq!(update.recv().await, Some(ask));
        }
        let key = Input::Key {
            code: "KeyA".into(),
            down: true,
        };
        ui.send(&ToCore::Input { input: key.clone() }).await;
        ui.send(&ToCore::Path {
            path: "/media".into(),
        })
        .await;
        assert_eq!(asks.input.recv().await, Some(key));
    }

    #[tokio::test]
    async fn minidsp_actions_reach_the_minidsp_task() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let mut asks = core.take_minidsp_asks().unwrap();
        assert!(core.take_minidsp_asks().is_none());
        let mut ui = Peer::hello(&path).await;
        for (id, action, ask) in [
            (1, Action::MiniDspRefresh, MiniDspAsk::Refresh),
            (
                2,
                Action::MiniDspSetVolume { volume_db: -20.0 },
                MiniDspAsk::SetVolume(-20.0),
            ),
            (
                3,
                Action::MiniDspSetBass { gain_db: 4.5 },
                MiniDspAsk::SetBass(4.5),
            ),
            (
                4,
                Action::MiniDspSelectPreset { preset: 1 },
                MiniDspAsk::SelectPreset(1),
            ),
        ] {
            ui.send(&ToCore::Action { id, action }).await;
            assert_eq!(ui.recv().await, Some(FromCore::Reply { id, error: None }));
            assert_eq!(asks.recv().await, Some(ask));
        }
    }

    #[tokio::test]
    async fn network_actions_reach_the_network_task() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let mut asks = core.take_network_asks().unwrap();
        let mut ui = Peer::hello(&path).await;
        for (id, action, ask) in [
            (
                1,
                Action::NetworkWatch { on: true },
                NetworkAsk::Watch(true),
            ),
            (2, Action::NetworkScan, NetworkAsk::Scan),
            (
                3,
                Action::NetworkConnect {
                    ssid: "Garage".into(),
                    psk: None,
                    hidden: false,
                    security: None,
                },
                NetworkAsk::Connect(Join {
                    ssid: "Garage".into(),
                    psk: None,
                    hidden: false,
                    security: None,
                }),
            ),
            (
                4,
                Action::NetworkForget { uuid: "u-1".into() },
                NetworkAsk::Forget("u-1".into()),
            ),
        ] {
            ui.send(&ToCore::Action { id, action }).await;
            assert_eq!(ui.recv().await, Some(FromCore::Reply { id, error: None }));
            assert_eq!(asks.recv().await, Some(ask));
        }
    }

    #[tokio::test]
    async fn a_page_the_telemetry_asked_for_reaches_every_client() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let mut main = Peer::hello(&path).await;
        let mut cluster = Peer::hello(&path).await;
        core.open_page.send("/media".into()).unwrap();
        let page = Some(FromCore::OpenPage {
            path: "/media".into(),
        });
        assert_eq!(main.recv().await, page);
        assert_eq!(cluster.recv().await, page);
    }

    async fn wait_for(done: impl Fn() -> bool) {
        for _ in 0..1000 {
            if done() {
                return;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
        panic!("never happened");
    }

    #[tokio::test]
    async fn a_client_gets_spectrum_frames_while_it_draws_them() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let feed = core.asks.spectrum.clone();
        let mut drawing = Peer::hello(&path).await;
        let mut other = Peer::hello(&path).await;
        drawing.send(&ToCore::Spectrum { on: true }).await;
        drawing.send(&ToCore::Spectrum { on: true }).await;
        wait_for(|| feed.viewing() == 1).await;
        feed.publish(vec![0.5]);
        assert_eq!(
            drawing.recv().await,
            Some(FromCore::Spectrum { bands: vec![0.5] })
        );

        drawing.send(&ToCore::Spectrum { on: false }).await;
        wait_for(|| feed.viewing() == 0).await;
        other.send(&ToCore::Spectrum { on: true }).await;
        wait_for(|| feed.viewing() == 1).await;
        drop(other);
        wait_for(|| feed.viewing() == 0).await;
    }

    #[tokio::test]
    async fn the_dongle_is_asked_for_rates_while_a_client_shows_the_link_speed() {
        let dir = TempDir::new();
        let (_core, path, _, dongle, _) = start_with_asks(&dir);
        let viewers = dongle.link_speed_viewers;
        let mut settings = Peer::hello(&path).await;
        let mut other = Peer::hello(&path).await;
        settings.send(&ToCore::LinkSpeed { on: true }).await;
        settings.send(&ToCore::LinkSpeed { on: true }).await;
        wait_for(|| *viewers.borrow() == 1).await;

        settings.send(&ToCore::LinkSpeed { on: false }).await;
        wait_for(|| *viewers.borrow() == 0).await;
        other.send(&ToCore::LinkSpeed { on: true }).await;
        wait_for(|| *viewers.borrow() == 1).await;
        drop(other);
        wait_for(|| *viewers.borrow() == 0).await;
    }

    #[tokio::test]
    async fn a_config_change_reaches_every_client_and_the_file() {
        let dir = TempDir::new();
        let (_core, path) = start(&dir);
        let mut ui = Peer::hello(&path).await;
        let mut dash = Peer::hello(&path).await;

        let action = Action::SetConfig {
            patch: json!({ "huVolume": 0.5 }),
        };
        ui.send(&ToCore::Action { id: 1, action }).await;

        let set = PatchOp::Set {
            path: vec!["config".into(), "huVolume".into()],
            value: json!(0.5),
        };
        let patch = FromCore::Patch {
            rev: 1,
            ops: vec![set],
        };
        let first = ui.recv().await.unwrap();
        let second = ui.recv().await.unwrap();
        assert!([&first, &second].contains(&&patch));
        assert!([&first, &second].contains(&&FromCore::Reply { id: 1, error: None }));
        assert_eq!(dash.recv().await, Some(patch));

        let saved: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(dir.0.join("config.json")).unwrap())
                .unwrap();
        assert_eq!(saved["huVolume"], 0.5);
    }

    #[tokio::test]
    async fn a_bad_action_gets_an_error_and_changes_nothing() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let mut ui = Peer::hello(&path).await;

        let action = Action::SetConfig {
            patch: json!({ "huVolume": "loud" }),
        };
        ui.send(&ToCore::Action { id: 2, action }).await;
        assert!(matches!(
            ui.recv().await,
            Some(FromCore::Reply {
                id: 2,
                error: Some(_)
            })
        ));

        ui.send(&ToCore::Action {
            id: 3,
            action: Action::InstallUpdate,
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply {
                id: 3,
                error: Some("updates are not available".into())
            })
        );
        assert_eq!(core.hub.config().hu_volume, 0.95);
    }

    #[tokio::test]
    async fn resync_sends_the_whole_state_again() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let mut ui = Peer::hello(&path).await;
        core.hub.update(|s| s.front.main = Front::Projection);
        assert!(matches!(
            ui.recv().await,
            Some(FromCore::Patch { rev: 1, .. })
        ));

        ui.send(&ToCore::Resync).await;
        match ui.recv().await {
            Some(FromCore::Welcome { rev, state, .. }) => {
                assert_eq!(rev, 1);
                assert_eq!(state.front.main, Front::Projection);
            }
            other => panic!("expected a welcome, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn a_client_on_another_protocol_is_refused() {
        let dir = TempDir::new();
        let (_core, path) = start(&dir);
        let mut old = Peer::connect(&path).await;
        old.send(&ToCore::Hello {
            protocol: PROTOCOL + 1,
            client: "old".into(),
        })
        .await;
        assert!(matches!(old.recv().await, Some(FromCore::Refused { .. })));
        assert_eq!(old.recv().await, None);

        let mut rude = Peer::connect(&path).await;
        rude.send(&ToCore::Resync).await;
        assert!(matches!(rude.recv().await, Some(FromCore::Refused { .. })));
    }

    #[tokio::test]
    async fn restart_is_a_quit_that_asks_to_come_back() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let mut ui = Peer::hello(&path).await;
        let quit = core.quit.notified();
        ui.send(&ToCore::Action {
            id: 4,
            action: Action::Restart,
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply { id: 4, error: None })
        );
        tokio::time::timeout(Duration::from_secs(5), quit)
            .await
            .unwrap();
        assert!(core.restart.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn quit_is_answered_then_announced() {
        let dir = TempDir::new();
        let (core, path) = start(&dir);
        let mut ui = Peer::hello(&path).await;
        let quit = core.quit.notified();
        ui.send(&ToCore::Action {
            id: 9,
            action: Action::Quit,
        })
        .await;
        assert_eq!(
            ui.recv().await,
            Some(FromCore::Reply { id: 9, error: None })
        );
        tokio::time::timeout(Duration::from_secs(5), quit)
            .await
            .unwrap();
    }
}
