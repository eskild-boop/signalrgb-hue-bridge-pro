# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-05-10

### Added

- `tools/srgb.ps1` — CLI wrapper around SignalRGB Pro's local Signal API on `127.0.0.1:16038`. Subcommands: `current`, `list`, `apply <name>`, `brightness 0..100`, `on`, `off`, `next`, `previous`, `shuffle`, `layout`, `layout set <id>`. Lets you switch effects (e.g. `apply 'Battlefield 6'`) and tune brightness without opening the GUI.

## [0.1.2] - 2026-05-10

### Added

- `proxy/hue-proxy.js`: file logging. By default writes to `proxy.log` next to the script (rotates at 5 MB), so output is visible when the proxy runs under a detached Scheduled Task. Configurable via `HUE_PROXY_LOG` env var (set to `""` to disable).

## [0.1.1] - 2026-05-10

### Fixed

- `plugin/PhilipsHue.qml`: operator precedence on the IP address fallback (`text: "IP Address: " + (root.device.ip ?? "Unknown")`).
- `plugin/PhilipsHue.js`: removed dead `waitingForConnectionClose` variable.
- `plugin/PhilipsHue.js`: replaced 5 mojibake byte sequences (em-dash, arrow) with ASCII.
- `plugin/PhilipsHue.js`: documented single-bridge limitation in `ValidateIPAddress`.
- `install.ps1`: quoted scheduled-task `-Argument` so spaces in path don't break Task Scheduler parsing.

### Added

- `CHANGELOG.md` (this file).
- README markdownlint compliance (MD032).

## [0.1.0] - 2026-05-09

### Added

- Patched `PhilipsHue.js` plugin (v2.0.0 derivative from `Gui-Dev-BOMDIA` branch, commit d324283) with three independent fixes:
  - `dtls.send(packet, 1)` — explicit big-endian flag (default is little-endian, which silently corrupts HueStream v2 RGB color words and causes the bridge to time out the entertainment session)
  - Removed crashing active-stream-takeover branch in device-plugin `Initialize()` that called `dtls.send` before any DTLS connection existed
  - Bridge URLs rewritten from `https://${ip}/...` to `http://127.0.0.1:18080/...` so the plugin's QML XHR never sees the bridge's self-signed cert
- Patched `PhilipsHue.qml` to restore the entertainment-area `SComboBox` picker that was removed in the dev branch
- `proxy/hue-proxy.js` — Node.js HTTP→HTTPS forwarder that listens on `127.0.0.1:18080` and proxies to `https://<bridge>:443` with `rejectUnauthorized: false`. Auto-discovers the bridge IP via `https://discovery.meethue.com` if `HUE_BRIDGE_HOST` is unset
- `install.ps1` — installs plugin override into `Documents\WhirlwindFX\Plugins\`, copies proxy to `%LOCALAPPDATA%\hue-proxy\`, registers a per-user Scheduled Task `HueProxy` that auto-starts at logon, and starts the proxy for the current session. `-Uninstall` switch reverses everything
- `BUG_REPORT.md` — concise upstream report with diff and reproduction steps for the SignalRGB maintainers

[Unreleased]: https://github.com/eskild-boop/signalrgb-hue-bridge-pro/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/eskild-boop/signalrgb-hue-bridge-pro/releases/tag/v0.1.3
[0.1.2]: https://github.com/eskild-boop/signalrgb-hue-bridge-pro/releases/tag/v0.1.2
[0.1.1]: https://github.com/eskild-boop/signalrgb-hue-bridge-pro/releases/tag/v0.1.1
[0.1.0]: https://github.com/eskild-boop/signalrgb-hue-bridge-pro/releases/tag/v0.1.0
