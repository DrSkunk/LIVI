# Upstream Synchronization Differences

Generated during merge of `upstream/main` into fork `main`.

## Snapshot

- Fork tip before merge: `40a7e36076bc4590eae773dcaf6f30e71c2a5896`
- Upstream tip: `64a05b68358db52ed887169143afd5944fd6f1f7`
- Common ancestor: `7fa9f8020d6422c66cdae92c3ab019a06e91b3a2`
- Fork-only commits: 72
- Upstream-only commits: 139

Merge policy: upstream version selected for textual conflicts. Non-conflicting fork changes remain. This preserves upstream build/layout changes but may intentionally drop fork code where upstream removed or rewrote the same code.

## Fork-only commits

- ac4bcf83 fix(ci): download macOS GStreamer pkgs over HTTP/1.1 in builds too
- 87f83dab fix(ui): simplify clock selection with swipes
- f7b38e6a chore(gstreamer): update macos-arm64 bundle to 1.28.9
- 02054d1b fix(ci): download macOS GStreamer pkgs over HTTP/1.1 with retries
- b6957aab test(music-sync): pin the verification code shared with the website
- 6fcbbfe4 chore(gstreamer): update linux-arm64 bundle (gst-plugins-bad1.0 1.28.9-1,gstreamer1.0-alsa:arm64 1.28.9-1 gstreamer1.0-gl:arm64 1.28.9-1,gstreamer1.0-libav:arm64 1.28.9-1 gstreamer1.0-plugins-base-apps 1.28.9-1,gstreamer1.0-plugins-base:arm64 1.28.9-1 gstreamer1.0-plugins-good:arm64 1.28.9-1,gstreamer1.0-pulseaudio:arm64 1.28.9-1 gstreamer1.0-tools 1.28.9-1,gstreamer1.0-x:arm64 1.28.9-1 libgstreamer-gl1.0-0:arm64 1.28.9-1,libgstreamer-plugins-base1.0-0:arm64 1.28.9-1 libgstreamer-plugins-base1.0-dev:arm64 1.28.9-1,libgstreamer1.0-0:arm64 1.28.9-1 libgstreamer1.0-dev:arm64 1.28.9-1)
- 3657ad13 fix(gstreamer): drop wayland output patch merged upstream in 1.28.9
- 3b5437b7 chore(gstreamer): update linux-x64 bundle (gst-plugins-bad1.0 1.28.9-1,gstreamer1.0-alsa:amd64 1.28.9-1 gstreamer1.0-gl:amd64 1.28.9-1,gstreamer1.0-libav:amd64 1.28.9-1 gstreamer1.0-plugins-base-apps 1.28.9-1,gstreamer1.0-plugins-base:amd64 1.28.9-1 gstreamer1.0-plugins-good:amd64 1.28.9-1,gstreamer1.0-pulseaudio:amd64 1.28.9-1 gstreamer1.0-tools 1.28.9-1,gstreamer1.0-x:amd64 1.28.9-1 libgstreamer-gl1.0-0:amd64 1.28.9-1,libgstreamer-plugins-base1.0-0:amd64 1.28.9-1 libgstreamer-plugins-base1.0-dev:amd64 1.28.9-1,libgstreamer1.0-0:amd64 1.28.9-1 libgstreamer1.0-dev:amd64 1.28.9-1)
- 3a53aa22 feat(media): local music library with USB storage and wireless sync
- b9f653a5 fix(ci): prefer the pinned Rust toolchain over Homebrew Rust
- 3fb7d154 fix(ci): pin macOS GStreamer to the published universal bundle
- 27c6609b ci: run macOS checks and builds on the local Apple Silicon runner
- 5fbc625a fix(ui): keep sidebar clock layout stable
- 395d9f2b fix(i18n): complete CAN telemetry settings translations
- 09f5b240 feat(telemetry): add selectable Haltech OBD-II diagnostics
- 03b0731a fix(ui): reuse existing clock icon
- dacf7455 feat(network): add LIVI OS network settings
- f97dbf11 fix(compositor): respect pinned main display connector
- 288420bc fix(compositor): keep main screen available after connector loss
- b118644b feat(clock): add Mercedes-style clock page with sidebar auto-hide
- 0e6bb709 fix(video): restore hardware HEVC on the Waveshare appliance
- 7fef6549 style(docs): format OS update contract table
- c8fd4827 feat(system): add signed OS updates and guarded power controls
- fae0c9c8 fix(display): honor appliance rotation and report presented frames
- aa5e8277 revert(media): remove Spotify Connect from main
- ca14a197 feat(media): add Spotify Connect with source-aware controls
- 00ce9c10 feat(telemetry): add opt-in GPS vehicle speed
- 593c9137 fix(i18n): update sidebar translations
- 60c8d41c feat(ui): add sidebar tab visibility controls
- b4b52091 revert(media): drop the fork's ambient background spectrum
- b525981d style(docs): dprint formatting for README, LIVI-OS and maintenance
- 3d625d3b feat(media): ambient backdrop with background spectrum
- 446bb011 feat(ui): COMAND style for the Games page
- ad544215 feat(ui): COMAND UI style ported from the mercedes-look-rework branch
- 9200f05b feat(install): RetroArch, libretro cores, ROM library and Freedoom
- 7bdc77f2 feat(ui): Games page with library, ROM import and controller pairing
- 56b7dd6e docs(debugging): list minidsp as a LIVI_UI_PAGE value
- 629d7d2c feat(minidsp): MiniDSP page on the native UI
- 2dd41fe8 feat(telemetry): Haltech CAN V2 receiver
- ddac24aa feat(compositor): let RetroArch fill the main screen above LIVI
- 7c7ff843 feat(games): RetroArch library, ROM import, launch and controller pairing in core
- 8875116b feat(appearance): sunrise/sunset day-night mode
- b387199a feat(theme): ZTT amber palette with red night accent
- 81243bbc feat(linux): integrate with the immutable LIVI OS helper interface
- 7c1b1c95 feat(about): credit upstream LIVI on the About page
- f56c4e3e chore(fork): point repo references at DrSkunk/LIVI
- 45512bb2 ci: pin Linux x64 AppImage build to ubuntu-24.04
- 91dd651f feat(telemetry): Haltech CAN V2 receiver
- 66897cc6 feat(linux): integrate with immutable LIVI OS helper interface
- 8bb3f423 feat(theme): ZTT amber palette with sunrise/sunset night mode
- d2149398 refactor(ui): align MiniDSP and Games with dashboard styling
- 7406ff7c feat(games): include Doom by default
- 5796bd1b feat(minidsp): add MiniDspControls and MiniDspView components
- b33e38cc feat: prevent fullscreen reflection for dialog toplevels in LIVI compositor
- 61a7cb33 feat: add dialog layout handling for fullscreen support in LIVI UI
- 35a985c9 feat: implement ROM import functionality with directory structure and core installation
- c4715563 feat: adjust RetroArch launch arguments for Wayland compatibility and update tests
- 0de41d55 feat: keep LIVI mapped behind RetroArch and update related tests
- c33823d1 feat: add Bluetooth controller pairing functionality with UI integration
- 12aeb4ca fix: update repository URL from f-io to DrSkunk in feed and updater tests
- 576d43de feat: enhance Media component with background spectrum visualizer and update FFTSpectrum for variant support
- 1c622897 feat: add RetroArch support with automatic library setup and integration
- 33d4780b feat: enhance headless installation script with RetroArch and MiniDSP support
- c48aa819 chore(gstreamer): update linux-arm64 bundle (gstreamer1.0-plugins-bad:arm64 1.28.5-2,libgstreamer-plugins-bad1.0-0:arm64 1.28.5-2)
- fa61435f chore(gstreamer): update linux-x64 bundle (gstreamer1.0-plugins-bad:amd64 1.28.5-2,libgstreamer-plugins-bad1.0-0:amd64 1.28.5-2)
- 2dfceb2e feat: enhance installation scripts with error handling and local AppImage support
- cfc735f4 fix: update repository references from f-io to DrSkunk in installation scripts and README
- 6b201787 feat: enhance Raspberry Pi OS installation with minidsp support and improved instructions
- 21dcdad2 feat: add game library management and UI integration
- 6ed65b1a coolify the controls
- 24d67aab feat: add MiniDSP support with IPC integration and UI components
- b7435e8d ci(build): trigger nightly from manual dispatch

## Upstream-only commits

- 64a05b68 refactor(platform): derive capabilities in one place
- fca56258 ci(gstreamer): add the ios-arm64 bundle
- dc1a3029 fix(airplay): drop a mirroring session that never sends a screen
- 748ec942 refactor(livi-ui): drop the extended turn-by-turn dashboard
- eb969ca7 feat(airplay): use car name
- 335ff509 ci(livi-link): cache downloads, alternate with the firmware mirror and commit partial runs
- a51ab10d chore(livi-link): kernel 7.3.4
- 27310547 chore(toolchain): build on the latest stable rust
- afafb825 feat(livi-ui): all telltales on gauges dashboard
- 73ec3ee7 chore(livi-link): drop the untested x1600 target
- a37f88ba chore(deps): update dependencies
- 1e0b98b4 fix(ui): hide the mirror overlay at start and after idle
- 9da15604 feat(cp): accept udp keepalive beacons
- d48b5bf3 refactor(aa-stack): crate-private modules, drop the dead av setup event
- 2d82d1c8 refactor(cp): crate-private modules, drop the unused hls player
- 7d8d89bd refactor(base): one hex colour parser
- 69a0f40e refactor(audio): use the wire AudioCodec instead of a copy
- 22c0a25d refactor(core): share gear constants, nmea checksum and unix_ms
- b984d694 chore(ci): cancel superseded checks and fix stale debug flags
- 0b5dee89 chore(lint): deny dbg and drop a blanket clippy allow
- e56f9cc7 chore(ui): drop unused icons and add the apply label
- 6c5c8e59 fix(gnss): check daylight saving against the current year
- a986ec68 refactor(base): share the lfwb bundle format between dongle and provisioner
- a360f8b1 refactor(helper): start the android auto wifi server in one place
- 70551697 refactor(cp): derive carplay and airplay session keys in one place
- fa5d97bd fix(helper): read csm frames in a loop instead of recursing
- 013b5265 refactor(output): encode audio and mic open in livi-output-proto
- ed9bfcf2 refactor(core): run system tools through privileged with a timeout
- beeccf6f refactor(core): share one serial port for gnss and the car bridge
- 4630482a refactor(helper): move tool lookup to livi-base and reuse socket helpers
- 89f70e87 refactor(base): share hex, mac and inet checksum helpers
- 58b3ac6e fix(helper): encode socket errors with serde
- 92d59f70 fix(gst): drop logged bus messages instead of queueing them
- bdbdc891 perf(ui): build settings screen once per render
- c5aba49c fix(screen-stream): remove client watch on receiver drop
- 6ac88bab refactor(native): rename gst-host to output
- b43f1d8d refactor(native): name crates after what they are
- e78c09ce chore(vendor): keep only src and manifest of femtovg
- 3161f376 test(i18n): inline english must match en.json
- 0450ae77 fix(ui): light theme variants for buttons, track and dab tiles
- 550801ca refactor(web): split lib.rs into modules
- 2e094e63 refactor(video): share desktop sink selection
- 800c701d chore(livi-link): update dongle stack (ax520_aic8800d80, imx6ul_bcm4354, imx6ul_iw416, imx6ul_rtl8822bs, imx6ul_rtl8822cs, v821b_aic8800d80, x1600_aic8800d80, provisioning tool)
- e4cee07d chore(deps): update dependencies
- d617c4a1 style(io): rustfmt the bounded queue signatures
- 3b86094f refactor(core): group the flat modules into projection, vehicle, audio, system and files
- 39fcf5d8 refactor(errors): typed errors at the library crate boundaries
- 135d70dd refactor(io): bound the queues on the data paths
- cf41be08 refactor(unsafe): document every unsafe block and enforce it with clippy
- 2743f52b refactor(usb): one hotplug loop and an async usbmux on the shared usb stream
- e19ee889 feat(provision): fall back to a known A15W image download
- 944a6aa4 refactor(crypto): move every primitive onto aws-lc in livi-crypto
- c6ca1c7b build(macos): scope the gstreamer pkg-config path to macos targets
- 39eda667 refactor(base): share the small helpers and tidy the manifests
- bdfaa3de refactor(base): share the small helpers and tidy the manifests
- b6c19166 chore(build): verify downloaded sources by sha256
- 380d76da chore(livi-link): share one userspace build and bump hostapd to 2.12
- 03c6268e fix(scripts): default build dirs to the xdg cache
- 35c3af2c refactor(base): share capped framing and atomic writes
- 870d2644 feat(airplay): share the video controls with mirroring
- 2949ae7f feat(airplay): hide the mirror picture outside of park
- 23b772db feat(airplay): add airplay mirroring and audio receiver
- 67c72779 chore(deps): update dependencies and move to rsa 0.10"
- a444ba18 chore(assets): darken livi logo tile
- b1bbda58 feat(ui): add a view area per screen for the livi ui
- dc49d5eb feat(telemetry)!: add carplay ui and map appearance per screen
- 72230aef fix(helper): follow the core's user data dir instead of a fixed home path
- 6d1e0b54 chore(gstreamer): update linux bundle to 1.28.9-1
- fa030873 build(gstreamer): build from sid sources and drop the upstreamed wayland patch
- 5cdbf611 ci(gstreamer): retry the gstreamer downloads
- f26e7eb3 build(livi-link): fail on http errors and retry downloads
- f137be5c chore(deps): update the lockfile
- 81c35049 ci(android): point ANDROID_NDK_ROOT at the configured ndk
- 35153874 ci(android): retry the gradle download and cache gradle between builds
- 7a99e388 chore(docs): updated ui
- 066d4a2b fix(carplay): report the physical size the stream is shown at
- 988ca500 fix(ui): forward keys from secondary windows
- fccbfebe style(ui): restyle navigation and settings rows and dash
- 68ad3823 feat(carplay): climate controls off by default
- 637a2308 fix(core): never give android auto the bluetooth mac of another phone
- 9d9ba876 chore(core): log the first main frame and each main screen change
- df44fac3 fix(ui): wait on the projection page for the next phone's first frame
- a4012469 chore(deps): bumb toolchain
- 2562d3d5 refactor(net): share the hci tunnel's keepalive and framing
- d19f8cdd fix(wifi-ap): tear the access point down after its service stopped
- f79ba234 refactor(core): one device identity for the core and the carplay manager
- 0d39a279 refactor(core): leave a lost transport to the carplay manager
- c85b50f8 refactor(link): drop the dongle's own bluetooth accessory mode
- 81191920 refactor(helper): compose the linux helper like the other platforms
- f1e56604 refactor(helperd): start the linux helper from the helper start instead of config.json
- 96cc084e refactor(ui): read the core state through a typed mirror
- 40afc82c refactor(helper): type the requests on the CarPlay and AA sockets
- ac1e7441 fix(bt): pass bluetooth remote commands to the phone in front again
- 0be5efaa refactor(aa): type the helper events on the AA and shared sockets
- c479e5a0 refactor(carplay): type the now playing and navigation metadata and share the now playing merge with AA
- d8b244c1 refactor(helper): type the helper events between runtime and carplay
- 3221eb1f refactor(compositor): share one typed control line between writer and readers
- 916d7c7d refactor(video): pass the codec and the decoder probe as types
- 32ffb393 perf(core): diff and copy only the state sections that changed
- ca23cf75 fix(carplay): keep the display values told at /info for the session
- 4d2bcf6c fix(carplay): remember the fetched image archive per phone
- efcb484c fix(build): stamp the build with its commit day
- f6adf847 perf(radio): read stations in place and keep the list model when only marks change
- 4c6501df perf(ui): decode images outside the state lock and reuse station logos
- 2c2b3f0b fix(installer): refuse root in the desktop flow
- 73606ce1 fix(installer): upgrade fully when pacman installs packages
- 65c8d2ff fix(helper): keep blocking dongle, clock and mux calls off the runtime
- 5e3383d1 fix(helper): count links per phone so an old one cannot end a new one
- 9d908b3d fix(core): run android auto without the carplay listener
- e0eb8727 fix(ui): treat an oversized core frame as a lost connection
- 78278857 fix(carplay): report the package version to the phone
- e368d1eb fix(audio): drop old ramp points before a new volume ramp
- f3968913 fix(aa): forget the finished route when navigation stops
- caf30179 fix(aa): end a stalled setup in time and reopen a lost media feed
- 6b4252bb fix(helper): build session events as escaped json
- c86b98a0 fix(web): refuse bodies larger than the flash slots
- 5c165a9b fix(usbmux): stop on malformed mux packets and looping ncm blocks
- 6e703e22 fix(carplay): limit opack nesting depth
- e0459463 fix(carplay): require pair-verify and bound rtsp bodies on the control channel
- 97be8e88 feat(display): add edid for the audi rns-e provided by @niz93
- 012a932f fix(display): keep interlaced panel modes in the kiosk video pin
- 6a99400a fix(media): send media keys to the phone unless the radio stick plays
- 7961087a refactor(video): split platform code into modules
- 9bb2f3ed refactor(link): let the NCM bridge pick the fallback MAC
- ba97af6c refactor(helper): share bring-up, Bluetooth sessions and paging across platforms
- d826d21a fix(ui): keep the macOS window in the main screen's aspect ratio
- 2fd5cb3e feat(cp): offer FM next to DAB in the radio app
- e3e70a5f fix(media): wait for the compositor display before starting gst-host
- d62dadd2 feat(media): DAB+ and FM follow the phone layout with a full-width station list
- 06f396c9 fix(ui): bring the window back from the Dock on macOS
- 32579610 fix(ui): count a session as streaming only once its video runs
- ef4c81b9 fix(projection): show the phone only once its first frame arrives
- 5294890b feat(cp): always offer video playback, iOS 27.2 blocks unauthorized video embedding
- 86c58d93 feat(audio): switch audio sources on the last request
- 9f158489 fix(ui): drop the fastest stepper repeat
- 785ade94 fix(net): share the Android root certificates
- 1db4736b fix(link): take the LIVI Link address from the lease on Android
- 724262f0 fix(wireless): keep asking for the Android hotspot
- d809675e fix(compositor): report the whole display's size in window mode

