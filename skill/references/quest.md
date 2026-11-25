# Meta Quest facts for web apps

| Headset | WebXR modes | Notes |
|---|---|---|
| Quest 3 / 3S | immersive-ar (color passthrough), immersive-vr | hit-test, hand tracking, depth-sensing, planes / mesh with room setup |
| Quest Pro | immersive-ar, immersive-vr | color passthrough |
| Quest 2 | immersive-vr | passthrough is black and white and not for web AR; give a virtual room |
| Android phone (Chrome) | immersive-ar | hit-test, dom-overlay; no hands |
| iPhone / iPad Safari | none | the 3D view with touch (our fallback) |
| Apple Vision Pro Safari | immersive-vr | hands via transient-pointer (pinch = select) |
| Desktop Chrome / Edge / Safari | none (without a headset) | the 3D view with the mouse |

## Open it on the headset
1. `XR serve <folder>` on the computer (same Wi-Fi as the headset).
2. Meta Quest Browser -> type the `https://192.168.x.x:8443/` address.
3. "Your connection is not private" -> Advanced -> Proceed (self-made certificate of this computer).
4. Press Enter VR / Enter AR. Allow hand tracking / spatial data if asked.

Not working:
- No Enter button: the page is plain http on a network address, or the browser is not the Quest Browser. Use the https address.
- Cannot reach the address: different Wi-Fi, a guest network that blocks devices, or the macOS firewall. Allow node, or use USB `adb reverse tcp:8080 tcp:8080` + `http://localhost:8080`.
- Black screen in AR: something opaque covers the view (a sky sphere, scene.background). Hide it in `onModeChange`.

## Debug on the headset
- Quest developer mode + USB, then on the computer: Chrome -> `chrome://inspect` -> the Quest Browser tab -> console and performance.
- `window.__xr` holds mode, fps, draw calls, triangles (the helper fills it).
- Meta's OVR Metrics Tool shows real fps in the headset.

## Comfort
- Never move the camera for the user in VR without them asking (teleport is fine, smooth gliding makes people sick).
- Keep the horizon level. No flashing. Text not closer than 0.5 m.
- First frame within a few seconds: show something light, then load big files.
