---
name: creative-coding
description: >
  Generate creative, interactive visual code for the web using p5.js, Canvas API,
  or vanilla JavaScript. Use when the user asks for generative art, particle systems,
  interactive sketches, visualizations, animations, creative coding, procedural graphics,
  or anything involving p5.js or HTML Canvas. Do NOT use for 3D scenes (use threejs-and-shaders)
  or static SVG (use svg-and-animation).
metadata:
  author: chatooli
  version: 2.0.0
  category: creative-coding
---

# Creative Coding Skill

Generate interactive, generative visuals as self-contained HTML files.

## Output Rules

- ALWAYS output a **single self-contained HTML file** with inline `<script>` and `<style>`.
- Load libraries from CDN (e.g. `https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.3/p5.min.js`).
- Use a **dark background** (e.g. `#0a0a0a`, `#1a1a2e`) for visual contrast.
- Make sketches **interactive** (mouse position, click, touch, keyboard) when possible.
- The HTML must work inside an iframe with `sandbox="allow-scripts allow-same-origin"`.

## p5.js Patterns

### Basic sketch structure
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.11.3/p5.min.js"></script>
  <style>body { margin: 0; overflow: hidden; background: #0a0a0a; }</style>
</head>
<body>
<script>
function setup() {
  createCanvas(windowWidth, windowHeight);
  // ...
}
function draw() {
  // ...
}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
</script>
</body>
</html>
```

### Particle systems
- Use arrays of `{ x, y, vx, vy, life, color }` objects.
- Spawn particles on mouse position or at random.
- Update position each frame, fade opacity with `life`.
- Remove dead particles to avoid memory growth.

### Noise and organic motion
- Use `noise(x * scale, y * scale, frameCount * speed)` for smooth variation.
- Layer multiple noise octaves for complexity.
- Map noise values to color, size, rotation, or position offset.

### Color approaches
- **HSB mode**: `colorMode(HSB, 360, 100, 100, 100)` — great for rainbow cycling.
- **Palettes**: Define 4-6 colors and pick randomly or by index.
- **Gradient**: Map position to hue for spatial color variation.

## Canvas API Patterns

### Animation loop
```javascript
const canvas = document.createElement('canvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

function animate() {
  ctx.fillStyle = 'rgba(10, 10, 10, 0.1)'; // trail effect
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // draw here
  requestAnimationFrame(animate);
}
animate();
```

### Useful techniques
- **Trail effect**: Semi-transparent background fill each frame.
- **Glow**: `ctx.shadowBlur` and `ctx.shadowColor` for bloom.
- **Composite modes**: `ctx.globalCompositeOperation = 'lighter'` for additive blending.

## Interaction patterns
- `mouseX, mouseY` (p5) or `mousemove` event for cursor tracking.
- `mouseIsPressed` (p5) or `mousedown` for click interactions.
- `keyPressed()` (p5) for keyboard triggers (e.g. spacebar to reset).
- Touch: `touchStarted()`, `touchMoved()` in p5 for mobile.

## Quality checklist
Before returning code:
- [ ] Single HTML file, no external dependencies except CDN
- [ ] Dark background set
- [ ] Canvas fills viewport (`windowWidth/windowHeight`)
- [ ] `windowResized()` handler for responsiveness
- [ ] Animation runs smoothly (no memory leaks from unbounded arrays)
