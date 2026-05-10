# SignalRGB Effects Cheatsheet

How to read what your lights are telling you, with a focus on Battlefield 6 and the other game effects you have installed.

## Mental model — how SignalRGB effects work

Every effect in SignalRGB is a tiny HTML/JavaScript page rendered by an embedded browser (Ultralight) onto a single 2D canvas. The canvas is your room.

- **Each device has a tile** placed somewhere on the canvas (NZXT front fans bottom-left, AIO fans top-left, MSI motherboard centre, monitor right, Hue strip far right, Hue pendant top-centre, etc.).
- **The effect paints pixels** on the canvas using whatever logic it wants.
- **Each LED/zone reads the pixel under its tile** and shows that colour.

So an effect doesn't address devices — it draws a picture, and the devices listen. Same effect, different device layout = different physical look.

That has three practical consequences:

1. **Spatial direction matters.** A "Side to Side" sweep moves left→right *across the canvas*. If your tower is far left and your monitor is right, the wave physically rolls across the desk.
2. **Hue is slower.** Internal devices update at the canvas frame rate (~60 fps). Hue lights stream at ~50 fps but with extra latency through the bridge — visible during fast strobing, invisible during ambient.
3. **Effects can be layered.** Game effects draw a background layer (often ambient screen capture) and overlay state on top — so the lights show *both* "what's on screen" and "what's happening in the game" at the same time.

## Battlefield 6 — what each light cue means

Looking at the effect's published parameters, here's the vocabulary your lights are speaking:

| Cue | Visual | What just happened in game |
|---|---|---|
| Calm screen-coloured wash | Ambient mode (default `backgroundMode: Ambience`) | Idle. Lights are sampling the dominant colour of what's on your monitor. Sky blue = looking up, sand = desert map, dark red = scoreboard / interface. |
| Subtle horizontal bar across the front fans | **Health bar**. Length matches your remaining HP. Drawn at canvas position `hpX, hpY` (default 0,0) with size `hpWidth × hpHeight`. | You're alive. Length shrinking = taking damage. |
| Pulsing red, slow → fast | **Low health effect** (`healthOn: true`) | HP < ~30%. Heal up. |
| Sustained dim red glow over everything | **Player downed** (`downedOn: true`) | You're on the ground waiting for revive. |
| Sharp bright flash (white/red) across everything | **Kill effect** (`killOn: true`) | You just killed someone. |
| Cool blue/teal tint dominating the room | **Vehicle effect** (`vehicleOn: true`) | You're in a tank/jet/transport. |
| Long colour-sweep at round end | **End game effects** (`endOn: true`). Different sweep for win vs. loss. | Round ended. |

The default config has all triggers ON. To turn any of them off, edit the effect parameters in **SignalRGB → Effects → Battlefield 6 → settings**.

## Where each cue physically appears

Given your layout (PC tower below-left, monitor right, Hue strip behind monitor, pendant overhead):

- **Health bar** sits on the bottom strip of the canvas, so you'll see it most clearly on the **NZXT front fans** (bottom-left of canvas). The fans literally turn into a horizontal HP gauge.
- **Kill flash** hits the whole canvas at once → simultaneous flash of *case + fans + AIO + monitor + Hue strip + pendant*. Brief but unmistakable.
- **Vehicle tint** is a backgroundMode override — the ambient layer goes blue everywhere. Pendant + Hue strip + case all turn the same shade.
- **Low health pulse** is a full-canvas throb. Front fans pulse hardest because they're physically closest to you in the peripheral view.
- **Downed** is sustained red across all devices including Hue ambient — you'll feel the room go red.
- **End game** sweeps across the canvas direction, so the wave rolls left (PC) → right (monitor / Hue ambient).

If you want the health bar more prominent, increase `hpHeight` (default 50) and/or move it (`hpX`, `hpY`). All three are pixels on the canvas.

## Other game effects you have installed

| Effect | Approximate vocabulary |
|---|---|
| **Biomes of Minecraft** | Slow ambient palette tied to in-game biome (forest = green, nether = red, ocean = blue). No twitch reactions, very chill. |
| **Terminal** | Matrix-style green code rain. Runs on its own, no game telemetry. Good for screen-share / look-cool. |
| **Day and Night Cycle** | Slow gradient cycle simulating sun arc → sunset → night → sunrise. Good ambient for working. |
| **Side to Side** | Linear colour wave moving across the canvas. Tests your layout — if it doesn't physically sweep across your desk, your tile positions are wrong. |
| **Bubbles** | Random colour blobs floating across the canvas. Casual / non-game. |
| **Neon Shift / Neurolink / Rainbow** | Pure visual effects, no telemetry. Vary in pace. |
| **Solid Color** | Single colour on everything. Perfect for "calm work" mode. |
| **Screen Ambience** | Same idea as Battlefield 6's ambient layer, but no game cues — just samples your monitor. Decent fallback for unsupported games. |

## Quick controls

```powershell
$srgb = 'C:\Users\eskil\signalrgb-hue-bridge-pro\tools\srgb.ps1'

& $srgb apply 'Battlefield 6'        # game session
& $srgb apply 'Day and Night Cycle'  # working
& $srgb apply 'Solid Color'          # focus mode
& $srgb apply 'Screen Ambience'      # ambient sync, any game
& $srgb brightness 30                # late evening
& $srgb brightness 100               # daytime
& $srgb off                          # all dark
& $srgb on                           # back on
& $srgb shuffle                      # surprise me
```

## How to know an effect is "broken"

If lights freeze on a colour for >5 seconds during gameplay:

1. **Hue stream timed out** — the bridge dropped your entertainment session. Re-apply the effect: `& $srgb apply 'Battlefield 6'`. SignalRGB will resend `action: start` and DTLS resumes.
2. **Game capture lost** — the effect couldn't find Battlefield's process. Make sure the game is in focus and not minimised.
3. **Proxy down** — `tail %LOCALAPPDATA%\hue-proxy\proxy.log -Wait` should show traffic during gameplay. If silent, restart the proxy: `Start-ScheduledTask HueProxy`.

## Tuning Battlefield 6 to your taste

Open **SignalRGB → Effects → Battlefield 6 → "..."** and adjust the parameters:

- `ambienceAlpha` (Background Brightness, 0–100, default 34): higher = more screen-colour wash, lower = less distracting during cutscenes.
- Toggle individual effects off if they're too noisy: `killOn`, `downedOn`, `endOn`, `vehicleOn` are independent booleans.
- `backgroundMode` can be set to `Custom Color` if you don't want screen sampling.
- `hpX/hpY/hpWidth/hpHeight` reposition the health bar — useful if you'd rather have it on the AIO fans (top of canvas) or the Hue strip (right of canvas) than the case fans.
