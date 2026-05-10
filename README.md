# SignalRGB ↔ Philips Hue Bridge Pro (BSB003) workaround

Make SignalRGB drive Philips Hue Entertainment on a **Hue Bridge Pro** (model BSB003).

The bundled SignalRGB Hue plugin (v1.1.0 marketplace) doesn't work with the Pro bridge, and the unmerged dev-branch v2.0.0 plugin almost works but has a couple of fatal bugs. This repo collects the patches and a small support proxy that, together, make it actually stream colors to your Entertainment area.

> Tested on SignalRGB Pro 2.5.55 (Windows 11), Hue Bridge Pro firmware `2071294020` (apiversion 1.76.0). Single bridge per LAN.

## What's wrong, in plain words

Three things conspire against you:

1. **The Pro bridge is HTTPS-only.** Plain `http://<bridge>/api/...` returns `301 -> https://...`. The bundled v1.1.0 plugin is HTTP-only, so it falls off a cliff before the first byte of useful traffic.
2. **The dev v2.0.0 plugin uses HTTPS** (good) but Qt's QML `XMLHttpRequest` — which is what plugins run inside — has no JS-level API to ignore TLS errors. The Pro bridge's cert is signed by Philips' internal `CN=root-bridge` CA with no SAN; QML XHR won't trust it. Every API call dies as `xhr.status === 0`.
3. **`dtls.send(packet)` defaults to little-endian** in SignalRGB's plugin runtime. Hue Entertainment v2 ("HueStream") frames carry **16-bit big-endian** color values per channel. So even after fixing the HTTPS path and getting a DTLS-PSK session up, the bridge silently drops every stream packet because the bytes are swapped, and the entertainment session times out after ~10s.

This repo does:

- Patches the v2.0.0 plugin to (a) call `dtls.send(packet, 1)` (big-endian), (b) skip a crashing active-stream-takeover branch, (c) re-add the entertainment-area picker the dev branch's QML lost.
- Rewrites the plugin's bridge URLs from `https://${bridge_ip}/...` to `http://127.0.0.1:18080/...`.
- Ships a tiny Node.js proxy on `127.0.0.1:18080` that forwards to the bridge over HTTPS with cert validation off. The QML XHR never sees a self-signed cert.

DTLS streaming (UDP/2100) goes direct to the bridge. The proxy is only for the REST/discovery side.

## Requirements

- Windows 10/11
- Node.js 18+ on PATH
- SignalRGB Pro installed and running at least once (so the user-plugin override directory exists)
- A Philips Hue Bridge Pro on the same LAN, with at least one Entertainment Area created in the Hue mobile app

## Install

From a regular (non-admin) PowerShell:

```powershell
git clone https://github.com/eskild-boop/signalrgb-hue-bridge-pro.git
cd signalrgb-hue-bridge-pro
.\install.ps1
```

`install.ps1` copies the patched plugin into `Documents\WhirlwindFX\Plugins\` (SignalRGB's documented user-plugin override path), copies the proxy into `%LOCALAPPDATA%\hue-proxy\`, registers a Scheduled Task that auto-starts the proxy at logon, and starts it once for this session.

After install: quit SignalRGB from the tray, reopen, go to **Devices → Philips Hue**, link the bridge (press the round button on top within 30 s when prompted), pick your Entertainment Area, and apply an effect.

## Uninstall

```powershell
.\install.ps1 -Uninstall
```

Removes the user-plugin files, the proxy directory, and the Scheduled Task. SignalRGB falls back to the bundled v1.1.0 plugin (broken on Pro, but harmless).

## Files

- [`plugin/PhilipsHue.js`](plugin/PhilipsHue.js) — patched device + discovery plugin (proxy URLs, big-endian dtls.send, no crashing takeover branch)
- [`plugin/PhilipsHue.qml`](plugin/PhilipsHue.qml) — patched UI with the area-picker ComboBox restored
- [`proxy/hue-proxy.js`](proxy/hue-proxy.js) — local HTTP-to-HTTPS forwarder, auto-discovers the bridge IP via meethue.com if `HUE_BRIDGE_HOST` is unset
- [`install.ps1`](install.ps1) — install/uninstall script
- [`BUG_REPORT.md`](BUG_REPORT.md) — write-up suitable for filing with SignalRGB

## What's NOT a permanent fix

This is a workaround that lives entirely in user-space:

- SignalRGB's auto-update will keep restoring the broken v1.1.0 in `%LOCALAPPDATA%\WhirlwindFX\SignalRgb\cache\addons\`. The user-plugin override at `Documents\WhirlwindFX\Plugins\` wins, so you don't notice.
- If Philips changes the bridge cert or DTLS handshake again, the proxy still works but the plugin patches may need updating.
- The right long-term fix is upstream merging the dev branch with the endianness flag set. See [`BUG_REPORT.md`](BUG_REPORT.md).

## Credits

Diagnosis and patches by [@eskild-boop](https://github.com/eskild-boop) with assistance from Claude (Anthropic) and OpenAI Codex. The endianness clue came from Codex spotting an undocumented optional argument in the SignalRGB plugin runtime docs.

## License

MIT — see [LICENSE](LICENSE).
