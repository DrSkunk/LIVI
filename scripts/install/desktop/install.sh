#!/usr/bin/env bash
set -euo pipefail

# ----------------------------------------
# LIVI Installer & Shortcut Creator (desktop session)
# ----------------------------------------
# Standalone setup for a fresh Raspberry Pi OS with Desktop installation. It
# installs LIVI's runtime dependencies, RetroArch and minidsp-rs as a systemd
# daemon, then adds an autostart entry, desktop shortcut and application entry.
# Everything it shares with the headless installer lives in common.sh; when this
# file is downloaded by itself, it fetches that library automatically.
#
# Re-runnable. Refuses to run as root (sudo is used internally).

LIVI_LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../common.sh"
if [ ! -f "$LIVI_LIB" ]; then
  LIVI_LIB="$(mktemp)"
  curl -fsSL \
    "https://raw.githubusercontent.com/${LIVI_REPO:-DrSkunk/LIVI}/${LIVI_INSTALLER_BRANCH:-main}/scripts/install/common.sh" \
    -o "$LIVI_LIB" || { echo "Error: cannot obtain common.sh" >&2; exit 1; }
fi
# shellcheck source=../common.sh
. "$LIVI_LIB"

livi_require_regular_user

if ! command -v apt-get >/dev/null; then
  echo "Error: this installer requires Raspberry Pi OS or another apt-based desktop." >&2
  exit 1
fi

USER_HOME="$HOME"
APPIMAGE_PATH="$USER_HOME/LIVI/LIVI.AppImage"
APPIMAGE_DIR="$(dirname "$APPIMAGE_PATH")"

echo "→ Creating target directory: $APPIMAGE_DIR"
mkdir -p "$APPIMAGE_DIR"

echo "→ Checking for required tools: curl, xdg-user-dir, pkexec"
for tool in curl xdg-user-dir pkexec; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "   $tool not found, installing…"
    sudo apt-get update
    case "$tool" in
      xdg-user-dir) sudo apt-get --yes install xdg-user-dirs ;;
      pkexec)       sudo apt-get --yes install pkexec ;;
      *)            sudo apt-get --yes install "$tool" ;;
    esac
  else
    echo "   $tool found"
  fi
done

# Desktop session supplies PipeWire and display services. Add LIVI's core
# runtime packages plus RetroArch; its default executable name already matches
# LIVI's games configuration.
echo "→ Installing LIVI runtime packages and RetroArch"
sudo apt-get update
sudo apt-get install -y $(livi_packages core | tr '\n' ' ') retroarch

livi_prepare_retroarch
livi_install_pymobiledevice3
livi_install_minidsp_rs

ICON_URL="$LIVI_RAW/assets/icons/linux/livi.png"
ICON_DEST="$USER_HOME/.local/share/icons/livi.png"

echo "→ Installing icon to $ICON_DEST"
mkdir -p "$(dirname "$ICON_DEST")"
if curl -fL "$ICON_URL" -o "$ICON_DEST"; then
  echo "   App icon downloaded and installed successfully."
  HICOLOR_ICON="$USER_HOME/.local/share/icons/hicolor/256x256/apps/livi.png"
  mkdir -p "$(dirname "$HICOLOR_ICON")"
  cp -f "$ICON_DEST" "$HICOLOR_ICON" 2>/dev/null || true
  gtk-update-icon-cache -f -t "$USER_HOME/.local/share/icons/hicolor" 2>/dev/null || true
else
  echo "   Failed to download icon from $ICON_URL. Skipping icon install."
  ICON_DEST=""
fi

# Optional positional arg: local AppImage file path or http(s) URL
APPIMAGE_SRC="${1:-}"

livi_pick_channel "$APPIMAGE_SRC"
livi_ask_mfi
livi_ask_splash
livi_ask_hdmi_pr

livi_fetch_appimage "$APPIMAGE_PATH" "$APPIMAGE_SRC"
echo "   Download complete: $APPIMAGE_PATH"

livi_apply_mfi
livi_apply_splash
livi_apply_hdmi_pr "$APPIMAGE_PATH"

echo "→ Creating autostart entry"
AUTOSTART_DIR="$USER_HOME/.config/autostart"
mkdir -p "$AUTOSTART_DIR"

AUTOSTART_LOG="$APPIMAGE_DIR/LIVI.log"
cat > "$AUTOSTART_DIR/LIVI.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LIVI
Exec=sh -c '"$APPIMAGE_PATH" >"$AUTOSTART_LOG" 2>&1'
Icon=${ICON_DEST:-livi}
Terminal=false
X-GNOME-Autostart-enabled=true
Categories=AudioVideo;
StartupWMClass=dev.f-io.livi
EOF
echo "Autostart entry at $AUTOSTART_DIR/LIVI.desktop"
echo "Autostart log at $AUTOSTART_LOG"

echo "→ Creating desktop shortcut"
if command -v xdg-user-dir >/dev/null 2>&1; then
  DESKTOP_DIR="$(xdg-user-dir DESKTOP)"
else
  DESKTOP_DIR="$USER_HOME/Desktop"
fi

mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/LIVI.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LIVI
Comment=Launch LIVI AppImage
Exec=$APPIMAGE_PATH
Icon=${ICON_DEST:-livi}
Terminal=false
Categories=AudioVideo;
StartupNotify=false
StartupWMClass=dev.f-io.livi
EOF

chmod +x "$DESKTOP_DIR/LIVI.desktop"
echo "Desktop shortcut at $DESKTOP_DIR/LIVI.desktop"

# Application entry so the panel/compositor can resolve the window icon from app_id.
echo "→ Creating application entry"
APPLICATIONS_DIR="$USER_HOME/.local/share/applications"
mkdir -p "$APPLICATIONS_DIR"
rm -f "$APPLICATIONS_DIR/livi.desktop"
cat > "$APPLICATIONS_DIR/dev.f-io.livi.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=LIVI
Exec=$APPIMAGE_PATH
Icon=livi
Terminal=false
Categories=AudioVideo;
StartupWMClass=dev.f-io.livi
EOF
update-desktop-database "$APPLICATIONS_DIR" 2>/dev/null || true
echo "Application entry at $APPLICATIONS_DIR/dev.f-io.livi.desktop"

echo ""
echo "✅ LIVI desktop installation complete."
echo "   RetroArch: $(command -v retroarch) (ROMs: $LIVI_ROMS_DIR)"
echo "   MiniDSP: minidsp.service (http://127.0.0.1:5380)"
echo "   Reboot to apply boot and I2C changes and launch LIVI automatically."
