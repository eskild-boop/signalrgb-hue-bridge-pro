# Handoff

State of the workaround as of v0.1.2 (2026-05-10), so anyone (including future-you) can pick this up cold.

## What it does

Makes Philips Hue Bridge Pro (BSB003) work with SignalRGB Pro on Windows. The bundled marketplace plugin uses HTTP — the Pro bridge is HTTPS-only with a self-signed cert that the plugin's QML XHR can't bypass. A local proxy and a patched plugin route around all of it.

## Architecture

```
SignalRGB plugin (QML)
        |  http://127.0.0.1:18080/clip/v2/...
        v
hue-proxy.js  (Node, listens 127.0.0.1:18080)
        |  https://<bridge IP>/clip/v2/...   (rejectUnauthorized: false)
        v
Hue Bridge Pro

DTLS streaming (UDP/2100) goes plugin -> bridge directly,
NOT through the proxy. Proxy is REST-only.
```

Three independent fixes carried by the patched plugin:
1. `dtls.send(packet, 1)` — explicit big-endian (default is little-endian; the bridge silently drops every HueStream frame otherwise).
2. URLs rewritten from `https://${bridge}/...` to `http://127.0.0.1:18080/...`.
3. Crashing active-stream-takeover branch removed; entertainment-area picker ComboBox restored to the QML.

## Where everything lives on this machine

| Component | Path |
|---|---|
| Patched plugin (override) | `C:\Users\eskil\OneDrive\Documents\WhirlwindFX\Plugins\PhilipsHue.js` and `.qml` |
| Override notice | same dir, `README-override.txt` |
| Proxy | `%LOCALAPPDATA%\hue-proxy\hue-proxy.js` |
| Proxy log | `%LOCALAPPDATA%\hue-proxy\proxy.log` (5 MB rotation) |
| Auto-start | Scheduled Task `HueProxy` (per-user, AtLogOn) |
| Repo (canonical source) | `C:\Users\eskil\signalrgb-hue-bridge-pro\` |
| Repo on GitHub | <https://github.com/eskild-boop/signalrgb-hue-bridge-pro> |

The bundled Hue plugin in `%LOCALAPPDATA%\WhirlwindFX\SignalRgb\cache\addons\0a9a1d8987644605907963196ccf391b\` keeps getting reset to v1.1.0 on every SignalRGB launch. That's fine — the override at `Documents\WhirlwindFX\Plugins\` wins because of SignalRGB's documented user-plugin priority.

## How to verify it's working (one command)

```powershell
# Proxy reachable + bridge responds
Invoke-WebRequest -Uri http://127.0.0.1:18080/api/0/config -UseBasicParsing | Select-Object -Expand Content
# Should return JSON with "name":"Hue Bridge pro"
```

For end-to-end verification with an effect running, check `proxy.log` for `PUT .../entertainment_configuration/.../start -> 200`.

## Common breakage scenarios

### Lights stop reacting
1. `Get-Content $env:LOCALAPPDATA\hue-proxy\proxy.log -Tail 20` — is the proxy receiving requests?
2. If no traffic: SignalRGB's plugin override may have been wiped. Check `Documents\WhirlwindFX\Plugins\PhilipsHue.js` exists and contains `dtls.send(packet, 1)`. If missing, re-run `.\install.ps1` from the repo.
3. If traffic but lights frozen: bridge may need its entertainment session restarted. Reapply the effect, or restart SignalRGB.
4. Last resort: the patched plugin may have been reset by a SignalRGB update. Diff `Documents\WhirlwindFX\Plugins\PhilipsHue.js` against the repo's `plugin/PhilipsHue.js`.

### Proxy not running
```powershell
Get-Process -Name node | Where-Object Path -like '*hue-proxy*'    # is it up?
Start-ScheduledTask HueProxy                                      # kick it
```

### Multiple proxies on port 18080
Look for orphaned processes:
```powershell
Get-NetTCPConnection -LocalPort 18080 -State Listen
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'hue-proxy' }
```
There should be exactly one, owned by the path inside `%LOCALAPPDATA%\hue-proxy\`. Kill any others.

### SignalRGB MCP missing
Symptom: Claude Code can't call SignalRGB tools.
```powershell
Start-Process "$env:LOCALAPPDATA\VortxEngine\app-2.5.55\Signal-x64\SignalRgbMcp.exe"
```
SignalRGB usually starts this itself; only manually start if it died.

## How to develop changes

```powershell
cd C:\Users\eskil\signalrgb-hue-bridge-pro
git checkout -b feat/your-thing
# edit plugin/, proxy/, install.ps1
gh pr create
```

CI on every PR runs `node --check`, `markdownlint-cli2`, and `PSScriptAnalyzer`. All must pass before merge. Fix iteratively or push amendments.

For Hue API exploration without touching the plugin, hit the proxy directly:
```powershell
$h = @{ 'hue-application-key' = '<your key from service settings>'; 'Accept' = 'application/json' }
Invoke-WebRequest -Uri http://127.0.0.1:18080/clip/v2/resource/entertainment_configuration -Headers $h -UseBasicParsing
```

## Deploying a new version locally

```powershell
git -C C:\Users\eskil\signalrgb-hue-bridge-pro pull
& C:\Users\eskil\signalrgb-hue-bridge-pro\install.ps1
```

`install.ps1` is idempotent: it stops the running proxy, copies files, re-registers the task, and starts the proxy. Brief lights flicker possible during cutover.

## How to remove the workaround entirely

```powershell
& C:\Users\eskil\signalrgb-hue-bridge-pro\install.ps1 -Uninstall
```
Removes plugin override, proxy directory, and Scheduled Task. SignalRGB falls back to bundled v1.1.0 (broken on Pro, but harmless).

## What still needs upstream

`BUG_REPORT.md` in the repo is ready to paste into SignalRGB Discord (<https://discord.gg/signalrgb>) when you want to push for a real fix. The minimal fix on their side is one diff: add `, 1` to three `dtls.send` calls in `PhilipsHue.js` on the `Gui-Dev-BOMDIA` branch and merge to `main`. After that, this repo can be archived.

## Credits

Diagnosis and patches by [@eskild-boop](https://github.com/eskild-boop) with assistance from Claude (Anthropic) and OpenAI Codex. The endianness clue came from Codex spotting an undocumented optional argument in the SignalRGB plugin runtime docs.
