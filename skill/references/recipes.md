# Recipes (copy, then adapt)

All snippets assume `const app = await createXRApp({...})` and `const { scene, renderer, camera } = app;`.

## Place things on a real surface (AR hit-test, Quest 3/3S, Android)
```js
const app = await createXRApp({ prefer: 'ar', hitTest: true });
app.onPlace((matrix) => {
  const m = makeThing();
  matrix.decompose(m.position, m.quaternion, m.scale); // the gold ring's pose
  m.scale.setScalar(1);
  scene.add(m);
});
```
Without AR (Quest 2, desktop) give a virtual table: `app.interactive(tableTop, ({ point }) => place(point))`. See `templates/ar-desk`.

## Teleport (VR) and walking (desktop)
Make the floor interactive. In XR, move the world by offsetting the reference space (three.js teleport method):
```js
let baseRef = null;
renderer.xr.addEventListener('sessionstart', () => { baseRef = renderer.xr.getReferenceSpace(); });
function teleport(p) {
  const t = new XRRigidTransform({ x: -p.x, y: 0, z: -p.z, w: 1 }, { x: 0, y: 0, z: 0, w: 1 });
  renderer.xr.setReferenceSpace(baseRef.getOffsetReferenceSpace(t));
}
app.interactive(floor, ({ point, source }) => source === 'xr' ? teleport(point) : glideCamera(point));
```
Desktop: move `camera.position` and `app.controls.target` together. See `templates/gallery`.

## Load the user's 3D model (.glb)
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const gltf = await new GLTFLoader().loadAsync('./model.glb');
const obj = gltf.scene;
const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
obj.scale.setScalar(0.4 / Math.max(size.x, size.y, size.z)); // 40 cm
box.setFromObject(obj); obj.position.y -= box.min.y;          // sit on the floor / pedestal
scene.add(obj);
```
The file goes in the project folder. Draco / KTX2 compressed files need their decoders copied locally too (ask first). See `templates/product-showroom`.

## Grab and move (controller squeeze or pinch-and-hold)
```js
for (const c of app.controllers) {
  c.addEventListener('selectstart', () => { const hit = pick(c); if (hit) c.attach(hit); c.userData.held = hit; });
  c.addEventListener('selectend', () => { if (c.userData.held) scene.attach(c.userData.held); c.userData.held = null; });
}
```
`pick(c)`: raycast from the controller (`THREE.Raycaster().setFromXRController(c)`), return the object. `attach` keeps the world pose.

## Text
- Short names: `label('Saturn', { size: 0.06 })` (canvas texture).
- Panels with buttons: `glassPanel(...)`. Draw with canvas 2D, keep font sizes >= 22 px on a 1024 px canvas.
- Never HTML text in XR: DOM is not visible inside the headset (except `dom-overlay` on phones).

## Images and video
```js
const tex = await new THREE.TextureLoader().loadAsync('./photos/01.jpg'); tex.colorSpace = THREE.SRGBColorSpace;
const v = Object.assign(document.createElement('video'), { src: './clip.mp4', loop: true, muted: true, playsInline: true });
const vtex = new THREE.VideoTexture(v); // call v.play() inside a select / click handler
```

## Sound
```js
app.onAudio((ctx) => chime(ctx, 523)); // code-made tone, no file
// a file: const a = new Audio('./sound.mp3'); play it inside a select handler
```
Positional sound: `THREE.AudioListener` on the camera + `THREE.PositionalAudio`, created after the first gesture.

## Bring in a scene from Google AI Studio / another tool
1. Save their HTML into the project folder. Replace CDN imports with the local importmap (copy the head of any template).
2. Replace their renderer/camera/loop setup with `createXRApp`, keep their scene objects.
3. Move the main object to ~1 m in front of the origin, real-world size.
4. `XR check`, fix, `XR serve`.
