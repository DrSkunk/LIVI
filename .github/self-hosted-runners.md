# macOS runner

`MACOS_RUNNER=livi-macos` routes macOS checks and DMG builds to the repository
runner `livi-macos-arm64`. Both DMG architectures use this Apple Silicon Mac;
the Intel build is cross-compiled. Linux, Android, and LIVI OS Buildroot jobs
continue to use GitHub-hosted Linux runners. Fork pull requests use hosted macOS.

The runner is installed in `~/actions-runner-livi`, with a launch agent that
starts when the user logs in. Keep the Mac awake and connected during builds.
Use `./svc.sh status`, `./svc.sh stop`, or `./svc.sh start` from that directory.
Runner logs are in `_diag` and `~/Library/Logs/actions.runner.DrSkunk-LIVI.livi-macos-arm64`.

Install Xcode Command Line Tools, Homebrew pkg-config, Rust, and the GStreamer
universal runtime and development packages matching
`assets/gstreamer/macos-arm64/version.txt`. GStreamer lives in
`/Library/Frameworks/GStreamer.framework/Versions/1.0`. Install SDK updates
interactively as an administrator; CI reuses a matching installation and has no
passwordless sudo requirement. The runner PATH includes Homebrew and Cargo.

To return to hosted macOS, delete the `MACOS_RUNNER` repository Actions variable.
The GStreamer asset-generation workflow remains hosted because it installs a
newly resolved SDK version rather than the project's pinned version.
