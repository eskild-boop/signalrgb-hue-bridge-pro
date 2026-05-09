# Hue Bridge Pro (BSB003): v2 Entertainment streaming fails — `dtls.send` defaults to little-endian

**Branch / commit tested:** `Gui-Dev-BOMDIA` @ `d324283` ("API v2 and Bridge Pro support")

## Symptom

After successful pairing and `action: start`, bridge marks the entertainment configuration `active` for ~10 s, then drops it back to `inactive` and lights never react to streaming.

Plugin completes the DTLS-PSK handshake fine and streams encrypted application data at ~55 fps. Confirmed via `pktmon` capture: 1,643 outbound DTLS records (`17 fe fd 00 01 ...`) over 30 s with monotonically increasing sequence numbers, 0 inbound. Bridge silently rejects the stream content despite valid DTLS records.

## Root cause

`dtls.send(packet)` in the plugin omits the optional endianness argument. Per SignalRGB plugin docs (`https://docs.signalrgb.com/developer/plugins/advanced-communication/`) the second argument is `0 = little-endian` (the default) or `1 = big-endian`.

The Hue v2 HueStream protocol uses **16-bit big-endian** RGB values per channel. With the default little-endian serialization, the bridge receives byte-swapped color words — valid DTLS but invalid HueStream — and silently times the session out.

## Fix

Three call sites need the explicit `, 1` flag:

```diff
 // PhilipsHue.js, in StopStream()
-    dtls.send(xPacket);
-    dtls.send(xPacket);
+    dtls.send(xPacket, 1);
+    dtls.send(xPacket, 1);

 // PhilipsHue.js, in Render()
-    const iRet = dtls.send(createHuePacket(getColors()));
+    const iRet = dtls.send(createHuePacket(getColors()), 1);
```

After this single change, on Hue Bridge Pro firmware `2071294020` (apiversion 1.76.0, model BSB003), entertainment streaming stays `active` indefinitely and lights react in real time.

## Other issues found in `Gui-Dev-BOMDIA` worth a quick look while you're in there

1. `DiscoveryService.Initialize()` calls `service.ignoreSslErrors(true)` which throws `Property 'ignoreSslErrors' of object DiscoveryService is not a function` (the `service` global has no such method; only `device.addFeature("http")` + `http.ignoreSslErrors(true)` exists, in the device-plugin context). The DiscoveryService XHRs to `https://` thus can't bypass the bridge's self-signed cert. (I worked around this with a local HTTP→HTTPS proxy and rewrote the URLs; not a generic fix.)

2. `Initialize()` device-plugin path that handles "active stream takeover" calls `StopStream()` (which calls `dtls.send(...)`) before any DTLS connection has been established, causing a non-main-thread crash on first selection of an area whose `status` is already `active`.

3. The corresponding `PhilipsHue.qml` lacks the entertainment-area picker ComboBox that's in `main` (`v1.1.0`). Without it the user can't select among multiple areas; only the previously persisted area can be used.

## Environment

- Bridge: `BSB003` "Hue Bridge pro", swversion `2071294020`, apiversion `1.76.0`, bridgeid `C42996FFFEC67AEE`
- SignalRGB Pro 2.5.55 on Windows 11 26200
- Plugin v2.0.0 from `Gui-Dev-BOMDIA` `d324283`

Happy to share the pktmon `.pcapng` if useful.