## Fork-to-upstream file differences

| Status | Path |
|---|---|
| `D` | `.github/FUNDING.yml` |
| `M` | `.github/ISSUE_TEMPLATE/bug.yml` |
| `M` | `.github/ISSUE_TEMPLATE/config.yml` |
| `M` | `.github/actions/android-setup/action.yml` |
| `M` | `.github/actions/cargo-cache/restore/action.yml` |
| `A` | `.github/self-hosted-runners.md` |
| `M` | `.github/workflows/build.yml` |
| `M` | `.github/workflows/checks.yml` |
| `D` | `.github/workflows/cla.yml` |
| `M` | `.github/workflows/dependencies.yml` |
| `M` | `.github/workflows/gstreamer-assets.yml` |
| `M` | `.github/workflows/livi-link.yml` |
| `M` | `.github/workflows/maintenance.yml` |
| `D` | `.github/workflows/notification.yml` |
| `M` | `CREDITS.md` |
| `M` | `DEBUGGING.md` |
| `M` | `LIVI-LINK.md` |
| `M` | `README.md` |
| `M` | `android/gradle/wrapper/gradle-wrapper.properties` |
| `D` | `assets/displays/AUDI_RNS-E_PU_193_LT065AB3D600_800_470i_60Hz.edid` |
| `M` | `assets/displays/README.md` |
| `M` | `assets/gstreamer/android-arm64/packages.txt` |
| `M` | `assets/gstreamer/android-arm64/sha256.txt` |
| `M` | `assets/gstreamer/android-arm64/version.txt` |
| `D` | `assets/gstreamer/ios-arm64/packages.txt` |
| `D` | `assets/gstreamer/ios-arm64/sha256.txt` |
| `D` | `assets/gstreamer/ios-arm64/version.txt` |
| `M` | `assets/gstreamer/linux-arm64/sha256.txt` |
| `M` | `assets/gstreamer/linux-x64/sha256.txt` |
| `M` | `assets/gstreamer/macos-arm64/sha256.txt` |
| `M` | `assets/icons/carplay/livi.png` |
| `M` | `assets/icons/linux/livi.png` |
| `D` | `assets/icons/livi.png` |
| `M` | `assets/icons/mac/livi.icns` |
| `M` | `assets/linux/99-LIVI-helper.sudoers.template` |
| `A` | `assets/linux/livi-os-display-api` |
| `A` | `assets/linux/livi-os-helper-api` |
| `M` | `assets/linux/livi-wifi-ap.service.template` |
| `M` | `assets/livi-link-provision/linux-arm64.json` |
| `M` | `assets/livi-link-provision/linux-x64.json` |
| `M` | `assets/livi-link-provision/macos-arm64.json` |
| `M` | `assets/livi-link-provision/macos-x64.json` |
| `M` | `assets/livi-link/ax520_aic8800d80/firmware.json` |
| `M` | `assets/livi-link/imx6ul_bcm4354/firmware.json` |
| `M` | `assets/livi-link/imx6ul_iw416/firmware.json` |
| `M` | `assets/livi-link/imx6ul_rtl8822bs/firmware.json` |
| `M` | `assets/livi-link/imx6ul_rtl8822cs/firmware.json` |
| `M` | `assets/livi-link/v821b_aic8800d80/firmware.json` |
| `A` | `assets/livi-link/x1600_aic8800d80/firmware.json` |
| `A` | `docs/LIVI-OS.md` |
| `M` | `docs/index.html` |
| `A` | `docs/media/area/dash_safe_area_aa.png` |
| `A` | `docs/media/area/main_safe_area_view_area_aa.png` |
| `M` | `docs/media/banner.png` |
| `M` | `docs/media/color.png` |
| `M` | `docs/media/connections.png` |
| `M` | `docs/media/contrast_gamma.png` |
| `M` | `docs/media/dabplus.png` |
| `M` | `docs/media/dash.png` |
| `M` | `docs/media/devices.png` |
| `D` | `docs/media/gps/gps.png` |
| `A` | `docs/media/gps/gps_hw.png` |
| `A` | `docs/media/gps/gps_info.png` |
| `M` | `docs/media/livi.png` |
| `M` | `docs/media/media.png` |
| `M` | `docs/media/settings.png` |
| `M` | `docs/media/wifi.png` |
| `D` | `ios/Info.plist` |
| `M` | `native/.cargo/config.toml` |
| `M` | `native/Cargo.lock` |
| `M` | `native/Cargo.toml` |
| `M` | `native/crates/iap2-csm/Cargo.toml` |
| `M` | `native/crates/iap2-link/Cargo.toml` |
| `M` | `native/crates/iap2-mfi/Cargo.toml` |
| `M` | `native/crates/iap2-mfi/src/file.rs` |
| `M` | `native/crates/iap2-mfi/src/linux.rs` |
| `M` | `native/crates/iap2-mfi/src/server.rs` |
| `M` | `native/crates/iap2-usbmux/Cargo.toml` |
| `M` | `native/crates/iap2-usbmux/src/android.rs` |
| `A` | `native/crates/iap2-usbmux/src/async_stream.rs` |
| `M` | `native/crates/iap2-usbmux/src/backend.rs` |
| `M` | `native/crates/iap2-usbmux/src/device.rs` |
| `D` | `native/crates/iap2-usbmux/src/error.rs` |
| `M` | `native/crates/iap2-usbmux/src/ether.rs` |
| `M` | `native/crates/iap2-usbmux/src/lib.rs` |
| `M` | `native/crates/iap2-usbmux/src/linux.rs` |
| `M` | `native/crates/iap2-usbmux/src/mux.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/android.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/linux.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/mod.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/tunnel.rs` |
| `M` | `native/crates/iap2-usbmux/src/ntb.rs` |
| `M` | `native/crates/iap2-usbmux/src/pipe.rs` |
| `M` | `native/crates/iap2-usbmux/src/usb_pipe.rs` |
| `M` | `native/crates/iap2-wired/Cargo.toml` |
| `M` | `native/crates/iap2-wired/src/carkit.rs` |
| `D` | `native/crates/iap2-wired/src/error.rs` |
| `M` | `native/crates/iap2-wired/src/lib.rs` |
| `M` | `native/crates/iap2-wired/src/mac_network.rs` |
| `D` | `native/crates/iap2-wired/src/remote.rs` |
| `M` | `native/crates/imx6ul-uboot/Cargo.toml` |
| `M` | `native/crates/livi-aa-proto/Cargo.toml` |
| `M` | `native/crates/livi-aa-stack/Cargo.toml` |
| `M` | `native/crates/livi-aa-stack/src/bridge.rs` |
| `M` | `native/crates/livi-aa-stack/src/codec.rs` |
| `M` | `native/crates/livi-aa-stack/src/commands.rs` |
| `M` | `native/crates/livi-aa-stack/src/config.rs` |
| `M` | `native/crates/livi-aa-stack/src/control.rs` |
| `M` | `native/crates/livi-aa-stack/src/helper_sock.rs` |
| `M` | `native/crates/livi-aa-stack/src/lib.rs` |
| `M` | `native/crates/livi-aa-stack/src/link.rs` |
| `M` | `native/crates/livi-aa-stack/src/log.rs` |
| `M` | `native/crates/livi-aa-stack/src/manager.rs` |
| `M` | `native/crates/livi-aa-stack/src/protocol.rs` |
| `M` | `native/crates/livi-aa-stack/src/sensors.rs` |
| `M` | `native/crates/livi-aa-stack/src/ts_vectors.rs` |
| `M` | `native/crates/livi-aa-stack/src/wire.rs` |
| `M` | `native/crates/livi-aa/Cargo.toml` |
| `D` | `native/crates/livi-aa/build.rs` |
| `M` | `native/crates/livi-aa/src/lib.rs` |
| `M` | `native/crates/livi-aa/src/session.rs` |
| `M` | `native/crates/livi-aa/src/tls.rs` |
| `M` | `native/crates/livi-aa/src/usb.rs` |
| `M` | `native/crates/livi-aaudio/Cargo.toml` |
| `M` | `native/crates/livi-aaudio/src/stream.rs` |
| `R060` | `native/crates/livi-link-hci/Cargo.toml	native/crates/livi-accessoryd/Cargo.toml` |
| `A` | `native/crates/livi-accessoryd/src/lib.rs` |
| `A` | `native/crates/livi-accessoryd/src/mgmt.rs` |
| `A` | `native/crates/livi-accessoryd/src/sdp.rs` |
| `A` | `native/crates/livi-accessoryd/src/server.rs` |
| `M` | `native/crates/livi-android/Cargo.toml` |
| `M` | `native/crates/livi-android/src/activity.rs` |
| `M` | `native/crates/livi-android/src/black.rs` |
| `M` | `native/crates/livi-android/src/bluetooth.rs` |
| `M` | `native/crates/livi-android/src/lib.rs` |
| `M` | `native/crates/livi-android/src/logcat.rs` |
| `M` | `native/crates/livi-android/src/media.rs` |
| `M` | `native/crates/livi-audio/Cargo.toml` |
| `M` | `native/crates/livi-audio/src/player.rs` |
| `M` | `native/crates/livi-audio/src/player/uplink.rs` |
| `M` | `native/crates/livi-audio/src/stream.rs` |
| `M` | `native/crates/livi-audio/src/uplink.rs` |
| `D` | `native/crates/livi-base/Cargo.toml` |
| `D` | `native/crates/livi-base/src/checksum.rs` |
| `D` | `native/crates/livi-base/src/frame.rs` |
| `D` | `native/crates/livi-base/src/fs.rs` |
| `D` | `native/crates/livi-base/src/hex.rs` |
| `D` | `native/crates/livi-base/src/lfwb.rs` |
| `D` | `native/crates/livi-base/src/lib.rs` |
| `D` | `native/crates/livi-base/src/num.rs` |
| `D` | `native/crates/livi-base/src/time.rs` |
| `M` | `native/crates/livi-bt-host/Cargo.toml` |
| `D` | `native/crates/livi-bt-host/src/error.rs` |
| `M` | `native/crates/livi-bt-host/src/hci.rs` |
| `M` | `native/crates/livi-bt-host/src/host.rs` |
| `M` | `native/crates/livi-bt-host/src/keys.rs` |
| `M` | `native/crates/livi-bt-host/src/lib.rs` |
| `A` | `native/crates/livi-btd/Cargo.toml` |
| `R088` | `native/crates/livi-link-hci/src/hci.rs	native/crates/livi-btd/src/hci.rs` |
| `R100` | `native/crates/livi-link-hci/src/host.rs	native/crates/livi-btd/src/host.rs` |
| `R100` | `native/crates/livi-link-hci/src/lib.rs	native/crates/livi-btd/src/lib.rs` |
| `R077` | `native/crates/livi-link-hci/src/linux.rs	native/crates/livi-btd/src/linux.rs` |
| `D` | `native/crates/livi-cfg/Cargo.toml` |
| `D` | `native/crates/livi-cfg/src/lib.rs` |
| `M` | `native/crates/livi-compositor/Cargo.toml` |
| `M` | `native/crates/livi-compositor/src/cal.rs` |
| `M` | `native/crates/livi-compositor/src/ctrl.rs` |
| `M` | `native/crates/livi-compositor/src/deco.rs` |
| `M` | `native/crates/livi-compositor/src/drm.rs` |
| `M` | `native/crates/livi-compositor/src/drm/modes.rs` |
| `M` | `native/crates/livi-compositor/src/drm/tests.rs` |
| `M` | `native/crates/livi-compositor/src/host.rs` |
| `M` | `native/crates/livi-compositor/src/host/tests.rs` |
| `M` | `native/crates/livi-compositor/src/layout.rs` |
| `M` | `native/crates/livi-compositor/src/projection.rs` |
| `M` | `native/crates/livi-compositor/src/render.rs` |
| `M` | `native/crates/livi-compositor/src/shell.rs` |
| `M` | `native/crates/livi-compositor/src/spawn.rs` |
| `M` | `native/crates/livi-compositor/src/state.rs` |
| `M` | `native/crates/livi-core-client/Cargo.toml` |
| `M` | `native/crates/livi-core-client/src/lib.rs` |
| `M` | `native/crates/livi-core-proto/Cargo.toml` |
| `M` | `native/crates/livi-core-proto/res/icon-120.b64` |
| `M` | `native/crates/livi-core-proto/res/icon-180.b64` |
| `M` | `native/crates/livi-core-proto/res/icon-256.b64` |
| `D` | `native/crates/livi-core-proto/src/aa_events.rs` |
| `M` | `native/crates/livi-core-proto/src/config.rs` |
| `D` | `native/crates/livi-core-proto/src/features.rs` |
| `M` | `native/crates/livi-core-proto/src/frame.rs` |
| `M` | `native/crates/livi-core-proto/src/helper.rs` |
| `D` | `native/crates/livi-core-proto/src/helper_events.rs` |
| `D` | `native/crates/livi-core-proto/src/helper_requests.rs` |
| `D` | `native/crates/livi-core-proto/src/ids.rs` |
| `M` | `native/crates/livi-core-proto/src/lib.rs` |
| `M` | `native/crates/livi-core-proto/src/message.rs` |
| `M` | `native/crates/livi-core-proto/src/state.rs` |
| `M` | `native/crates/livi-core-proto/src/telemetry.rs` |
| `M` | `native/crates/livi-core-proto/src/theme.rs` |
| `M` | `native/crates/livi-core/Cargo.toml` |
| `D` | `native/crates/livi-core/build.rs` |
| `R094` | `native/crates/livi-core/src/vehicle/aa_telemetry.rs	native/crates/livi-core/src/aa_telemetry.rs` |
| `R093` | `native/crates/livi-core/src/projection/android_auto.rs	native/crates/livi-core/src/android_auto.rs` |
| `D` | `native/crates/livi-core/src/audio.rs` |
| `R100` | `native/crates/livi-core/src/audio/audio_devices.rs	native/crates/livi-core/src/audio_devices.rs` |
| `R100` | `native/crates/livi-core/src/audio/audio_devices/android.rs	native/crates/livi-core/src/audio_devices/android.rs` |
| `R094` | `native/crates/livi-core/src/vehicle/blinker.rs	native/crates/livi-core/src/blinker.rs` |
| `M` | `native/crates/livi-core/src/camera.rs` |
| `A` | `native/crates/livi-core/src/can_telemetry.rs` |
| `R084` | `native/crates/livi-core/src/vehicle/car_bridge.rs	native/crates/livi-core/src/car_bridge.rs` |
| `R090` | `native/crates/livi-core/src/projection/carplay.rs	native/crates/livi-core/src/carplay.rs` |
| `R100` | `native/crates/livi-core/src/system/child.rs	native/crates/livi-core/src/child.rs` |
| `R087` | `native/crates/livi-core/src/files/config_file.rs	native/crates/livi-core/src/config_file.rs` |
| `A` | `native/crates/livi-core/src/cp_radio.rs` |
| `R084` | `native/crates/livi-core/src/vehicle/cp_telemetry.rs	native/crates/livi-core/src/cp_telemetry.rs` |
| `M` | `native/crates/livi-core/src/devices.rs` |
| `M` | `native/crates/livi-core/src/dongle.rs` |
| `D` | `native/crates/livi-core/src/files.rs` |
| `M` | `native/crates/livi-core/src/fonts.rs` |
| `A` | `native/crates/livi-core/src/games/controllers.rs` |
| `A` | `native/crates/livi-core/src/games/import.rs` |
| `A` | `native/crates/livi-core/src/games/launch.rs` |
| `A` | `native/crates/livi-core/src/games/library.rs` |
| `A` | `native/crates/livi-core/src/games/mod.rs` |
| `M` | `native/crates/livi-core/src/gnss/clock.rs` |
| `R099` | `native/crates/livi-core/src/gnss.rs	native/crates/livi-core/src/gnss/mod.rs` |
| `M` | `native/crates/livi-core/src/gnss/nmea.rs` |
| `D` | `native/crates/livi-core/src/gnss/nmea/decode.rs` |
| `R100` | `native/crates/livi-core/src/system/serial.rs	native/crates/livi-core/src/gnss/port.rs` |
| `M` | `native/crates/livi-core/src/gnss/timezone.rs` |
| `R094` | `native/crates/livi-core/src/system/gvfs_guard.rs	native/crates/livi-core/src/gvfs_guard.rs` |
| `A` | `native/crates/livi-core/src/haltech_can.rs` |
| `R100` | `native/crates/livi-core/src/projection/hands_free.rs	native/crates/livi-core/src/hands_free.rs` |
| `M` | `native/crates/livi-core/src/helper.rs` |
| `R095` | `native/crates/livi-core/src/system/host.rs	native/crates/livi-core/src/host.rs` |
| `R090` | `native/crates/livi-core/src/audio/host_output.rs	native/crates/livi-core/src/host_output.rs` |
| `R084` | `native/crates/livi-core/src/system/host_setup.rs	native/crates/livi-core/src/host_setup.rs` |
| `M` | `native/crates/livi-core/src/http.rs` |
| `M` | `native/crates/livi-core/src/hub.rs` |
| `R099` | `native/crates/livi-core/src/system/hwaddr.rs	native/crates/livi-core/src/hwaddr.rs` |
| `R097` | `native/crates/livi-core/src/system/kiosk_unit.rs	native/crates/livi-core/src/kiosk_unit.rs` |
| `M` | `native/crates/livi-core/src/lib.rs` |
| `A` | `native/crates/livi-core/src/livi_os.rs` |
| `A` | `native/crates/livi-core/src/local_music.rs` |
| `R099` | `native/crates/livi-core/src/files/log_file.rs	native/crates/livi-core/src/log_file.rs` |
| `M` | `native/crates/livi-core/src/main.rs` |
| `M` | `native/crates/livi-core/src/mfi.rs` |
| `A` | `native/crates/livi-core/src/minidsp.rs` |
| `A` | `native/crates/livi-core/src/music_sync.rs` |
| `R100` | `native/crates/livi-core/src/projection/nav_text.rs	native/crates/livi-core/src/nav_text.rs` |
| `R100` | `native/crates/livi-core/src/projection/nav_text_vectors.json	native/crates/livi-core/src/nav_text_vectors.json` |
| `A` | `native/crates/livi-core/src/network.rs` |
| `R076` | `native/crates/livi-core/src/gnss/nmea/encode.rs	native/crates/livi-core/src/nmea.rs` |
| `A` | `native/crates/livi-core/src/obd2.rs` |
| `A` | `native/crates/livi-core/src/os_readiness.rs` |
| `A` | `native/crates/livi-core/src/os_update.rs` |
| `R100` | `native/crates/livi-core/src/files/paths.rs	native/crates/livi-core/src/paths.rs` |
| `A` | `native/crates/livi-core/src/power.rs` |
| `R076` | `native/crates/livi-core/src/system/privileged.rs	native/crates/livi-core/src/privileged.rs` |
| `M` | `native/crates/livi-core/src/projection.rs` |
| `M` | `native/crates/livi-core/src/projection/aa.rs` |
| `D` | `native/crates/livi-core/src/projection/airplay.rs` |
| `D` | `native/crates/livi-core/src/projection/ap.rs` |
| `M` | `native/crates/livi-core/src/projection/audio.rs` |
| `M` | `native/crates/livi-core/src/projection/cp.rs` |
| `D` | `native/crates/livi-core/src/projection/cp_radio.rs` |
| `M` | `native/crates/livi-core/src/projection/input.rs` |
| `D` | `native/crates/livi-core/src/projection/players.rs` |
| `M` | `native/crates/livi-core/src/projection/sessions.rs` |
| `M` | `native/crates/livi-core/src/projection/state.rs` |
| `M` | `native/crates/livi-core/src/projection/tests.rs` |
| `D` | `native/crates/livi-core/src/radio.rs` |
| `M` | `native/crates/livi-core/src/radio/audio.rs` |
| `D` | `native/crates/livi-core/src/radio/focus.rs` |
| `R080` | `native/crates/livi-core/src/radio/receiver.rs	native/crates/livi-core/src/radio/mod.rs` |
| `M` | `native/crates/livi-core/src/radio/thread.rs` |
| `M` | `native/crates/livi-core/src/resources.rs` |
| `M` | `native/crates/livi-core/src/server.rs` |
| `M` | `native/crates/livi-core/src/services.rs` |
| `R090` | `native/crates/livi-core/src/audio/spectrum.rs	native/crates/livi-core/src/spectrum.rs` |
| `R090` | `native/crates/livi-core/src/files/state_files.rs	native/crates/livi-core/src/state_files.rs` |
| `R098` | `native/crates/livi-core/src/files/status_file.rs	native/crates/livi-core/src/status_file.rs` |
| `A` | `native/crates/livi-core/src/sun_schedule.rs` |
| `D` | `native/crates/livi-core/src/system.rs` |
| `D` | `native/crates/livi-core/src/system/power.rs` |
| `R100` | `native/crates/livi-core/src/audio/system_volume.rs	native/crates/livi-core/src/system_volume.rs` |
| `R099` | `native/crates/livi-core/src/audio/system_volume/coreaudio.rs	native/crates/livi-core/src/system_volume/coreaudio.rs` |
| `R100` | `native/crates/livi-core/src/audio/system_volume/pactl.rs	native/crates/livi-core/src/system_volume/pactl.rs` |
| `R075` | `native/crates/livi-core/src/vehicle/telemetry.rs	native/crates/livi-core/src/telemetry.rs` |
| `R097` | `native/crates/livi-core/src/vehicle/telemetry_cli.rs	native/crates/livi-core/src/telemetry_cli.rs` |
| `R099` | `native/crates/livi-core/src/projection/theme_catalog.rs	native/crates/livi-core/src/theme_catalog.rs` |
| `R095` | `native/crates/livi-core/src/system/udev_rule.rs	native/crates/livi-core/src/udev_rule.rs` |
| `M` | `native/crates/livi-core/src/ui.rs` |
| `M` | `native/crates/livi-core/src/update.rs` |
| `D` | `native/crates/livi-core/src/vehicle.rs` |
| `R083` | `native/crates/livi-core/src/system/wifi_ap.rs	native/crates/livi-core/src/wifi_ap.rs` |
| `R096` | `native/crates/livi-core/src/system/wifi_options.rs	native/crates/livi-core/src/wifi_options.rs` |
| `M` | `native/crates/livi-cp/Cargo.toml` |
| `D` | `native/crates/livi-cp/src/airplay.rs` |
| `M` | `native/crates/livi-cp/src/auth_setup.rs` |
| `M` | `native/crates/livi-cp/src/control_cipher.rs` |
| `A` | `native/crates/livi-cp/src/crypto.rs` |
| `M` | `native/crates/livi-cp/src/helper_sock.rs` |
| `M` | `native/crates/livi-cp/src/hid.rs` |
| `M` | `native/crates/livi-cp/src/hls.rs` |
| `M` | `native/crates/livi-cp/src/hls/http.rs` |
| `A` | `native/crates/livi-cp/src/hls/mp4.rs` |
| `M` | `native/crates/livi-cp/src/hls/tests.rs` |
| `M` | `native/crates/livi-cp/src/iap_tunnel.rs` |
| `M` | `native/crates/livi-cp/src/identity.rs` |
| `M` | `native/crates/livi-cp/src/image_archive.rs` |
| `M` | `native/crates/livi-cp/src/info.rs` |
| `M` | `native/crates/livi-cp/src/keep_alive.rs` |
| `M` | `native/crates/livi-cp/src/lib.rs` |
| `M` | `native/crates/livi-cp/src/manager.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/cert.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/keys.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/mod.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/session.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/wire.rs` |
| `M` | `native/crates/livi-cp/src/opack.rs` |
| `M` | `native/crates/livi-cp/src/pair_setup.rs` |
| `M` | `native/crates/livi-cp/src/pair_verify.rs` |
| `M` | `native/crates/livi-cp/src/pairings.rs` |
| `M` | `native/crates/livi-cp/src/rtsp.rs` |
| `D` | `native/crates/livi-cp/src/session_keys.rs` |
| `M` | `native/crates/livi-cp/src/srp.rs` |
| `M` | `native/crates/livi-cp/src/stack.rs` |
| `M` | `native/crates/livi-cp/src/stack/commands.rs` |
| `M` | `native/crates/livi-cp/src/stack/control.rs` |
| `M` | `native/crates/livi-cp/src/stack/data_streams.rs` |
| `M` | `native/crates/livi-cp/src/stack/events.rs` |
| `M` | `native/crates/livi-cp/src/stack/setup.rs` |
| `M` | `native/crates/livi-cp/src/stack/tests.rs` |
| `M` | `native/crates/livi-cp/src/timing.rs` |
| `M` | `native/crates/livi-cp/src/ts_vectors.json` |
| `M` | `native/crates/livi-cp/src/ts_vectors.rs` |
| `M` | `native/crates/livi-cp/src/ui_sync.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/media.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/resources.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/rules.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/tests.rs` |
| `M` | `native/crates/livi-cp/src/video_proxy.rs` |
| `M` | `native/crates/livi-crypto/Cargo.toml` |
| `M` | `native/crates/livi-crypto/src/lib.rs` |
| `M` | `native/crates/livi-dab/Cargo.toml` |
| `M` | `native/crates/livi-fm/Cargo.toml` |
| `R054` | `native/crates/livi-output/Cargo.toml	native/crates/livi-gst-host/Cargo.toml` |
| `R074` | `native/crates/livi-output/src/audio.rs	native/crates/livi-gst-host/src/audio.rs` |
| `R080` | `native/crates/livi-output/src/feed.rs	native/crates/livi-gst-host/src/feed.rs` |
| `R050` | `native/crates/livi-output/src/gst.rs	native/crates/livi-gst-host/src/gst.rs` |
| `R093` | `native/crates/livi-output/src/lib.rs	native/crates/livi-gst-host/src/lib.rs` |
| `R081` | `native/crates/livi-output/src/main.rs	native/crates/livi-gst-host/src/main.rs` |
| `R082` | `native/crates/livi-output/src/process.rs	native/crates/livi-gst-host/src/process.rs` |
| `R100` | `native/crates/livi-output/src/shown.rs	native/crates/livi-gst-host/src/shown.rs` |
| `R100` | `native/crates/livi-output/src/spectrum.rs	native/crates/livi-gst-host/src/spectrum.rs` |
| `R087` | `native/crates/livi-output/src/tests.rs	native/crates/livi-gst-host/src/tests.rs` |
| `R089` | `native/crates/livi-output/src/ui_plane.rs	native/crates/livi-gst-host/src/ui_plane.rs` |
| `R097` | `native/crates/livi-output/src/video.rs	native/crates/livi-gst-host/src/video.rs` |
| `D` | `native/crates/livi-helper-stack/src/dnssd.rs` |
| `D` | `native/crates/livi-helper-stack/src/error.rs` |
| `D` | `native/crates/livi-helper-stack/src/events.rs` |
| `D` | `native/crates/livi-helper-stack/src/livi_sock.rs` |
| `D` | `native/crates/livi-helper-stack/src/reconnect.rs` |
| `M` | `native/crates/livi-helper/Cargo.toml` |
| `D` | `native/crates/livi-helper/build.rs` |
| `M` | `native/crates/livi-helper/src/aa.rs` |
| `D` | `native/crates/livi-helper/src/bluez.rs` |
| `M` | `native/crates/livi-helper/src/bt_dongle.rs` |
| `M` | `native/crates/livi-helper/src/dongle.rs` |
| `A` | `native/crates/livi-helper/src/embedded.rs` |
| `D` | `native/crates/livi-helper/src/in_process.rs` |
| `M` | `native/crates/livi-helper/src/lib.rs` |
| `M` | `native/crates/livi-helper/src/link.rs` |
| `M` | `native/crates/livi-helper/src/wired.rs` |
| `M` | `native/crates/livi-helper/src/wireless.rs` |
| `M` | `native/crates/livi-helperd/Cargo.toml` |
| `A` | `native/crates/livi-helperd/src/aa.rs` |
| `A` | `native/crates/livi-helperd/src/link.rs` |
| `M` | `native/crates/livi-helperd/src/linux_main.rs` |
| `M` | `native/crates/livi-helperd/src/mac_main.rs` |
| `M` | `native/crates/livi-helperd/src/main.rs` |
| `A` | `native/crates/livi-helperd/src/mfi_files.rs` |
| `M` | `native/crates/livi-hfp/Cargo.toml` |
| `M` | `native/crates/livi-hfp/src/sco.rs` |
| `A` | `native/crates/livi-host-proto/Cargo.toml` |
| `R100` | `native/crates/livi-output-proto/src/display.rs	native/crates/livi-host-proto/src/display.rs` |
| `R058` | `native/crates/livi-output-proto/src/feed.rs	native/crates/livi-host-proto/src/feed.rs` |
| `R069` | `native/crates/livi-output-proto/src/lib.rs	native/crates/livi-host-proto/src/lib.rs` |
| `R100` | `native/crates/livi-output-proto/src/ops.rs	native/crates/livi-host-proto/src/ops.rs` |
| `A` | `native/crates/livi-host-proto/src/readiness.rs` |
| `R100` | `native/crates/livi-output-proto/src/ui_planes.rs	native/crates/livi-host-proto/src/ui_planes.rs` |
| `M` | `native/crates/livi-i18n/Cargo.toml` |
| `M` | `native/crates/livi-i18n/locales/de.json` |
| `M` | `native/crates/livi-i18n/locales/en.json` |
| `M` | `native/crates/livi-i18n/locales/fr.json` |
| `M` | `native/crates/livi-i18n/locales/uk.json` |
| `M` | `native/crates/livi-i18n/locales/zh.json` |
| `M` | `native/crates/livi-i18n/src/lib.rs` |
| `D` | `native/crates/livi-ios/Cargo.toml` |
| `D` | `native/crates/livi-ios/build.rs` |
| `D` | `native/crates/livi-ios/src/app.rs` |
| `D` | `native/crates/livi-ios/src/gst.rs` |
| `D` | `native/crates/livi-ios/src/main.rs` |
| `D` | `native/crates/livi-ios/src/media.rs` |
| `D` | `native/crates/livi-ios/src/paths.rs` |
| `D` | `native/crates/livi-ios/src/picker.rs` |
| `D` | `native/crates/livi-ios/src/planes.rs` |
| `D` | `native/crates/livi-ios/src/scene.rs` |
| `D` | `native/crates/livi-ios/src/screen.rs` |
| `D` | `native/crates/livi-link-ap/Cargo.toml` |
| `M` | `native/crates/livi-link-host/Cargo.toml` |
| `D` | `native/crates/livi-link-host/build.rs` |
| `A` | `native/crates/livi-link-host/src/accessory.rs` |
| `M` | `native/crates/livi-link-host/src/ap.rs` |
| `M` | `native/crates/livi-link-host/src/bt.rs` |
| `M` | `native/crates/livi-link-host/src/lib.rs` |
| `M` | `native/crates/livi-link-host/src/link.rs` |
| `M` | `native/crates/livi-link-host/src/net4.rs` |
| `M` | `native/crates/livi-link-host/src/usb_net.rs` |
| `M` | `native/crates/livi-link-provision-cli/Cargo.toml` |
| `M` | `native/crates/livi-link-provision-cli/src/main.rs` |
| `M` | `native/crates/livi-link-provision/Cargo.toml` |
| `A` | `native/crates/livi-link-provision/assets/bindshell/mipsel` |
| `M` | `native/crates/livi-link-provision/build.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/ax520/mod.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/boot.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/mtd.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/shell.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/vendor.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/lfwb.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/link.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/ota.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/web.rs` |
| `M` | `native/crates/livi-link-provision/src/lib.rs` |
| `M` | `native/crates/livi-mdns/Cargo.toml` |
| `M` | `native/crates/livi-mdns/src/daemon.rs` |
| `M` | `native/crates/livi-mdns/src/responder.rs` |
| `M` | `native/crates/livi-media/Cargo.toml` |
| `M` | `native/crates/livi-media/src/compositor.rs` |
| `R081` | `native/crates/livi-media/src/output.rs	native/crates/livi-media/src/gst_host.rs` |
| `M` | `native/crates/livi-media/src/lib.rs` |
| `M` | `native/crates/livi-media/src/planes.rs` |
| `A` | `native/crates/livi-music-sync/Cargo.toml` |
| `A` | `native/crates/livi-music-sync/src/lib.rs` |
| `A` | `native/crates/livi-music-sync/src/storage.rs` |
| `A` | `native/crates/livi-music-sync/src/transfer.rs` |
| `M` | `native/crates/livi-net/Cargo.toml` |
| `D` | `native/crates/livi-net/src/ca.rs` |
| `M` | `native/crates/livi-net/src/lib.rs` |
| `M` | `native/crates/livi-net/src/port.rs` |
| `D` | `native/crates/livi-net/src/tunnel.rs` |
| `D` | `native/crates/livi-output-proto/Cargo.toml` |
| `D` | `native/crates/livi-output-proto/src/audio.rs` |
| `D` | `native/crates/livi-output-proto/src/ctrl.rs` |
| `D` | `native/crates/livi-output/build.rs` |
| `D` | `native/crates/livi-output/src/gst/in_process.rs` |
| `D` | `native/crates/livi-output/src/gst/linux.rs` |
| `D` | `native/crates/livi-output/src/gst/mac.rs` |
| `D` | `native/crates/livi-output/src/gst/players.rs` |
| `M` | `native/crates/livi-rtlsdr/Cargo.toml` |
| `R073` | `native/crates/livi-helper-stack/Cargo.toml	native/crates/livi-runtime/Cargo.toml` |
| `R065` | `native/crates/livi-helper-stack/src/aa_sock.rs	native/crates/livi-runtime/src/aa_sock.rs` |
| `R098` | `native/crates/livi-helper-stack/src/bluetoothd.rs	native/crates/livi-runtime/src/bluetoothd.rs` |
| `R071` | `native/crates/livi-helper-stack/src/bonjour.rs	native/crates/livi-runtime/src/bonjour.rs` |
| `R097` | `native/crates/livi-helper-stack/src/bringup.rs	native/crates/livi-runtime/src/bringup.rs` |
| `R094` | `native/crates/livi-helper-stack/src/bt.rs	native/crates/livi-runtime/src/bt.rs` |
| `R079` | `native/crates/livi-helper-stack/src/clock.rs	native/crates/livi-runtime/src/clock.rs` |
| `R090` | `native/crates/livi-helper-stack/src/driver.rs	native/crates/livi-runtime/src/driver.rs` |
| `A` | `native/crates/livi-runtime/src/events.rs` |
| `R100` | `native/crates/livi-helper-stack/src/file_transfer.rs	native/crates/livi-runtime/src/file_transfer.rs` |
| `R058` | `native/crates/livi-helper-stack/src/framing.rs	native/crates/livi-runtime/src/framing.rs` |
| `R085` | `native/crates/livi-helper-stack/src/hfp.rs	native/crates/livi-runtime/src/hfp.rs` |
| `R100` | `native/crates/livi-helper-stack/src/ident.rs	native/crates/livi-runtime/src/ident.rs` |
| `R080` | `native/crates/livi-helper-stack/src/lib.rs	native/crates/livi-runtime/src/lib.rs` |
| `A` | `native/crates/livi-runtime/src/livi_sock.rs` |
| `R054` | `native/crates/livi-helper-stack/src/mfi_async.rs	native/crates/livi-runtime/src/mfi_async.rs` |
| `R077` | `native/crates/livi-helper-stack/src/net.rs	native/crates/livi-runtime/src/net.rs` |
| `R061` | `native/crates/livi-helper-stack/src/privileged.rs	native/crates/livi-runtime/src/privileged.rs` |
| `A` | `native/crates/livi-runtime/src/reconnect.rs` |
| `R090` | `native/crates/livi-helper-stack/src/sco.rs	native/crates/livi-runtime/src/sco.rs` |
| `R092` | `native/crates/livi-helper-stack/src/shared_sock.rs	native/crates/livi-runtime/src/shared_sock.rs` |
| `R088` | `native/crates/livi-helper-stack/src/state.rs	native/crates/livi-runtime/src/state.rs` |
| `R100` | `native/crates/livi-base/src/sys.rs	native/crates/livi-runtime/src/sys.rs` |
| `R087` | `native/crates/livi-helper-stack/src/vehicle.rs	native/crates/livi-runtime/src/vehicle.rs` |
| `R099` | `native/crates/livi-helper-stack/src/wifi_ap.rs	native/crates/livi-runtime/src/wifi_ap.rs` |
| `R094` | `native/crates/livi-helper-stack/tests/bringup.rs	native/crates/livi-runtime/tests/bringup.rs` |
| `R092` | `native/crates/livi-helper-stack/tests/livi_sock.rs	native/crates/livi-runtime/tests/livi_sock.rs` |
| `R091` | `native/crates/livi-helper-stack/tests/shared_sock.rs	native/crates/livi-runtime/tests/shared_sock.rs` |
| `M` | `native/crates/livi-screen-stream/Cargo.toml` |
| `M` | `native/crates/livi-screen-stream/src/lib.rs` |
| `M` | `native/crates/livi-session-io/Cargo.toml` |
| `D` | `native/crates/livi-session-io/build.rs` |
| `M` | `native/crates/livi-session-io/src/feed.rs` |
| `D` | `native/crates/livi-session-io/src/hotplug.rs` |
| `M` | `native/crates/livi-session-io/src/lib.rs` |
| `M` | `native/crates/livi-session-io/src/line.rs` |
| `M` | `native/crates/livi-session-io/src/link.rs` |
| `M` | `native/crates/livi-session-io/src/usb.rs` |
| `D` | `native/crates/livi-session-io/src/usb_absent.rs` |
| `M` | `native/crates/livi-ui-model/Cargo.toml` |
| `M` | `native/crates/livi-ui-model/src/dashboard/layout.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/mod.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/nav.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/readings.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/screens.rs` |
| `D` | `native/crates/livi-ui-model/src/dashboard/telltales.rs` |
| `A` | `native/crates/livi-ui-model/src/games.rs` |
| `M` | `native/crates/livi-ui-model/src/icons.rs` |
| `M` | `native/crates/livi-ui-model/src/keys.rs` |
| `M` | `native/crates/livi-ui-model/src/lib.rs` |
| `M` | `native/crates/livi-ui-model/src/mask.rs` |
| `M` | `native/crates/livi-ui-model/src/media.rs` |
| `A` | `native/crates/livi-ui-model/src/minidsp.rs` |
| `M` | `native/crates/livi-ui-model/src/overlay.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/color.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/car.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/devices.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/gps.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/mod.rs` |
| `A` | `native/crates/livi-ui-model/src/settings/custom/network.rs` |
| `A` | `native/crates/livi-ui-model/src/settings/custom/os_update.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/system.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/mod.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/node.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/restart.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/appearance.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/car.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/general.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/system.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/video.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/sources.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/view.rs` |
| `M` | `native/crates/livi-ui-model/src/shell.rs` |
| `M` | `native/crates/livi-ui/Cargo.toml` |
| `M` | `native/crates/livi-ui/build.rs` |
| `M` | `native/crates/livi-ui/fixtures/system.json` |
| `M` | `native/crates/livi-ui/fixtures/telemetry.json` |
| `M` | `native/crates/livi-ui/src/bundle.rs` |
| `M` | `native/crates/livi-ui/src/clock.rs` |
| `A` | `native/crates/livi-ui/src/clock_ui_tests.rs` |
| `M` | `native/crates/livi-ui/src/core_process.rs` |
| `M` | `native/crates/livi-ui/src/dashboard_ui.rs` |
| `D` | `native/crates/livi-ui/src/dock_ui.rs` |
| `M` | `native/crates/livi-ui/src/follow.rs` |
| `A` | `native/crates/livi-ui/src/games_ui.rs` |
| `M` | `native/crates/livi-ui/src/keys_ui.rs` |
| `M` | `native/crates/livi-ui/src/lib.rs` |
| `M` | `native/crates/livi-ui/src/log.rs` |
| `M` | `native/crates/livi-ui/src/main.rs` |
| `M` | `native/crates/livi-ui/src/media.rs` |
| `M` | `native/crates/livi-ui/src/media_ui.rs` |
| `A` | `native/crates/livi-ui/src/minidsp_ui.rs` |
| `M` | `native/crates/livi-ui/src/secondary.rs` |
| `M` | `native/crates/livi-ui/src/settings_ui.rs` |
| `M` | `native/crates/livi-ui/src/settings_ui/calibrate_touch.rs` |
| `M` | `native/crates/livi-ui/src/settings_ui/render.rs` |
| `D` | `native/crates/livi-ui/src/shape_ui.rs` |
| `M` | `native/crates/livi-ui/src/touch_ui.rs` |
| `M` | `native/crates/livi-ui/src/video_ui.rs` |
| `M` | `native/crates/livi-ui/ui/app.slint` |
| `A` | `native/crates/livi-ui/ui/clock.slint` |
| `M` | `native/crates/livi-ui/ui/dab.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/gauge.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/nav.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/state.slint` |
| `D` | `native/crates/livi-ui/ui/dashboard/strip.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/widgets.slint` |
| `A` | `native/crates/livi-ui/ui/fonts/D-DIN-400.otf` |
| `A` | `native/crates/livi-ui/ui/fonts/D-DIN-700.otf` |
| `A` | `native/crates/livi-ui/ui/fonts/D-DIN-OFL.txt` |
| `A` | `native/crates/livi-ui/ui/games.slint` |
| `A` | `native/crates/livi-ui/ui/icons/Add.svg` |
| `A` | `native/crates/livi-ui/ui/icons/Apps.svg` |
| `A` | `native/crates/livi-ui/ui/icons/CheckRounded.svg` |
| `A` | `native/crates/livi-ui/ui/icons/DeviceHub.svg` |
| `A` | `native/crates/livi-ui/ui/icons/MapOutlined.svg` |
| `A` | `native/crates/livi-ui/ui/icons/Place.svg` |
| `A` | `native/crates/livi-ui/ui/icons/RefreshOutlined.svg` |
| `A` | `native/crates/livi-ui/ui/icons/SportsEsportsOutlined.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleAirbag.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleAutoHighBeam.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleBrake.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleBrakeWear.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleCharging.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleChoke.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleCoolant.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleEngine.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleEsc.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleFrontFog.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleOilPressure.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleParkingLamps.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltalePassengerAirbagOff.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltalePosition.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltalePreheat.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleRearDefrost.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleRearFog.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleSeatBelt.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleSideAirbag.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleTyrePressure.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TelltaleWindscreenDefrost.svg` |
| `D` | `native/crates/livi-ui/ui/icons/TvOffOutlined.svg` |
| `A` | `native/crates/livi-ui/ui/icons/UsbOutlined.svg` |
| `A` | `native/crates/livi-ui/ui/icons/WidgetsOutlined.svg` |
| `A` | `native/crates/livi-ui/ui/icons/Wifi.svg` |
| `A` | `native/crates/livi-ui/ui/icons/WifiOff.svg` |
| `M` | `native/crates/livi-ui/ui/mask.slint` |
| `M` | `native/crates/livi-ui/ui/media.slint` |
| `M` | `native/crates/livi-ui/ui/media_parts.slint` |
| `A` | `native/crates/livi-ui/ui/minidsp.slint` |
| `M` | `native/crates/livi-ui/ui/nav.slint` |
| `M` | `native/crates/livi-ui/ui/projection.slint` |
| `M` | `native/crates/livi-ui/ui/settings/actions.slint` |
| `M` | `native/crates/livi-ui/ui/settings/controls.slint` |
| `M` | `native/crates/livi-ui/ui/settings/fields.slint` |
| `M` | `native/crates/livi-ui/ui/settings/header.slint` |
| `A` | `native/crates/livi-ui/ui/settings/join.slint` |
| `M` | `native/crates/livi-ui/ui/settings/row.slint` |
| `M` | `native/crates/livi-ui/ui/settings/view.slint` |
| `M` | `native/crates/livi-ui/ui/theme.slint` |
| `M` | `native/crates/livi-ui/ui/video_controls.slint` |
| `M` | `native/crates/livi-video-player/Cargo.toml` |
| `D` | `native/crates/livi-video-player/build.rs` |
| `R094` | `native/crates/livi-video-player/src/in_process_view.rs	native/crates/livi-video-player/src/android_view.rs` |
| `M` | `native/crates/livi-video-player/src/camera.rs` |
| `M` | `native/crates/livi-video-player/src/lib.rs` |
| `M` | `native/crates/livi-video-player/src/url_player.rs` |
| `D` | `native/crates/livi-video-player/src/view/in_process.rs` |
| `D` | `native/crates/livi-video-player/src/view/mac.rs` |
| `D` | `native/crates/livi-video-player/src/view/none.rs` |
| `M` | `native/crates/livi-video-view/Cargo.toml` |
| `M` | `native/crates/livi-video-view/build.rs` |
| `A` | `native/crates/livi-video-view/src/control.rs` |
| `M` | `native/crates/livi-video-view/src/lib.rs` |
| `M` | `native/crates/livi-video-view/src/main_thread.rs` |
| `M` | `native/crates/livi-video-view/src/planes.rs` |
| `M` | `native/crates/livi-video-view/src/screens.rs` |
| `M` | `native/crates/livi-video-view/src/server.rs` |
| `M` | `native/crates/livi-video/Cargo.toml` |
| `M` | `native/crates/livi-video/src/codec.rs` |
| `M` | `native/crates/livi-video/src/fanout.rs` |
| `M` | `native/crates/livi-web/Cargo.toml` |
| `D` | `native/crates/livi-web/src/flash.rs` |
| `D` | `native/crates/livi-web/src/http.rs` |
| `D` | `native/crates/livi-web/src/led.rs` |
| `M` | `native/crates/livi-web/src/lib.rs` |
| `D` | `native/crates/livi-web/src/status.rs` |
| `D` | `native/crates/livi-web/src/update.rs` |
| `M` | `native/crates/livi-wifi/Cargo.toml` |
| `D` | `native/crates/livi-wifi/src/error.rs` |
| `M` | `native/crates/livi-wifi/src/lib.rs` |
| `A` | `native/crates/livi-wifid/Cargo.toml` |
| `R100` | `native/crates/livi-link-ap/src/hostapd.rs	native/crates/livi-wifid/src/hostapd.rs` |
| `R100` | `native/crates/livi-link-ap/src/lib.rs	native/crates/livi-wifid/src/lib.rs` |
| `R091` | `native/crates/livi-link-ap/src/radio.rs	native/crates/livi-wifid/src/radio.rs` |
| `R085` | `native/crates/livi-link-ap/src/server.rs	native/crates/livi-wifid/src/server.rs` |
| `M` | `native/crates/livid/Cargo.toml` |
| `A` | `native/crates/livid/src/accessoryd.rs` |
| `M` | `native/crates/livid/src/bt_up.rs` |
| `M` | `native/crates/livid/src/btd.rs` |
| `M` | `native/crates/livid/src/config.rs` |
| `M` | `native/crates/livid/src/ledd.rs` |
| `M` | `native/crates/livid/src/main.rs` |
| `M` | `native/crates/livid/src/netd.rs` |
| `M` | `native/crates/livid/src/wifid.rs` |
| `M` | `native/crates/mkbootimg-v821b/Cargo.toml` |
| `M` | `native/vendor/README.md` |
| `M` | `native/vendor/femtovg/Cargo.toml` |
| `A` | `native/vendor/femtovg/book/.gitignore` |
| `A` | `native/vendor/femtovg/book/book.toml` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/0_intro.md` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/1_setting_up.md` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/1_setting_up.rs` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/2_app.png` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/2_rendering.md` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/2_rendering.rs` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/3_event_loop.md` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/3_event_loop.rs` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/3_final.png` |
| `A` | `native/vendor/femtovg/book/src/1_getting_started/3_red_paint.png` |
| `A` | `native/vendor/femtovg/book/src/SUMMARY.md` |
| `A` | `native/vendor/femtovg/book/src/demo.png` |
| `A` | `native/vendor/femtovg/book/src/index.md` |
| `A` | `native/vendor/femtovg/tests/blit_scissor_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/color_matrix_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/conic_scissor_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/gradient_dither_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/gradient_stress_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/image_update_bounds_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/image_update_contract.rs` |
| `A` | `native/vendor/femtovg/tests/integration.rs` |
| `A` | `native/vendor/femtovg/tests/rounded_rect_radii.rs` |
| `A` | `native/vendor/femtovg/tests/shadow_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/text_scale_position_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/transform2D.rs` |
| `A` | `native/vendor/femtovg/tests/uniform_slots_wgpu.rs` |
| `A` | `native/vendor/femtovg/tests/zoom_invariance_wgpu.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/androidwindowadapter.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/build.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/javahelper.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/lib.rs` |
| `M` | `native/xtask/Cargo.toml` |
| `M` | `native/xtask/src/build_native.rs` |
| `M` | `native/xtask/src/main.rs` |
| `D` | `native/xtask/src/package_ios.rs` |
| `M` | `native/xtask/src/package_linux.rs` |
| `M` | `native/xtask/src/package_mac.rs` |
| `M` | `native/xtask/src/util.rs` |
| `M` | `rust-toolchain.toml` |
| `M` | `scripts/assets.sh` |
| `M` | `scripts/gstreamer/build-backport-linux.sh` |
| `M` | `scripts/gstreamer/build-faad-android.sh` |
| `M` | `scripts/gstreamer/build-faad-macos.sh` |
| `D` | `scripts/gstreamer/build-patched-ios.sh` |
| `M` | `scripts/gstreamer/build-patched-macos.sh` |
| `D` | `scripts/gstreamer/package-ios.sh` |
| `M` | `scripts/gstreamer/package-linux.sh` |
| `M` | `scripts/gstreamer/package-macos.sh` |
| `A` | `scripts/gstreamer/patches/gst-plugins-bad/0008-v4l2codecs-preserve-compatible-capture-format.patch` |
| `A` | `scripts/gstreamer/patches/gst-plugins-bad/0009-wayland-respect-buffer-video-meta-layout.patch` |
| `A` | `scripts/gstreamer/patches/gst-plugins-bad/0010-v4l2codecs-opt-in-legacy-hevc-slice-lengths.patch` |
| `M` | `scripts/gstreamer/patches/gst-plugins-bad/series` |
| `D` | `scripts/gstreamer/patches/gst-plugins-base/0006-glwindow-eagl-retain-layer-for-update-layer.patch` |
| `D` | `scripts/gstreamer/patches/gst-plugins-base/series-ios` |
| `D` | `scripts/gstreamer/smoke-test-ios.sh` |
| `M` | `scripts/gstreamer/smoke-test-linux.sh` |
| `M` | `scripts/gstreamer/smoke-test-macos.sh` |
| `M` | `scripts/install/common.sh` |
| `M` | `scripts/install/desktop/install.sh` |
| `M` | `scripts/install/headless/install.sh` |
| `M` | `scripts/install/install.sh` |
| `M` | `scripts/install/pi/setup-hdmi-pr-display.sh` |
| `M` | `scripts/linux-arm64/build.sh` |
| `M` | `scripts/livi-link/arm/ax520/build.sh` |
| `A` | `scripts/livi-link/arm/build-userspace.sh` |
| `M` | `scripts/livi-link/arm/common.sh` |
| `M` | `scripts/livi-link/arm/imx6ul/board.sh` |
| `M` | `scripts/livi-link/arm/imx6ul/build.sh` |
| `M` | `scripts/livi-link/common/aic8800.sh` |
| `M` | `scripts/livi-link/common/bindshell/build.sh` |
| `M` | `scripts/livi-link/common/build-rootfs.sh` |
| `D` | `scripts/livi-link/common/build-userspace.sh` |
| `M` | `scripts/livi-link/common/hostapd-build.config` |
| `A` | `scripts/livi-link/common/ingenic-x1600.sh` |
| `M` | `scripts/livi-link/common/kernel.sh` |
| `M` | `scripts/livi-link/common/rootfs/usr/bin/livi-radio` |
| `A` | `scripts/livi-link/mips/build-userspace.sh` |
| `A` | `scripts/livi-link/mips/common.sh` |
| `A` | `scripts/livi-link/mips/x1600/board.sh` |
| `A` | `scripts/livi-link/mips/x1600/build.sh` |
| `A` | `scripts/livi-link/mips/x1600/initramfs/board.sh` |
| `A` | `scripts/livi-link/mips/x1600/initramfs/init` |
| `A` | `scripts/livi-link/mips/x1600/kernel-patches/0001-serial-8250-ingenic-add-x1600.patch` |
| `A` | `scripts/livi-link/mips/x1600/kernel-patches/0002-spidev-x1600-led.patch` |
| `A` | `scripts/livi-link/mips/x1600/rootfs/etc/livi/board.sh` |
| `A` | `scripts/livi-link/mips/x1600/x1600-livi-link.dts` |
| `M` | `scripts/livi-link/riscv/common.sh` |
| `M` | `scripts/livi-link/riscv/v821b/board.sh` |
| `A` | `scripts/livi-link/riscv/v821b/build-userspace.sh` |
| `M` | `scripts/livi-link/riscv/v821b/build.sh` |

## Upstream-to-fork file differences

| Status | Path |
|---|---|
| `A` | `.github/FUNDING.yml` |
| `M` | `.github/ISSUE_TEMPLATE/bug.yml` |
| `M` | `.github/ISSUE_TEMPLATE/config.yml` |
| `M` | `.github/actions/android-setup/action.yml` |
| `M` | `.github/actions/cargo-cache/restore/action.yml` |
| `D` | `.github/self-hosted-runners.md` |
| `M` | `.github/workflows/build.yml` |
| `M` | `.github/workflows/checks.yml` |
| `A` | `.github/workflows/cla.yml` |
| `M` | `.github/workflows/dependencies.yml` |
| `M` | `.github/workflows/gstreamer-assets.yml` |
| `M` | `.github/workflows/livi-link.yml` |
| `M` | `.github/workflows/maintenance.yml` |
| `A` | `.github/workflows/notification.yml` |
| `M` | `CREDITS.md` |
| `M` | `DEBUGGING.md` |
| `M` | `LIVI-LINK.md` |
| `M` | `README.md` |
| `M` | `android/gradle/wrapper/gradle-wrapper.properties` |
| `A` | `assets/displays/AUDI_RNS-E_PU_193_LT065AB3D600_800_470i_60Hz.edid` |
| `M` | `assets/displays/README.md` |
| `M` | `assets/gstreamer/android-arm64/packages.txt` |
| `M` | `assets/gstreamer/android-arm64/sha256.txt` |
| `M` | `assets/gstreamer/android-arm64/version.txt` |
| `A` | `assets/gstreamer/ios-arm64/packages.txt` |
| `A` | `assets/gstreamer/ios-arm64/sha256.txt` |
| `A` | `assets/gstreamer/ios-arm64/version.txt` |
| `M` | `assets/gstreamer/linux-arm64/sha256.txt` |
| `M` | `assets/gstreamer/linux-x64/sha256.txt` |
| `M` | `assets/gstreamer/macos-arm64/sha256.txt` |
| `M` | `assets/icons/carplay/livi.png` |
| `M` | `assets/icons/linux/livi.png` |
| `A` | `assets/icons/livi.png` |
| `M` | `assets/icons/mac/livi.icns` |
| `M` | `assets/linux/99-LIVI-helper.sudoers.template` |
| `D` | `assets/linux/livi-os-display-api` |
| `D` | `assets/linux/livi-os-helper-api` |
| `M` | `assets/linux/livi-wifi-ap.service.template` |
| `M` | `assets/livi-link-provision/linux-arm64.json` |
| `M` | `assets/livi-link-provision/linux-x64.json` |
| `M` | `assets/livi-link-provision/macos-arm64.json` |
| `M` | `assets/livi-link-provision/macos-x64.json` |
| `M` | `assets/livi-link/ax520_aic8800d80/firmware.json` |
| `M` | `assets/livi-link/imx6ul_bcm4354/firmware.json` |
| `M` | `assets/livi-link/imx6ul_iw416/firmware.json` |
| `M` | `assets/livi-link/imx6ul_rtl8822bs/firmware.json` |
| `M` | `assets/livi-link/imx6ul_rtl8822cs/firmware.json` |
| `M` | `assets/livi-link/v821b_aic8800d80/firmware.json` |
| `D` | `assets/livi-link/x1600_aic8800d80/firmware.json` |
| `D` | `docs/LIVI-OS.md` |
| `M` | `docs/index.html` |
| `D` | `docs/media/area/dash_safe_area_aa.png` |
| `D` | `docs/media/area/main_safe_area_view_area_aa.png` |
| `M` | `docs/media/banner.png` |
| `M` | `docs/media/color.png` |
| `M` | `docs/media/connections.png` |
| `M` | `docs/media/contrast_gamma.png` |
| `M` | `docs/media/dabplus.png` |
| `M` | `docs/media/dash.png` |
| `M` | `docs/media/devices.png` |
| `A` | `docs/media/gps/gps.png` |
| `D` | `docs/media/gps/gps_hw.png` |
| `D` | `docs/media/gps/gps_info.png` |
| `M` | `docs/media/livi.png` |
| `M` | `docs/media/media.png` |
| `M` | `docs/media/settings.png` |
| `M` | `docs/media/wifi.png` |
| `A` | `ios/Info.plist` |
| `M` | `native/.cargo/config.toml` |
| `M` | `native/Cargo.lock` |
| `M` | `native/Cargo.toml` |
| `M` | `native/crates/iap2-csm/Cargo.toml` |
| `M` | `native/crates/iap2-link/Cargo.toml` |
| `M` | `native/crates/iap2-mfi/Cargo.toml` |
| `M` | `native/crates/iap2-mfi/src/file.rs` |
| `M` | `native/crates/iap2-mfi/src/linux.rs` |
| `M` | `native/crates/iap2-mfi/src/server.rs` |
| `M` | `native/crates/iap2-usbmux/Cargo.toml` |
| `M` | `native/crates/iap2-usbmux/src/android.rs` |
| `D` | `native/crates/iap2-usbmux/src/async_stream.rs` |
| `M` | `native/crates/iap2-usbmux/src/backend.rs` |
| `M` | `native/crates/iap2-usbmux/src/device.rs` |
| `A` | `native/crates/iap2-usbmux/src/error.rs` |
| `M` | `native/crates/iap2-usbmux/src/ether.rs` |
| `M` | `native/crates/iap2-usbmux/src/lib.rs` |
| `M` | `native/crates/iap2-usbmux/src/linux.rs` |
| `M` | `native/crates/iap2-usbmux/src/mux.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/android.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/linux.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/mod.rs` |
| `M` | `native/crates/iap2-usbmux/src/ncm/tunnel.rs` |
| `M` | `native/crates/iap2-usbmux/src/ntb.rs` |
| `M` | `native/crates/iap2-usbmux/src/pipe.rs` |
| `M` | `native/crates/iap2-usbmux/src/usb_pipe.rs` |
| `M` | `native/crates/iap2-wired/Cargo.toml` |
| `M` | `native/crates/iap2-wired/src/carkit.rs` |
| `A` | `native/crates/iap2-wired/src/error.rs` |
| `M` | `native/crates/iap2-wired/src/lib.rs` |
| `M` | `native/crates/iap2-wired/src/mac_network.rs` |
| `A` | `native/crates/iap2-wired/src/remote.rs` |
| `M` | `native/crates/imx6ul-uboot/Cargo.toml` |
| `M` | `native/crates/livi-aa-proto/Cargo.toml` |
| `M` | `native/crates/livi-aa-stack/Cargo.toml` |
| `M` | `native/crates/livi-aa-stack/src/bridge.rs` |
| `M` | `native/crates/livi-aa-stack/src/codec.rs` |
| `M` | `native/crates/livi-aa-stack/src/commands.rs` |
| `M` | `native/crates/livi-aa-stack/src/config.rs` |
| `M` | `native/crates/livi-aa-stack/src/control.rs` |
| `M` | `native/crates/livi-aa-stack/src/helper_sock.rs` |
| `M` | `native/crates/livi-aa-stack/src/lib.rs` |
| `M` | `native/crates/livi-aa-stack/src/link.rs` |
| `M` | `native/crates/livi-aa-stack/src/log.rs` |
| `M` | `native/crates/livi-aa-stack/src/manager.rs` |
| `M` | `native/crates/livi-aa-stack/src/protocol.rs` |
| `M` | `native/crates/livi-aa-stack/src/sensors.rs` |
| `M` | `native/crates/livi-aa-stack/src/ts_vectors.rs` |
| `M` | `native/crates/livi-aa-stack/src/wire.rs` |
| `M` | `native/crates/livi-aa/Cargo.toml` |
| `A` | `native/crates/livi-aa/build.rs` |
| `M` | `native/crates/livi-aa/src/lib.rs` |
| `M` | `native/crates/livi-aa/src/session.rs` |
| `M` | `native/crates/livi-aa/src/tls.rs` |
| `M` | `native/crates/livi-aa/src/usb.rs` |
| `M` | `native/crates/livi-aaudio/Cargo.toml` |
| `M` | `native/crates/livi-aaudio/src/stream.rs` |
| `D` | `native/crates/livi-accessoryd/src/lib.rs` |
| `D` | `native/crates/livi-accessoryd/src/mgmt.rs` |
| `D` | `native/crates/livi-accessoryd/src/sdp.rs` |
| `D` | `native/crates/livi-accessoryd/src/server.rs` |
| `M` | `native/crates/livi-android/Cargo.toml` |
| `M` | `native/crates/livi-android/src/activity.rs` |
| `M` | `native/crates/livi-android/src/black.rs` |
| `M` | `native/crates/livi-android/src/bluetooth.rs` |
| `M` | `native/crates/livi-android/src/lib.rs` |
| `M` | `native/crates/livi-android/src/logcat.rs` |
| `M` | `native/crates/livi-android/src/media.rs` |
| `M` | `native/crates/livi-audio/Cargo.toml` |
| `M` | `native/crates/livi-audio/src/player.rs` |
| `M` | `native/crates/livi-audio/src/player/uplink.rs` |
| `M` | `native/crates/livi-audio/src/stream.rs` |
| `M` | `native/crates/livi-audio/src/uplink.rs` |
| `A` | `native/crates/livi-base/Cargo.toml` |
| `A` | `native/crates/livi-base/src/checksum.rs` |
| `A` | `native/crates/livi-base/src/frame.rs` |
| `A` | `native/crates/livi-base/src/fs.rs` |
| `A` | `native/crates/livi-base/src/hex.rs` |
| `A` | `native/crates/livi-base/src/lfwb.rs` |
| `A` | `native/crates/livi-base/src/lib.rs` |
| `A` | `native/crates/livi-base/src/num.rs` |
| `R100` | `native/crates/livi-runtime/src/sys.rs	native/crates/livi-base/src/sys.rs` |
| `A` | `native/crates/livi-base/src/time.rs` |
| `M` | `native/crates/livi-bt-host/Cargo.toml` |
| `A` | `native/crates/livi-bt-host/src/error.rs` |
| `M` | `native/crates/livi-bt-host/src/hci.rs` |
| `M` | `native/crates/livi-bt-host/src/host.rs` |
| `M` | `native/crates/livi-bt-host/src/keys.rs` |
| `M` | `native/crates/livi-bt-host/src/lib.rs` |
| `D` | `native/crates/livi-btd/Cargo.toml` |
| `A` | `native/crates/livi-cfg/Cargo.toml` |
| `A` | `native/crates/livi-cfg/src/lib.rs` |
| `M` | `native/crates/livi-compositor/Cargo.toml` |
| `M` | `native/crates/livi-compositor/src/cal.rs` |
| `M` | `native/crates/livi-compositor/src/ctrl.rs` |
| `M` | `native/crates/livi-compositor/src/deco.rs` |
| `M` | `native/crates/livi-compositor/src/drm.rs` |
| `M` | `native/crates/livi-compositor/src/drm/modes.rs` |
| `M` | `native/crates/livi-compositor/src/drm/tests.rs` |
| `M` | `native/crates/livi-compositor/src/host.rs` |
| `M` | `native/crates/livi-compositor/src/host/tests.rs` |
| `M` | `native/crates/livi-compositor/src/layout.rs` |
| `M` | `native/crates/livi-compositor/src/projection.rs` |
| `M` | `native/crates/livi-compositor/src/render.rs` |
| `M` | `native/crates/livi-compositor/src/shell.rs` |
| `M` | `native/crates/livi-compositor/src/spawn.rs` |
| `M` | `native/crates/livi-compositor/src/state.rs` |
| `M` | `native/crates/livi-core-client/Cargo.toml` |
| `M` | `native/crates/livi-core-client/src/lib.rs` |
| `M` | `native/crates/livi-core-proto/Cargo.toml` |
| `M` | `native/crates/livi-core-proto/res/icon-120.b64` |
| `M` | `native/crates/livi-core-proto/res/icon-180.b64` |
| `M` | `native/crates/livi-core-proto/res/icon-256.b64` |
| `A` | `native/crates/livi-core-proto/src/aa_events.rs` |
| `M` | `native/crates/livi-core-proto/src/config.rs` |
| `A` | `native/crates/livi-core-proto/src/features.rs` |
| `M` | `native/crates/livi-core-proto/src/frame.rs` |
| `M` | `native/crates/livi-core-proto/src/helper.rs` |
| `A` | `native/crates/livi-core-proto/src/helper_events.rs` |
| `A` | `native/crates/livi-core-proto/src/helper_requests.rs` |
| `A` | `native/crates/livi-core-proto/src/ids.rs` |
| `M` | `native/crates/livi-core-proto/src/lib.rs` |
| `M` | `native/crates/livi-core-proto/src/message.rs` |
| `M` | `native/crates/livi-core-proto/src/state.rs` |
| `M` | `native/crates/livi-core-proto/src/telemetry.rs` |
| `M` | `native/crates/livi-core-proto/src/theme.rs` |
| `M` | `native/crates/livi-core/Cargo.toml` |
| `A` | `native/crates/livi-core/build.rs` |
| `A` | `native/crates/livi-core/src/audio.rs` |
| `R100` | `native/crates/livi-core/src/audio_devices.rs	native/crates/livi-core/src/audio/audio_devices.rs` |
| `R100` | `native/crates/livi-core/src/audio_devices/android.rs	native/crates/livi-core/src/audio/audio_devices/android.rs` |
| `R090` | `native/crates/livi-core/src/host_output.rs	native/crates/livi-core/src/audio/host_output.rs` |
| `R090` | `native/crates/livi-core/src/spectrum.rs	native/crates/livi-core/src/audio/spectrum.rs` |
| `R100` | `native/crates/livi-core/src/system_volume.rs	native/crates/livi-core/src/audio/system_volume.rs` |
| `R099` | `native/crates/livi-core/src/system_volume/coreaudio.rs	native/crates/livi-core/src/audio/system_volume/coreaudio.rs` |
| `R100` | `native/crates/livi-core/src/system_volume/pactl.rs	native/crates/livi-core/src/audio/system_volume/pactl.rs` |
| `M` | `native/crates/livi-core/src/camera.rs` |
| `D` | `native/crates/livi-core/src/can_telemetry.rs` |
| `D` | `native/crates/livi-core/src/cp_radio.rs` |
| `M` | `native/crates/livi-core/src/devices.rs` |
| `M` | `native/crates/livi-core/src/dongle.rs` |
| `A` | `native/crates/livi-core/src/files.rs` |
| `R087` | `native/crates/livi-core/src/config_file.rs	native/crates/livi-core/src/files/config_file.rs` |
| `R099` | `native/crates/livi-core/src/log_file.rs	native/crates/livi-core/src/files/log_file.rs` |
| `R100` | `native/crates/livi-core/src/paths.rs	native/crates/livi-core/src/files/paths.rs` |
| `R090` | `native/crates/livi-core/src/state_files.rs	native/crates/livi-core/src/files/state_files.rs` |
| `R098` | `native/crates/livi-core/src/status_file.rs	native/crates/livi-core/src/files/status_file.rs` |
| `M` | `native/crates/livi-core/src/fonts.rs` |
| `D` | `native/crates/livi-core/src/games/controllers.rs` |
| `D` | `native/crates/livi-core/src/games/import.rs` |
| `D` | `native/crates/livi-core/src/games/launch.rs` |
| `D` | `native/crates/livi-core/src/games/library.rs` |
| `D` | `native/crates/livi-core/src/games/mod.rs` |
| `R099` | `native/crates/livi-core/src/gnss/mod.rs	native/crates/livi-core/src/gnss.rs` |
| `M` | `native/crates/livi-core/src/gnss/clock.rs` |
| `M` | `native/crates/livi-core/src/gnss/nmea.rs` |
| `A` | `native/crates/livi-core/src/gnss/nmea/decode.rs` |
| `R076` | `native/crates/livi-core/src/nmea.rs	native/crates/livi-core/src/gnss/nmea/encode.rs` |
| `M` | `native/crates/livi-core/src/gnss/timezone.rs` |
| `D` | `native/crates/livi-core/src/haltech_can.rs` |
| `M` | `native/crates/livi-core/src/helper.rs` |
| `M` | `native/crates/livi-core/src/http.rs` |
| `M` | `native/crates/livi-core/src/hub.rs` |
| `M` | `native/crates/livi-core/src/lib.rs` |
| `D` | `native/crates/livi-core/src/livi_os.rs` |
| `D` | `native/crates/livi-core/src/local_music.rs` |
| `M` | `native/crates/livi-core/src/main.rs` |
| `M` | `native/crates/livi-core/src/mfi.rs` |
| `D` | `native/crates/livi-core/src/minidsp.rs` |
| `D` | `native/crates/livi-core/src/music_sync.rs` |
| `D` | `native/crates/livi-core/src/network.rs` |
| `D` | `native/crates/livi-core/src/obd2.rs` |
| `D` | `native/crates/livi-core/src/os_readiness.rs` |
| `D` | `native/crates/livi-core/src/os_update.rs` |
| `D` | `native/crates/livi-core/src/power.rs` |
| `M` | `native/crates/livi-core/src/projection.rs` |
| `M` | `native/crates/livi-core/src/projection/aa.rs` |
| `A` | `native/crates/livi-core/src/projection/airplay.rs` |
| `R093` | `native/crates/livi-core/src/android_auto.rs	native/crates/livi-core/src/projection/android_auto.rs` |
| `A` | `native/crates/livi-core/src/projection/ap.rs` |
| `M` | `native/crates/livi-core/src/projection/audio.rs` |
| `R090` | `native/crates/livi-core/src/carplay.rs	native/crates/livi-core/src/projection/carplay.rs` |
| `M` | `native/crates/livi-core/src/projection/cp.rs` |
| `A` | `native/crates/livi-core/src/projection/cp_radio.rs` |
| `R100` | `native/crates/livi-core/src/hands_free.rs	native/crates/livi-core/src/projection/hands_free.rs` |
| `M` | `native/crates/livi-core/src/projection/input.rs` |
| `R100` | `native/crates/livi-core/src/nav_text.rs	native/crates/livi-core/src/projection/nav_text.rs` |
| `R100` | `native/crates/livi-core/src/nav_text_vectors.json	native/crates/livi-core/src/projection/nav_text_vectors.json` |
| `A` | `native/crates/livi-core/src/projection/players.rs` |
| `M` | `native/crates/livi-core/src/projection/sessions.rs` |
| `M` | `native/crates/livi-core/src/projection/state.rs` |
| `M` | `native/crates/livi-core/src/projection/tests.rs` |
| `R099` | `native/crates/livi-core/src/theme_catalog.rs	native/crates/livi-core/src/projection/theme_catalog.rs` |
| `A` | `native/crates/livi-core/src/radio.rs` |
| `M` | `native/crates/livi-core/src/radio/audio.rs` |
| `A` | `native/crates/livi-core/src/radio/focus.rs` |
| `R080` | `native/crates/livi-core/src/radio/mod.rs	native/crates/livi-core/src/radio/receiver.rs` |
| `M` | `native/crates/livi-core/src/radio/thread.rs` |
| `M` | `native/crates/livi-core/src/resources.rs` |
| `M` | `native/crates/livi-core/src/server.rs` |
| `M` | `native/crates/livi-core/src/services.rs` |
| `D` | `native/crates/livi-core/src/sun_schedule.rs` |
| `A` | `native/crates/livi-core/src/system.rs` |
| `R100` | `native/crates/livi-core/src/child.rs	native/crates/livi-core/src/system/child.rs` |
| `R094` | `native/crates/livi-core/src/gvfs_guard.rs	native/crates/livi-core/src/system/gvfs_guard.rs` |
| `R095` | `native/crates/livi-core/src/host.rs	native/crates/livi-core/src/system/host.rs` |
| `R084` | `native/crates/livi-core/src/host_setup.rs	native/crates/livi-core/src/system/host_setup.rs` |
| `R099` | `native/crates/livi-core/src/hwaddr.rs	native/crates/livi-core/src/system/hwaddr.rs` |
| `R097` | `native/crates/livi-core/src/kiosk_unit.rs	native/crates/livi-core/src/system/kiosk_unit.rs` |
| `A` | `native/crates/livi-core/src/system/power.rs` |
| `R076` | `native/crates/livi-core/src/privileged.rs	native/crates/livi-core/src/system/privileged.rs` |
| `R100` | `native/crates/livi-core/src/gnss/port.rs	native/crates/livi-core/src/system/serial.rs` |
| `R095` | `native/crates/livi-core/src/udev_rule.rs	native/crates/livi-core/src/system/udev_rule.rs` |
| `R083` | `native/crates/livi-core/src/wifi_ap.rs	native/crates/livi-core/src/system/wifi_ap.rs` |
| `R096` | `native/crates/livi-core/src/wifi_options.rs	native/crates/livi-core/src/system/wifi_options.rs` |
| `M` | `native/crates/livi-core/src/ui.rs` |
| `M` | `native/crates/livi-core/src/update.rs` |
| `A` | `native/crates/livi-core/src/vehicle.rs` |
| `R094` | `native/crates/livi-core/src/aa_telemetry.rs	native/crates/livi-core/src/vehicle/aa_telemetry.rs` |
| `R094` | `native/crates/livi-core/src/blinker.rs	native/crates/livi-core/src/vehicle/blinker.rs` |
| `R084` | `native/crates/livi-core/src/car_bridge.rs	native/crates/livi-core/src/vehicle/car_bridge.rs` |
| `R084` | `native/crates/livi-core/src/cp_telemetry.rs	native/crates/livi-core/src/vehicle/cp_telemetry.rs` |
| `R075` | `native/crates/livi-core/src/telemetry.rs	native/crates/livi-core/src/vehicle/telemetry.rs` |
| `R097` | `native/crates/livi-core/src/telemetry_cli.rs	native/crates/livi-core/src/vehicle/telemetry_cli.rs` |
| `M` | `native/crates/livi-cp/Cargo.toml` |
| `A` | `native/crates/livi-cp/src/airplay.rs` |
| `M` | `native/crates/livi-cp/src/auth_setup.rs` |
| `M` | `native/crates/livi-cp/src/control_cipher.rs` |
| `D` | `native/crates/livi-cp/src/crypto.rs` |
| `M` | `native/crates/livi-cp/src/helper_sock.rs` |
| `M` | `native/crates/livi-cp/src/hid.rs` |
| `M` | `native/crates/livi-cp/src/hls.rs` |
| `M` | `native/crates/livi-cp/src/hls/http.rs` |
| `D` | `native/crates/livi-cp/src/hls/mp4.rs` |
| `M` | `native/crates/livi-cp/src/hls/tests.rs` |
| `M` | `native/crates/livi-cp/src/iap_tunnel.rs` |
| `M` | `native/crates/livi-cp/src/identity.rs` |
| `M` | `native/crates/livi-cp/src/image_archive.rs` |
| `M` | `native/crates/livi-cp/src/info.rs` |
| `M` | `native/crates/livi-cp/src/keep_alive.rs` |
| `M` | `native/crates/livi-cp/src/lib.rs` |
| `M` | `native/crates/livi-cp/src/manager.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/cert.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/keys.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/mod.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/session.rs` |
| `M` | `native/crates/livi-cp/src/mfi4/wire.rs` |
| `M` | `native/crates/livi-cp/src/opack.rs` |
| `M` | `native/crates/livi-cp/src/pair_setup.rs` |
| `M` | `native/crates/livi-cp/src/pair_verify.rs` |
| `M` | `native/crates/livi-cp/src/pairings.rs` |
| `M` | `native/crates/livi-cp/src/rtsp.rs` |
| `A` | `native/crates/livi-cp/src/session_keys.rs` |
| `M` | `native/crates/livi-cp/src/srp.rs` |
| `M` | `native/crates/livi-cp/src/stack.rs` |
| `M` | `native/crates/livi-cp/src/stack/commands.rs` |
| `M` | `native/crates/livi-cp/src/stack/control.rs` |
| `M` | `native/crates/livi-cp/src/stack/data_streams.rs` |
| `M` | `native/crates/livi-cp/src/stack/events.rs` |
| `M` | `native/crates/livi-cp/src/stack/setup.rs` |
| `M` | `native/crates/livi-cp/src/stack/tests.rs` |
| `M` | `native/crates/livi-cp/src/timing.rs` |
| `M` | `native/crates/livi-cp/src/ts_vectors.json` |
| `M` | `native/crates/livi-cp/src/ts_vectors.rs` |
| `M` | `native/crates/livi-cp/src/ui_sync.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/media.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/resources.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/rules.rs` |
| `M` | `native/crates/livi-cp/src/vehicle_state/tests.rs` |
| `M` | `native/crates/livi-cp/src/video_proxy.rs` |
| `M` | `native/crates/livi-crypto/Cargo.toml` |
| `M` | `native/crates/livi-crypto/src/lib.rs` |
| `M` | `native/crates/livi-dab/Cargo.toml` |
| `M` | `native/crates/livi-fm/Cargo.toml` |
| `R073` | `native/crates/livi-runtime/Cargo.toml	native/crates/livi-helper-stack/Cargo.toml` |
| `R065` | `native/crates/livi-runtime/src/aa_sock.rs	native/crates/livi-helper-stack/src/aa_sock.rs` |
| `R098` | `native/crates/livi-runtime/src/bluetoothd.rs	native/crates/livi-helper-stack/src/bluetoothd.rs` |
| `R071` | `native/crates/livi-runtime/src/bonjour.rs	native/crates/livi-helper-stack/src/bonjour.rs` |
| `R097` | `native/crates/livi-runtime/src/bringup.rs	native/crates/livi-helper-stack/src/bringup.rs` |
| `R094` | `native/crates/livi-runtime/src/bt.rs	native/crates/livi-helper-stack/src/bt.rs` |
| `R079` | `native/crates/livi-runtime/src/clock.rs	native/crates/livi-helper-stack/src/clock.rs` |
| `A` | `native/crates/livi-helper-stack/src/dnssd.rs` |
| `R090` | `native/crates/livi-runtime/src/driver.rs	native/crates/livi-helper-stack/src/driver.rs` |
| `A` | `native/crates/livi-helper-stack/src/error.rs` |
| `A` | `native/crates/livi-helper-stack/src/events.rs` |
| `R100` | `native/crates/livi-runtime/src/file_transfer.rs	native/crates/livi-helper-stack/src/file_transfer.rs` |
| `R058` | `native/crates/livi-runtime/src/framing.rs	native/crates/livi-helper-stack/src/framing.rs` |
| `R085` | `native/crates/livi-runtime/src/hfp.rs	native/crates/livi-helper-stack/src/hfp.rs` |
| `R100` | `native/crates/livi-runtime/src/ident.rs	native/crates/livi-helper-stack/src/ident.rs` |
| `R080` | `native/crates/livi-runtime/src/lib.rs	native/crates/livi-helper-stack/src/lib.rs` |
| `A` | `native/crates/livi-helper-stack/src/livi_sock.rs` |
| `R054` | `native/crates/livi-runtime/src/mfi_async.rs	native/crates/livi-helper-stack/src/mfi_async.rs` |
| `R077` | `native/crates/livi-runtime/src/net.rs	native/crates/livi-helper-stack/src/net.rs` |
| `R061` | `native/crates/livi-runtime/src/privileged.rs	native/crates/livi-helper-stack/src/privileged.rs` |
| `A` | `native/crates/livi-helper-stack/src/reconnect.rs` |
| `R090` | `native/crates/livi-runtime/src/sco.rs	native/crates/livi-helper-stack/src/sco.rs` |
| `R092` | `native/crates/livi-runtime/src/shared_sock.rs	native/crates/livi-helper-stack/src/shared_sock.rs` |
| `R088` | `native/crates/livi-runtime/src/state.rs	native/crates/livi-helper-stack/src/state.rs` |
| `R087` | `native/crates/livi-runtime/src/vehicle.rs	native/crates/livi-helper-stack/src/vehicle.rs` |
| `R099` | `native/crates/livi-runtime/src/wifi_ap.rs	native/crates/livi-helper-stack/src/wifi_ap.rs` |
| `R094` | `native/crates/livi-runtime/tests/bringup.rs	native/crates/livi-helper-stack/tests/bringup.rs` |
| `R092` | `native/crates/livi-runtime/tests/livi_sock.rs	native/crates/livi-helper-stack/tests/livi_sock.rs` |
| `R091` | `native/crates/livi-runtime/tests/shared_sock.rs	native/crates/livi-helper-stack/tests/shared_sock.rs` |
| `M` | `native/crates/livi-helper/Cargo.toml` |
| `A` | `native/crates/livi-helper/build.rs` |
| `M` | `native/crates/livi-helper/src/aa.rs` |
| `A` | `native/crates/livi-helper/src/bluez.rs` |
| `M` | `native/crates/livi-helper/src/bt_dongle.rs` |
| `M` | `native/crates/livi-helper/src/dongle.rs` |
| `D` | `native/crates/livi-helper/src/embedded.rs` |
| `A` | `native/crates/livi-helper/src/in_process.rs` |
| `M` | `native/crates/livi-helper/src/lib.rs` |
| `M` | `native/crates/livi-helper/src/link.rs` |
| `M` | `native/crates/livi-helper/src/wired.rs` |
| `M` | `native/crates/livi-helper/src/wireless.rs` |
| `M` | `native/crates/livi-helperd/Cargo.toml` |
| `D` | `native/crates/livi-helperd/src/aa.rs` |
| `D` | `native/crates/livi-helperd/src/link.rs` |
| `M` | `native/crates/livi-helperd/src/linux_main.rs` |
| `M` | `native/crates/livi-helperd/src/mac_main.rs` |
| `M` | `native/crates/livi-helperd/src/main.rs` |
| `D` | `native/crates/livi-helperd/src/mfi_files.rs` |
| `M` | `native/crates/livi-hfp/Cargo.toml` |
| `M` | `native/crates/livi-hfp/src/sco.rs` |
| `D` | `native/crates/livi-host-proto/Cargo.toml` |
| `D` | `native/crates/livi-host-proto/src/readiness.rs` |
| `M` | `native/crates/livi-i18n/Cargo.toml` |
| `M` | `native/crates/livi-i18n/locales/de.json` |
| `M` | `native/crates/livi-i18n/locales/en.json` |
| `M` | `native/crates/livi-i18n/locales/fr.json` |
| `M` | `native/crates/livi-i18n/locales/uk.json` |
| `M` | `native/crates/livi-i18n/locales/zh.json` |
| `M` | `native/crates/livi-i18n/src/lib.rs` |
| `A` | `native/crates/livi-ios/Cargo.toml` |
| `A` | `native/crates/livi-ios/build.rs` |
| `A` | `native/crates/livi-ios/src/app.rs` |
| `A` | `native/crates/livi-ios/src/gst.rs` |
| `A` | `native/crates/livi-ios/src/main.rs` |
| `A` | `native/crates/livi-ios/src/media.rs` |
| `A` | `native/crates/livi-ios/src/paths.rs` |
| `A` | `native/crates/livi-ios/src/picker.rs` |
| `A` | `native/crates/livi-ios/src/planes.rs` |
| `A` | `native/crates/livi-ios/src/scene.rs` |
| `A` | `native/crates/livi-ios/src/screen.rs` |
| `A` | `native/crates/livi-link-ap/Cargo.toml` |
| `R100` | `native/crates/livi-wifid/src/hostapd.rs	native/crates/livi-link-ap/src/hostapd.rs` |
| `R100` | `native/crates/livi-wifid/src/lib.rs	native/crates/livi-link-ap/src/lib.rs` |
| `R091` | `native/crates/livi-wifid/src/radio.rs	native/crates/livi-link-ap/src/radio.rs` |
| `R085` | `native/crates/livi-wifid/src/server.rs	native/crates/livi-link-ap/src/server.rs` |
| `R060` | `native/crates/livi-accessoryd/Cargo.toml	native/crates/livi-link-hci/Cargo.toml` |
| `R088` | `native/crates/livi-btd/src/hci.rs	native/crates/livi-link-hci/src/hci.rs` |
| `R100` | `native/crates/livi-btd/src/host.rs	native/crates/livi-link-hci/src/host.rs` |
| `R100` | `native/crates/livi-btd/src/lib.rs	native/crates/livi-link-hci/src/lib.rs` |
| `R077` | `native/crates/livi-btd/src/linux.rs	native/crates/livi-link-hci/src/linux.rs` |
| `M` | `native/crates/livi-link-host/Cargo.toml` |
| `A` | `native/crates/livi-link-host/build.rs` |
| `D` | `native/crates/livi-link-host/src/accessory.rs` |
| `M` | `native/crates/livi-link-host/src/ap.rs` |
| `M` | `native/crates/livi-link-host/src/bt.rs` |
| `M` | `native/crates/livi-link-host/src/lib.rs` |
| `M` | `native/crates/livi-link-host/src/link.rs` |
| `M` | `native/crates/livi-link-host/src/net4.rs` |
| `M` | `native/crates/livi-link-host/src/usb_net.rs` |
| `M` | `native/crates/livi-link-provision-cli/Cargo.toml` |
| `M` | `native/crates/livi-link-provision-cli/src/main.rs` |
| `M` | `native/crates/livi-link-provision/Cargo.toml` |
| `D` | `native/crates/livi-link-provision/assets/bindshell/mipsel` |
| `M` | `native/crates/livi-link-provision/build.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/ax520/mod.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/boot.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/mtd.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/shell.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/arm/imx6ul/vendor.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/lfwb.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/link.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/ota.rs` |
| `M` | `native/crates/livi-link-provision/src/dongle/web.rs` |
| `M` | `native/crates/livi-link-provision/src/lib.rs` |
| `M` | `native/crates/livi-mdns/Cargo.toml` |
| `M` | `native/crates/livi-mdns/src/daemon.rs` |
| `M` | `native/crates/livi-mdns/src/responder.rs` |
| `M` | `native/crates/livi-media/Cargo.toml` |
| `M` | `native/crates/livi-media/src/compositor.rs` |
| `M` | `native/crates/livi-media/src/lib.rs` |
| `R081` | `native/crates/livi-media/src/gst_host.rs	native/crates/livi-media/src/output.rs` |
| `M` | `native/crates/livi-media/src/planes.rs` |
| `D` | `native/crates/livi-music-sync/Cargo.toml` |
| `D` | `native/crates/livi-music-sync/src/lib.rs` |
| `D` | `native/crates/livi-music-sync/src/storage.rs` |
| `D` | `native/crates/livi-music-sync/src/transfer.rs` |
| `M` | `native/crates/livi-net/Cargo.toml` |
| `A` | `native/crates/livi-net/src/ca.rs` |
| `M` | `native/crates/livi-net/src/lib.rs` |
| `M` | `native/crates/livi-net/src/port.rs` |
| `A` | `native/crates/livi-net/src/tunnel.rs` |
| `A` | `native/crates/livi-output-proto/Cargo.toml` |
| `A` | `native/crates/livi-output-proto/src/audio.rs` |
| `A` | `native/crates/livi-output-proto/src/ctrl.rs` |
| `R100` | `native/crates/livi-host-proto/src/display.rs	native/crates/livi-output-proto/src/display.rs` |
| `R058` | `native/crates/livi-host-proto/src/feed.rs	native/crates/livi-output-proto/src/feed.rs` |
| `R069` | `native/crates/livi-host-proto/src/lib.rs	native/crates/livi-output-proto/src/lib.rs` |
| `R100` | `native/crates/livi-host-proto/src/ops.rs	native/crates/livi-output-proto/src/ops.rs` |
| `R100` | `native/crates/livi-host-proto/src/ui_planes.rs	native/crates/livi-output-proto/src/ui_planes.rs` |
| `R054` | `native/crates/livi-gst-host/Cargo.toml	native/crates/livi-output/Cargo.toml` |
| `A` | `native/crates/livi-output/build.rs` |
| `R074` | `native/crates/livi-gst-host/src/audio.rs	native/crates/livi-output/src/audio.rs` |
| `R080` | `native/crates/livi-gst-host/src/feed.rs	native/crates/livi-output/src/feed.rs` |
| `R050` | `native/crates/livi-gst-host/src/gst.rs	native/crates/livi-output/src/gst.rs` |
| `A` | `native/crates/livi-output/src/gst/in_process.rs` |
| `A` | `native/crates/livi-output/src/gst/linux.rs` |
| `A` | `native/crates/livi-output/src/gst/mac.rs` |
| `A` | `native/crates/livi-output/src/gst/players.rs` |
| `R093` | `native/crates/livi-gst-host/src/lib.rs	native/crates/livi-output/src/lib.rs` |
| `R081` | `native/crates/livi-gst-host/src/main.rs	native/crates/livi-output/src/main.rs` |
| `R082` | `native/crates/livi-gst-host/src/process.rs	native/crates/livi-output/src/process.rs` |
| `R100` | `native/crates/livi-gst-host/src/shown.rs	native/crates/livi-output/src/shown.rs` |
| `R100` | `native/crates/livi-gst-host/src/spectrum.rs	native/crates/livi-output/src/spectrum.rs` |
| `R087` | `native/crates/livi-gst-host/src/tests.rs	native/crates/livi-output/src/tests.rs` |
| `R089` | `native/crates/livi-gst-host/src/ui_plane.rs	native/crates/livi-output/src/ui_plane.rs` |
| `R097` | `native/crates/livi-gst-host/src/video.rs	native/crates/livi-output/src/video.rs` |
| `M` | `native/crates/livi-rtlsdr/Cargo.toml` |
| `D` | `native/crates/livi-runtime/src/events.rs` |
| `D` | `native/crates/livi-runtime/src/livi_sock.rs` |
| `D` | `native/crates/livi-runtime/src/reconnect.rs` |
| `M` | `native/crates/livi-screen-stream/Cargo.toml` |
| `M` | `native/crates/livi-screen-stream/src/lib.rs` |
| `M` | `native/crates/livi-session-io/Cargo.toml` |
| `A` | `native/crates/livi-session-io/build.rs` |
| `M` | `native/crates/livi-session-io/src/feed.rs` |
| `A` | `native/crates/livi-session-io/src/hotplug.rs` |
| `M` | `native/crates/livi-session-io/src/lib.rs` |
| `M` | `native/crates/livi-session-io/src/line.rs` |
| `M` | `native/crates/livi-session-io/src/link.rs` |
| `M` | `native/crates/livi-session-io/src/usb.rs` |
| `A` | `native/crates/livi-session-io/src/usb_absent.rs` |
| `M` | `native/crates/livi-ui-model/Cargo.toml` |
| `M` | `native/crates/livi-ui-model/src/dashboard/layout.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/mod.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/nav.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/readings.rs` |
| `M` | `native/crates/livi-ui-model/src/dashboard/screens.rs` |
| `A` | `native/crates/livi-ui-model/src/dashboard/telltales.rs` |
| `D` | `native/crates/livi-ui-model/src/games.rs` |
| `M` | `native/crates/livi-ui-model/src/icons.rs` |
| `M` | `native/crates/livi-ui-model/src/keys.rs` |
| `M` | `native/crates/livi-ui-model/src/lib.rs` |
| `M` | `native/crates/livi-ui-model/src/mask.rs` |
| `M` | `native/crates/livi-ui-model/src/media.rs` |
| `D` | `native/crates/livi-ui-model/src/minidsp.rs` |
| `M` | `native/crates/livi-ui-model/src/overlay.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/color.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/car.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/devices.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/gps.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/mod.rs` |
| `D` | `native/crates/livi-ui-model/src/settings/custom/network.rs` |
| `D` | `native/crates/livi-ui-model/src/settings/custom/os_update.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/custom/system.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/mod.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/node.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/restart.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/appearance.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/car.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/general.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/system.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/schemas/video.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/sources.rs` |
| `M` | `native/crates/livi-ui-model/src/settings/view.rs` |
| `M` | `native/crates/livi-ui-model/src/shell.rs` |
| `M` | `native/crates/livi-ui/Cargo.toml` |
| `M` | `native/crates/livi-ui/build.rs` |
| `M` | `native/crates/livi-ui/fixtures/system.json` |
| `M` | `native/crates/livi-ui/fixtures/telemetry.json` |
| `M` | `native/crates/livi-ui/src/bundle.rs` |
| `M` | `native/crates/livi-ui/src/clock.rs` |
| `D` | `native/crates/livi-ui/src/clock_ui_tests.rs` |
| `M` | `native/crates/livi-ui/src/core_process.rs` |
| `M` | `native/crates/livi-ui/src/dashboard_ui.rs` |
| `A` | `native/crates/livi-ui/src/dock_ui.rs` |
| `M` | `native/crates/livi-ui/src/follow.rs` |
| `D` | `native/crates/livi-ui/src/games_ui.rs` |
| `M` | `native/crates/livi-ui/src/keys_ui.rs` |
| `M` | `native/crates/livi-ui/src/lib.rs` |
| `M` | `native/crates/livi-ui/src/log.rs` |
| `M` | `native/crates/livi-ui/src/main.rs` |
| `M` | `native/crates/livi-ui/src/media.rs` |
| `M` | `native/crates/livi-ui/src/media_ui.rs` |
| `D` | `native/crates/livi-ui/src/minidsp_ui.rs` |
| `M` | `native/crates/livi-ui/src/secondary.rs` |
| `M` | `native/crates/livi-ui/src/settings_ui.rs` |
| `M` | `native/crates/livi-ui/src/settings_ui/calibrate_touch.rs` |
| `M` | `native/crates/livi-ui/src/settings_ui/render.rs` |
| `A` | `native/crates/livi-ui/src/shape_ui.rs` |
| `M` | `native/crates/livi-ui/src/touch_ui.rs` |
| `M` | `native/crates/livi-ui/src/video_ui.rs` |
| `M` | `native/crates/livi-ui/ui/app.slint` |
| `D` | `native/crates/livi-ui/ui/clock.slint` |
| `M` | `native/crates/livi-ui/ui/dab.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/gauge.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/nav.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/state.slint` |
| `A` | `native/crates/livi-ui/ui/dashboard/strip.slint` |
| `M` | `native/crates/livi-ui/ui/dashboard/widgets.slint` |
| `D` | `native/crates/livi-ui/ui/fonts/D-DIN-400.otf` |
| `D` | `native/crates/livi-ui/ui/fonts/D-DIN-700.otf` |
| `D` | `native/crates/livi-ui/ui/fonts/D-DIN-OFL.txt` |
| `D` | `native/crates/livi-ui/ui/games.slint` |
| `D` | `native/crates/livi-ui/ui/icons/Add.svg` |
| `D` | `native/crates/livi-ui/ui/icons/Apps.svg` |
| `D` | `native/crates/livi-ui/ui/icons/CheckRounded.svg` |
| `D` | `native/crates/livi-ui/ui/icons/DeviceHub.svg` |
| `D` | `native/crates/livi-ui/ui/icons/MapOutlined.svg` |
| `D` | `native/crates/livi-ui/ui/icons/Place.svg` |
| `D` | `native/crates/livi-ui/ui/icons/RefreshOutlined.svg` |
| `D` | `native/crates/livi-ui/ui/icons/SportsEsportsOutlined.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleAirbag.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleAutoHighBeam.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleBrake.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleBrakeWear.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleCharging.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleChoke.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleCoolant.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleEngine.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleEsc.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleFrontFog.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleOilPressure.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleParkingLamps.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltalePassengerAirbagOff.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltalePosition.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltalePreheat.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleRearDefrost.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleRearFog.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleSeatBelt.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleSideAirbag.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleTyrePressure.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TelltaleWindscreenDefrost.svg` |
| `A` | `native/crates/livi-ui/ui/icons/TvOffOutlined.svg` |
| `D` | `native/crates/livi-ui/ui/icons/UsbOutlined.svg` |
| `D` | `native/crates/livi-ui/ui/icons/WidgetsOutlined.svg` |
| `D` | `native/crates/livi-ui/ui/icons/Wifi.svg` |
| `D` | `native/crates/livi-ui/ui/icons/WifiOff.svg` |
| `M` | `native/crates/livi-ui/ui/mask.slint` |
| `M` | `native/crates/livi-ui/ui/media.slint` |
| `M` | `native/crates/livi-ui/ui/media_parts.slint` |
| `D` | `native/crates/livi-ui/ui/minidsp.slint` |
| `M` | `native/crates/livi-ui/ui/nav.slint` |
| `M` | `native/crates/livi-ui/ui/projection.slint` |
| `M` | `native/crates/livi-ui/ui/settings/actions.slint` |
| `M` | `native/crates/livi-ui/ui/settings/controls.slint` |
| `M` | `native/crates/livi-ui/ui/settings/fields.slint` |
| `M` | `native/crates/livi-ui/ui/settings/header.slint` |
| `D` | `native/crates/livi-ui/ui/settings/join.slint` |
| `M` | `native/crates/livi-ui/ui/settings/row.slint` |
| `M` | `native/crates/livi-ui/ui/settings/view.slint` |
| `M` | `native/crates/livi-ui/ui/theme.slint` |
| `M` | `native/crates/livi-ui/ui/video_controls.slint` |
| `M` | `native/crates/livi-video-player/Cargo.toml` |
| `A` | `native/crates/livi-video-player/build.rs` |
| `M` | `native/crates/livi-video-player/src/camera.rs` |
| `R094` | `native/crates/livi-video-player/src/android_view.rs	native/crates/livi-video-player/src/in_process_view.rs` |
| `M` | `native/crates/livi-video-player/src/lib.rs` |
| `M` | `native/crates/livi-video-player/src/url_player.rs` |
| `A` | `native/crates/livi-video-player/src/view/in_process.rs` |
| `A` | `native/crates/livi-video-player/src/view/mac.rs` |
| `A` | `native/crates/livi-video-player/src/view/none.rs` |
| `M` | `native/crates/livi-video-view/Cargo.toml` |
| `M` | `native/crates/livi-video-view/build.rs` |
| `D` | `native/crates/livi-video-view/src/control.rs` |
| `M` | `native/crates/livi-video-view/src/lib.rs` |
| `M` | `native/crates/livi-video-view/src/main_thread.rs` |
| `M` | `native/crates/livi-video-view/src/planes.rs` |
| `M` | `native/crates/livi-video-view/src/screens.rs` |
| `M` | `native/crates/livi-video-view/src/server.rs` |
| `M` | `native/crates/livi-video/Cargo.toml` |
| `M` | `native/crates/livi-video/src/codec.rs` |
| `M` | `native/crates/livi-video/src/fanout.rs` |
| `M` | `native/crates/livi-web/Cargo.toml` |
| `A` | `native/crates/livi-web/src/flash.rs` |
| `A` | `native/crates/livi-web/src/http.rs` |
| `A` | `native/crates/livi-web/src/led.rs` |
| `M` | `native/crates/livi-web/src/lib.rs` |
| `A` | `native/crates/livi-web/src/status.rs` |
| `A` | `native/crates/livi-web/src/update.rs` |
| `M` | `native/crates/livi-wifi/Cargo.toml` |
| `A` | `native/crates/livi-wifi/src/error.rs` |
| `M` | `native/crates/livi-wifi/src/lib.rs` |
| `D` | `native/crates/livi-wifid/Cargo.toml` |
| `M` | `native/crates/livid/Cargo.toml` |
| `D` | `native/crates/livid/src/accessoryd.rs` |
| `M` | `native/crates/livid/src/bt_up.rs` |
| `M` | `native/crates/livid/src/btd.rs` |
| `M` | `native/crates/livid/src/config.rs` |
| `M` | `native/crates/livid/src/ledd.rs` |
| `M` | `native/crates/livid/src/main.rs` |
| `M` | `native/crates/livid/src/netd.rs` |
| `M` | `native/crates/livid/src/wifid.rs` |
| `M` | `native/crates/mkbootimg-v821b/Cargo.toml` |
| `M` | `native/vendor/README.md` |
| `M` | `native/vendor/femtovg/Cargo.toml` |
| `D` | `native/vendor/femtovg/book/.gitignore` |
| `D` | `native/vendor/femtovg/book/book.toml` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/0_intro.md` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/1_setting_up.md` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/1_setting_up.rs` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/2_app.png` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/2_rendering.md` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/2_rendering.rs` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/3_event_loop.md` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/3_event_loop.rs` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/3_final.png` |
| `D` | `native/vendor/femtovg/book/src/1_getting_started/3_red_paint.png` |
| `D` | `native/vendor/femtovg/book/src/SUMMARY.md` |
| `D` | `native/vendor/femtovg/book/src/demo.png` |
| `D` | `native/vendor/femtovg/book/src/index.md` |
| `D` | `native/vendor/femtovg/tests/blit_scissor_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/color_matrix_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/conic_scissor_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/gradient_dither_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/gradient_stress_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/image_update_bounds_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/image_update_contract.rs` |
| `D` | `native/vendor/femtovg/tests/integration.rs` |
| `D` | `native/vendor/femtovg/tests/rounded_rect_radii.rs` |
| `D` | `native/vendor/femtovg/tests/shadow_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/text_scale_position_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/transform2D.rs` |
| `D` | `native/vendor/femtovg/tests/uniform_slots_wgpu.rs` |
| `D` | `native/vendor/femtovg/tests/zoom_invariance_wgpu.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/androidwindowadapter.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/build.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/javahelper.rs` |
| `M` | `native/vendor/i-slint-backend-android-activity/lib.rs` |
| `M` | `native/xtask/Cargo.toml` |
| `M` | `native/xtask/src/build_native.rs` |
| `M` | `native/xtask/src/main.rs` |
| `A` | `native/xtask/src/package_ios.rs` |
| `M` | `native/xtask/src/package_linux.rs` |
| `M` | `native/xtask/src/package_mac.rs` |
| `M` | `native/xtask/src/util.rs` |
| `M` | `rust-toolchain.toml` |
| `M` | `scripts/assets.sh` |
| `M` | `scripts/gstreamer/build-backport-linux.sh` |
| `M` | `scripts/gstreamer/build-faad-android.sh` |
| `M` | `scripts/gstreamer/build-faad-macos.sh` |
| `A` | `scripts/gstreamer/build-patched-ios.sh` |
| `M` | `scripts/gstreamer/build-patched-macos.sh` |
| `A` | `scripts/gstreamer/package-ios.sh` |
| `M` | `scripts/gstreamer/package-linux.sh` |
| `M` | `scripts/gstreamer/package-macos.sh` |
| `D` | `scripts/gstreamer/patches/gst-plugins-bad/0008-v4l2codecs-preserve-compatible-capture-format.patch` |
| `D` | `scripts/gstreamer/patches/gst-plugins-bad/0009-wayland-respect-buffer-video-meta-layout.patch` |
| `D` | `scripts/gstreamer/patches/gst-plugins-bad/0010-v4l2codecs-opt-in-legacy-hevc-slice-lengths.patch` |
| `M` | `scripts/gstreamer/patches/gst-plugins-bad/series` |
| `A` | `scripts/gstreamer/patches/gst-plugins-base/0006-glwindow-eagl-retain-layer-for-update-layer.patch` |
| `A` | `scripts/gstreamer/patches/gst-plugins-base/series-ios` |
| `A` | `scripts/gstreamer/smoke-test-ios.sh` |
| `M` | `scripts/gstreamer/smoke-test-linux.sh` |
| `M` | `scripts/gstreamer/smoke-test-macos.sh` |
| `M` | `scripts/install/common.sh` |
| `M` | `scripts/install/desktop/install.sh` |
| `M` | `scripts/install/headless/install.sh` |
| `M` | `scripts/install/install.sh` |
| `M` | `scripts/install/pi/setup-hdmi-pr-display.sh` |
| `M` | `scripts/linux-arm64/build.sh` |
| `M` | `scripts/livi-link/arm/ax520/build.sh` |
| `D` | `scripts/livi-link/arm/build-userspace.sh` |
| `M` | `scripts/livi-link/arm/common.sh` |
| `M` | `scripts/livi-link/arm/imx6ul/board.sh` |
| `M` | `scripts/livi-link/arm/imx6ul/build.sh` |
| `M` | `scripts/livi-link/common/aic8800.sh` |
| `M` | `scripts/livi-link/common/bindshell/build.sh` |
| `M` | `scripts/livi-link/common/build-rootfs.sh` |
| `A` | `scripts/livi-link/common/build-userspace.sh` |
| `M` | `scripts/livi-link/common/hostapd-build.config` |
| `D` | `scripts/livi-link/common/ingenic-x1600.sh` |
| `M` | `scripts/livi-link/common/kernel.sh` |
| `M` | `scripts/livi-link/common/rootfs/usr/bin/livi-radio` |
| `D` | `scripts/livi-link/mips/build-userspace.sh` |
| `D` | `scripts/livi-link/mips/common.sh` |
| `D` | `scripts/livi-link/mips/x1600/board.sh` |
| `D` | `scripts/livi-link/mips/x1600/build.sh` |
| `D` | `scripts/livi-link/mips/x1600/initramfs/board.sh` |
| `D` | `scripts/livi-link/mips/x1600/initramfs/init` |
| `D` | `scripts/livi-link/mips/x1600/kernel-patches/0001-serial-8250-ingenic-add-x1600.patch` |
| `D` | `scripts/livi-link/mips/x1600/kernel-patches/0002-spidev-x1600-led.patch` |
| `D` | `scripts/livi-link/mips/x1600/rootfs/etc/livi/board.sh` |
| `D` | `scripts/livi-link/mips/x1600/x1600-livi-link.dts` |
| `M` | `scripts/livi-link/riscv/common.sh` |
| `M` | `scripts/livi-link/riscv/v821b/board.sh` |
| `D` | `scripts/livi-link/riscv/v821b/build-userspace.sh` |
| `M` | `scripts/livi-link/riscv/v821b/build.sh` |

## Merge conflicts resolved

- None

## Fork feature areas

- Raspberry Pi / LIVI OS integration
- Haltech CAN and OBD-II telemetry
- MiniDSP support
- RetroArch games integration
- sunrise/sunset night mode
- COMAND and ZTT themes
- local music library, USB storage, wireless sync
- network settings and display/compositor behavior

## Validation

- `cargo check --workspace` reaches native dependency build, then stops because macOS host lacks `wayland-client.pc`.
- Merge commit builds manifest after adding fork-required workspace dependency `sha2 = "0.11.1"` and regenerating `native/Cargo.lock`.
