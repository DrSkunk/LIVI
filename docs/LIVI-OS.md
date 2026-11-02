# LIVI OS contract

LIVI OS is an immutable, read-only Linux image built from
[livi-os-buildroot](https://github.com/DrSkunk/livi-os-buildroot). It cannot accept the
system files LIVI normally installs on its first start (udev rule, sudoers drop-ins,
systemd units, a root copy of `livi-helperd`). Instead the image ships them and tells LIVI
so with `LIVI_OS=1`.

## Buildroot API 2: display and readiness

The Buildroot fork's [Rust AppImage contract](https://github.com/DrSkunk/livi-os-buildroot/blob/main/docs/rust-appimage-contract.md)
is authoritative for that image. Its privileged-helper ABI differs from the older
upstream interface documented further below. **The API marker alone does not mean
this AppImage passes the complete Buildroot contract.** In particular, the current
helper launcher still targets `/usr/libexec/livi-helperd` with environment settings
and stale-process cleanup, whereas Buildroot requires the immutable
`/usr/libexec/livi-projection-helper` wrapper, five validated positional arguments,
and validated fixed-path configuration. That helper integration is not implemented
by the display/readiness changes; do not broaden sudo permissions to accommodate it.

The DRM compositor honors inherited `LIVI_MAIN_CONNECTOR`, `LIVI_DISPLAY_MODE`,
`LIVI_MAIN_TRANSFORM` and `LIVI_MAIN_SCALE` ahead of saved settings, including
control replay/reconnect. For the native 400x1280 Waveshare panel:

```sh
LIVI_MAIN_CONNECTOR=HDMI-A-1
LIVI_DISPLAY_MODE=400x1280@60
LIVI_MAIN_TRANSFORM=90
LIVI_MAIN_SCALE=1
```

`90` is **counterclockwise content scanout**: Smithay 0.7's `DrmCompositor`
inverts `Transform::_90` for scanout. Logical size is 1280x400, while KMS keeps
the advertised 400x1280 mode. The existing native-touch path applies `_90`
once, `(x, y) -> (1280-y, x)`, the inverse of scanout. No extra libinput
rotation/calibration should be added for output orientation. `normal`/`0`,
`180`, and `270` are also accepted; absent overrides preserve connector
orientation metadata. Only scale `1` is supported; other explicit scales and
unknown transforms fail rather than silently using different settings.

Explicit connectors do not fall back to another monitor. `WIDTHxHEIGHT@HZ`
selects only an advertised timing of that size within 1 Hz of the requested
refresh, preferring the closest. In `LIVI_OS=1 LIVI_OS_API=2` mode, explicit
sizes cannot fall back either, and secondary outputs require explicit connector
configuration. Ordinary unconfigured desktop mode selection is unchanged.

For `LIVI_OS=1 LIVI_OS_API=2`, core uses `LIVI_OS_SESSION_FILE` (trimmed,
nonempty, bounded to 1024 bytes) and atomically replaces `LIVI_OS_READY_FILE`
every 500 ms while ready. Reports are bounded to 16 KiB, use Linux
`CLOCK_MONOTONIC` seconds, and contain actual live core/UI/compositor PIDs and
actual physical output geometry, transform and scale.

Core polls its existing private compositor connection, not a second control
client. The compositor records UI surface identity and client PID only after
a visible UI buffer was rendered, queued, and acknowledged by a successful
DRM page flip (`frame_submitted` returning `Some`). Shader calibration also
requires UI visibility in the offscreen and final compositions. Static UI does
not need continuous redraws. Readiness is invalidated on UI surface loss,
display removal, session pause, rendering/flip failure, stalled flips,
control disconnect, stale compositor evidence, child exit, and core shutdown.
A replacement UI/output must present a new frame; old proof is not replayed.
Missing proof never becomes a success report. Reports are removed on failure;
after a hard core crash the OS must reject stale reports.

Host-side protocol/supervision tests are not hardware acceptance. A Linux
AArch64 build and real Pi validation of scanout, all touch corners, unplug/
reconnect, deliberate child failures, and the remaining helper ABI are required.

## Older upstream helper interface (not the Buildroot ABI)

The AppImage declares the version of this contract it speaks in
`resources/livi-os-helper-api` (one line). This is contract version `2`. The image should
refuse, or at least warn about, an AppImage whose marker it does not know.

| Version | Change                                                                                  |
| ------- | --------------------------------------------------------------------------------------- |
| 1       | Electron LIVI: `/usr/libexec/livi-projection-helper` with positional arguments.         |
| 2       | Native LIVI: `/usr/libexec/livi-helperd`, settings through an allow-listed environment. |

In the tables `<user>` is the account LIVI runs as. Its home must be `/home/<user>`
(the helper finds `~/.config/LIVI/config.json` and the MFi files through `SUDO_USER`).

## Environment LIVI is started with

| Variable         | Value          | Effect                                                                    |
| ---------------- | -------------- | ------------------------------------------------------------------------- |
| `LIVI_OS`        | `1`            | Turns on everything below. Any other value, or none, is a normal install. |
| `LIVI_OS_HELPER` | path, optional | Another helper than `/usr/libexec/livi-helperd`.                          |
| `LIVI_KIOSK`     | `1`, optional  | LIVI owns the host: Quit powers it off, the gvfs guard is not needed.     |

With `LIVI_OS=1` LIVI never stages a copy of `livi-helperd`, never runs `sudo -E`, and never
calls any `livi-helperd --install-*` switch. It logs once per item, for example
`[livi-os] /etc/udev/rules.d/99-LIVI.rules comes with the image, not installed`.

## The projection helper

`/usr/libexec/livi-helperd` is the `livi-helperd` binary of the same LIVI release (it is in
the AppImage at `resources/driver/livi-helperd`), owned by root, mode `0755`. LIVI runs it

```
sudo -n /usr/libexec/livi-helperd                      # the daemon, restarted on settings changes
/usr/libexec/livi-helperd --wifi-ap-status             # unprivileged, as <user>
sudo -n /usr/libexec/livi-helperd --wifi-ap-teardown   # hands the Wi-Fi interface back
sudo -n pkill -TERM -f /usr/libexec/livi-helperd$     # a helper left over from a crash
sudo -n pkill -KILL -f /usr/libexec/livi-helperd$
```

The working directory is `/usr/libexec`. stdin is a pipe that closes when LIVI goes away
(`LIVI_LIFELINE=1`), the helper then stops by itself.

LIVI clears its environment for the daemon and passes only `PATH` plus these variables, so
sudo has to keep them (`env_keep`). The helper reads its settings from them:

```
LIVI_LIFELINE DEBUG LIVI_AA_WIRELESS LIVI_CP_WIRELESS LIVI_CP_NAME LIVI_CP_FUELS
LIVI_CP_CONNECTORS LIVI_CP_THEME LIVI_BT_ADAPTER LIVI_MFI_FILES LIVI_WIFI_IFACE
LIVI_PASSPHRASE LIVI_WIFI_TYPE LIVI_CHANNEL LIVI_COUNTRY LIVI_CP_DEBUG LIVI_CP_DEVICE_ID
LIVI_CP_PK LIVI_CP_PI LIVI_CP_AIRPLAY_PORT
```

Developer overrides, passed on only when LIVI itself was started with them:

```
LIVI_AP_IP LIVI_PORT LIVI_DONGLE LIVI_CP_WIRED LIVI_AA_USB LIVI_BT_VIA_DONGLE
LIVI_CHANNEL_WIDTH LIVI_CP_USB_IFACE LIVI_LOCKDOWN_STORE LIVI_CP_MFI_POWER_GPIO
LIVI_CP_AVAILABLE_CURRENT_MA LIVI_CP_SOURCE_VERSION
```

## sudoers

One drop-in, for example `/etc/sudoers.d/livi`, mode `0440`. Every command is called with
`sudo -n`, a password prompt means the feature is off.

```
Defaults!/usr/libexec/livi-helperd env_keep += "LIVI_LIFELINE DEBUG LIVI_AA_WIRELESS LIVI_CP_WIRELESS LIVI_CP_NAME LIVI_CP_FUELS LIVI_CP_CONNECTORS LIVI_CP_THEME LIVI_BT_ADAPTER LIVI_MFI_FILES LIVI_WIFI_IFACE LIVI_PASSPHRASE LIVI_WIFI_TYPE LIVI_CHANNEL LIVI_COUNTRY LIVI_CP_DEBUG LIVI_CP_DEVICE_ID LIVI_CP_PK LIVI_CP_PI LIVI_CP_AIRPLAY_PORT"
Defaults!/usr/libexec/livi-helperd env_keep += "LIVI_AP_IP LIVI_PORT LIVI_DONGLE LIVI_CP_WIRED LIVI_AA_USB LIVI_BT_VIA_DONGLE LIVI_CHANNEL_WIDTH LIVI_CP_USB_IFACE LIVI_LOCKDOWN_STORE LIVI_CP_MFI_POWER_GPIO LIVI_CP_AVAILABLE_CURRENT_MA LIVI_CP_SOURCE_VERSION"

Cmnd_Alias LIVI_HELPER = /usr/libexec/livi-helperd "", /usr/libexec/livi-helperd --wifi-ap-teardown
Cmnd_Alias LIVI_STALE = /usr/bin/pkill -TERM -f /usr/libexec/livi-helperd$, /usr/bin/pkill -KILL -f /usr/libexec/livi-helperd$
Cmnd_Alias LIVI_WIFI_AP = /usr/bin/systemctl start livi-wifi-ap.service, /usr/bin/systemctl stop livi-wifi-ap.service, /usr/bin/systemctl restart livi-wifi-ap.service, /usr/bin/systemctl enable livi-wifi-ap.service, /usr/bin/systemctl disable livi-wifi-ap.service
Cmnd_Alias LIVI_HOST = /usr/local/lib/livi/livi-power.sh *, /usr/local/lib/livi/livi-set-time.sh *, /usr/local/lib/livi/livi-video-mode.sh *
Cmnd_Alias LIVI_CAN = /usr/libexec/livi-can-capture ""
<user> ALL=(root) NOPASSWD: LIVI_HELPER, LIVI_STALE, LIVI_WIFI_AP, LIVI_HOST, LIVI_CAN
```

`""` allows the command only without arguments. Leave out `SETENV`, LIVI does not need it.
`systemctl` is looked up at `/usr/bin/systemctl`, `/bin/systemctl`, then `/usr/sbin/systemctl`;
the rule has to name the path that exists on the image.

## Files the image ships

| Path                                       | Content                                                                                                                                                                                                                    | Without it                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `/usr/libexec/livi-helperd`                | see above                                                                                                                                                                                                                  | no projection                                             |
| `/etc/udev/rules.d/99-LIVI.rules`          | `resources/99-LIVI.rules.template` of the AppImage, verbatim                                                                                                                                                               | phones get grabbed by the desktop, touch panels double up |
| `/usr/local/lib/livi/livi-touch-filter`    | `resources/livi-touch-filter`, mode `0755`                                                                                                                                                                                 | the rule's touch line never matches                       |
| `/etc/systemd/system/livi-wifi-ap.service` | `resources/livi-wifi-ap.service.template` with `/usr/local/sbin/livi-helperd` replaced by `/usr/libexec/livi-helperd` and `__USERNAME__` by `<user>`; not enabled by default, LIVI enables it for a dedicated AP interface | no wireless CarPlay / Android Auto                        |
| `/usr/local/lib/livi/livi-power.sh`        | as `livi_install_power_helper` in `scripts/install/common.sh`                                                                                                                                                              | Quit does not power off                                   |
| `/usr/local/lib/livi/livi-set-time.sh`     | as `livi_install_time_helper`                                                                                                                                                                                              | GPS does not set clock or timezone                        |
| `/usr/local/lib/livi/livi-video-mode.sh`   | as `livi_install_video_mode_helper` (adapt `CMDLINE` to the image's boot partition)                                                                                                                                        | the display mode is not pinned                            |
| `/usr/libexec/livi-can-capture`            | see [Haltech CAN capture](#haltech-can-capture)                                                                                                                                                                            | no Haltech CAN telemetry                                  |
| `/usr/local/lib/livi/gvfs-phone-guard.sh`  | optional, only for an image with gvfs; script and sudoers rule as in `native/crates/livi-core/src/gvfs_guard.rs`                                                                                                           | gvfs may grab phones                                      |

## Haltech CAN capture

With _Settings → Car → Receive Haltech CAN V2 telemetry_ on (`haltechCanEnabled`), LIVI runs

```
sudo -n /usr/libexec/livi-can-capture
```

instead of `candump`. The image provides it (root, mode `0755`, no arguments) and:

- brings `can0` up listen-only at 1 Mbit/s, as `ip link set can0 type can bitrate 1000000
  listen-only on && ip link set can0 up` would, when it is not up yet;
- then `exec`s `candump -L can0,360:7FF,370:7FF` (or prints the same `candump -L` line format,
  `(<seconds>.<micros>) can0 <ID>#<DATA>`, one frame per line on stdout) until SIGTERM;
- never transmits on the bus. Diagnostics go to stderr, LIVI logs them.

If it exits LIVI starts it again after 2 s, doubling up to 30 s. Wiring and bring-up:
[HALTECH-CAN.md](https://github.com/DrSkunk/livi-os-buildroot/blob/main/docs/HALTECH-CAN.md).

## Notes

The access point unit runs `livi-helperd --wifi-ap-claim`, `--wifi-ap` and `--wifi-ap-teardown`
as root with `Environment=SUDO_USER=<user>`, so it reads the user's `config.json`.

Not wanted on LIVI OS: `/etc/sudoers.d/99-LIVI-*` and `/etc/systemd/system/livi-kiosk.service`
from the desktop installer. The image starts LIVI with its own session (set `LIVI_KIOSK=1`
when LIVI is the only thing on screen). LIVI still writes per-user files under
`/home/<user>` (`.config/LIVI`, `.config/wireplumber/wireplumber.conf.d/99-livi-hfp.conf`),
which therefore has to be writable.
