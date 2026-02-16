---
name: threejs-and-shaders
description: >
  Generate 3D scenes and custom shaders for the web using Three.js, raw WebGL, or GLSL.
  Use when the user asks for 3D visuals, WebGL, shaders, fragment shaders, vertex shaders,
  Three.js scenes, 3D geometry, lighting, materials, post-processing, ray marching,
  or any GPU-based visual. Do NOT use for 2D Canvas/p5.js (use creative-coding) or
  SVG (use svg-and-animation).
compatibility: >
  Requires browser with WebGL support. CDN access to esm.sh required for Three.js.
  Output rendered in sandboxed iframe with allow-scripts allow-same-origin.
metadata:
  author: chatooli
  version: 2.1.0
  category: creative-coding
---

# Three.js and Shaders Skill

Generate 3D scenes and GPU-powered visuals as self-contained HTML files.

## Output Rules

- ALWAYS output a **single self-contained HTML file**.
- Load Three.js from **esm.sh** CDN using direct full URLs in ES module imports. Do NOT use import maps — they break in sandboxed iframes. Do NOT use unpkg or jsdelivr for ES module imports (addons use bare specifiers that only work with import maps). esm.sh auto-resolves bare specifiers.
- Use a **dark background** (e.g. `0x0a0a0a`).
- Make scenes **interactive** (OrbitControls, mouse uniforms) when possible.
- The HTML must work inside an iframe with `sandbox="allow-scripts allow-same-origin"`.

## Examples

### Example 1: 3D geometry
User says: "Build a rotating 3D wireframe icosahedron with Three.js"
Actions:
1. Create HTML with `<script type="module">` importing Three.js from esm.sh
2. Set up scene, camera (z=5), renderer with antialias
3. Create `IcosahedronGeometry` with `MeshBasicMaterial({ wireframe: true })`
4. Add rotation in animation loop, include OrbitControls
Result: Interactive wireframe icosahedron rotating smoothly, draggable with mouse

### Example 2: Custom shader
User says: "Make a fullscreen GLSL shader with animated plasma waves"
Actions:
1. Create HTML with `<canvas>` and raw WebGL context
2. Write vertex shader (fullscreen quad) and fragment shader with `u_time`, `u_resolution`
3. Implement plasma formula using layered `sin()` waves
4. Set up render loop passing uniforms each frame
Result: Fullscreen animated plasma waves responding to time

## Three.js Patterns

### Basic scene with esm.sh CDN (recommended)
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body { margin: 0; overflow: hidden; background: #000; }</style>
</head>
<body>
<script type="module">
  import * as THREE from 'https://esm.sh/three@0.170.0';
  import { OrbitControls } from 'https://esm.sh/three@0.170.0/examples/jsm/controls/OrbitControls.js';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  // Add objects here

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });
</script>
</body>
</html>
```

### Common geometries
- `IcosahedronGeometry(radius, detail)` — organic sphere
- `TorusKnotGeometry(radius, tube, tubularSegments, radialSegments)` — complex knot
- `PlaneGeometry(w, h, segW, segH)` — for shader planes
- `BufferGeometry` + `Float32Array` — custom particle systems

### Materials
- `MeshStandardMaterial({ color, wireframe, metalness, roughness })` — PBR
- `MeshNormalMaterial()` — rainbow debug, looks great
- `ShaderMaterial({ vertexShader, fragmentShader, uniforms })` — custom GLSL

### Lighting
- `AmbientLight(0x404040)` — base fill
- `PointLight(color, intensity, distance)` — point source
- `DirectionalLight(color, intensity)` — sun-like

### Post-processing
```javascript
import { EffectComposer } from 'https://esm.sh/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.170.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.5, 0.4, 0.85));
// In animate(): composer.render() instead of renderer.render()
```

## Raw WebGL / GLSL Shaders

### Fullscreen shader (no Three.js)
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body { margin: 0; overflow: hidden; } canvas { display: block; }</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
resize();
window.addEventListener('resize', resize);

const vs = `attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0, 1); }`;

const fs = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  // shader code here
  gl_FragColor = vec4(uv, 0.5 + 0.5 * sin(u_time), 1.0);
}`;

// Compile, link, setup fullscreen quad, render loop with uniforms...
</script>
</body>
</html>
```

### Common GLSL techniques
- **Plasma**: `sin(uv.x * 10.0 + time) + sin(uv.y * 10.0 + time * 0.7)`
- **Noise**: Simplex or value noise for organic textures
- **SDF shapes**: `length(uv - center) - radius` for circles, combine with `min/max/smoothstep`
- **Ray marching**: Distance field rendering for 3D without geometry
- **Color**: `vec3 col = 0.5 + 0.5 * cos(time + uv.xyx + vec3(0,2,4))` — cosine palette

### Uniforms to always include
- `u_time` — elapsed seconds
- `u_resolution` — canvas size
- `u_mouse` — normalized mouse position (0-1)

## Troubleshooting

### Black screen (nothing renders)
Cause: ES module imports failed silently. Common when using import maps (broken in sandboxed iframes) or incorrect CDN URLs.
Solution: Use `https://esm.sh/three@0.170.0` for all imports. Do NOT use import maps. Do NOT use unpkg or jsdelivr for module imports (addons import `'three'` as bare specifier which requires import maps).

### "Cannot use import statement outside a module"
Cause: Missing `type="module"` on the script tag.
Solution: Use `<script type="module">` for any script that uses `import` statements.

### WebGL context lost
Cause: Too many active WebGL contexts or GPU memory exhaustion.
Solution: Limit geometry detail. Call `renderer.dispose()` on cleanup. Reuse geometries and materials where possible.

### OrbitControls not responding
Cause: Controls created before renderer's `domElement` is in the DOM.
Solution: Ensure `document.body.appendChild(renderer.domElement)` runs before creating `OrbitControls(camera, renderer.domElement)`.

### Shader compilation error
Cause: GLSL syntax error in vertex or fragment shader strings.
Solution: Check browser console for shader compilation errors. Common issues: missing precision declaration (`precision highp float;`), mismatched varying/attribute names, missing semicolons.

## Quality checklist
- [ ] Single self-contained HTML file
- [ ] Dark background
- [ ] Responsive (resize handler)
- [ ] Interactive (OrbitControls or mouse uniforms)
- [ ] Smooth animation (requestAnimationFrame)
- [ ] CDN imports use specific version numbers (not "latest")
- [ ] Use direct full CDN URLs from esm.sh (NO import maps — they break in sandboxed iframes)
