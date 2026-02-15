---
name: threejs-and-shaders
description: >
  Generate 3D scenes and custom shaders for the web using Three.js, raw WebGL, or GLSL.
  Use when the user asks for 3D visuals, WebGL, shaders, fragment shaders, vertex shaders,
  Three.js scenes, 3D geometry, lighting, materials, post-processing, ray marching,
  or any GPU-based visual. Do NOT use for 2D Canvas/p5.js (use creative-coding) or
  SVG (use svg-and-animation).
metadata:
  author: chatooli
  version: 1.0.0
  category: creative-coding
---

# Three.js and Shaders Skill

Generate 3D scenes and GPU-powered visuals as self-contained HTML files.

## Output Rules

- ALWAYS output a **single self-contained HTML file**.
- Load Three.js from CDN using import maps or script tags.
- Use a **dark background** (e.g. `0x0a0a0a`).
- Make scenes **interactive** (OrbitControls, mouse uniforms) when possible.
- The HTML must work inside an iframe with `sandbox="allow-scripts allow-same-origin"`.

## Three.js Patterns

### Basic scene with import map (recommended)
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>body { margin: 0; overflow: hidden; background: #000; }</style>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
    }
  }
  </script>
</head>
<body>
<script type="module">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

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

## Quality checklist
- [ ] Single self-contained HTML file
- [ ] Dark background
- [ ] Responsive (resize handler)
- [ ] Interactive (OrbitControls or mouse uniforms)
- [ ] Smooth animation (requestAnimationFrame)
- [ ] CDN imports use specific version numbers (not "latest")
