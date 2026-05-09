# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/eskild-boop/signalrgb-hue-bridge-pro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/eskild-boop/signalrgb-hue-bridge-pro/releases/tag/v0.1.0
