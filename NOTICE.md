# NOTICE

connect-ai-xr is made by CONNECT AI LAB. Its own code (bin/, lib/, skill/, templates/, vendor/connect-xr.js) is under the licence in LICENSE (MIT + Commons Clause).

## Included third-party code

| What | Where | Licence | Source |
|---|---|---|---|
| three.js r187 (0.187.0): `three.module.js`, `three.core.js` and the add-ons OrbitControls, VRButton, ARButton, XRButton, XRHandModelFactory, XRHandPrimitiveModel, XRHandMeshModel, GLTFLoader, BufferGeometryUtils, SkeletonUtils, RoomEnvironment | `vendor/three/` | MIT, © 2010-2026 three.js authors, full text in `vendor/three/LICENSE` | https://github.com/mrdoob/three.js (npm `three@0.187.0`) |

The files are unchanged copies from the npm package. A project made with `connect-ai-xr new` carries the same `vendor/three/LICENSE`; keep it when you share your app.

## Assets

None. Every room, planet, product, artwork, texture and sound in the templates is drawn or synthesized in code at run time. No images, models, fonts or audio files from anyone else are included. Hand models use three.js primitive spheres (no download from the WebXR input profiles CDN).

## Used, not included

- Google Chrome / Chromium / Edge (yours, if installed) for `check`, through the DevTools protocol over a pipe.
- openssl (yours, if installed) to make a local self-signed certificate for `serve`.
