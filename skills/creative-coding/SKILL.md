---
name: creative-coding
description: >
  Generate creative, interactive visual code for the web using p5.js, Canvas API,
  or vanilla JavaScript. Use when the user asks for generative art, particle systems,
  interactive sketches, visualizations, animations, creative coding, procedural graphics,
  or anything involving p5.js or HTML Canvas. Do NOT use for 3D scenes (use threejs-and-shaders)
  or static SVG (use svg-and-animation).
compatibility: >
  Requires browser with HTML5 Canvas support. Output rendered in sandboxed iframe.
  CDN access required for p5.js.
metadata:
  author: chatooli
  version: 2.1.0
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

## Examples

### Example 1: Particle system
User says: "Create a particle system that follows the mouse with rainbow trails"
Actions:
1. Create HTML with p5.js CDN import
2. Spawn particles at `mouseX, mouseY` each frame with random velocity
3. Use HSB color mode, cycle hue with `frameCount`
4. Fade opacity with `life` counter, remove dead particles
Result: Interactive rainbow particle trail that follows the cursor

### Example 2: Generative art
User says: "Make a Perlin noise flow field"
Actions:
1. Create Canvas API sketch with requestAnimationFrame loop
2. Generate a grid of angle values using noise
3. Spawn particles that follow the flow field vectors
4. Draw particle trails with semi-transparent fill for ghosting effect
Result: Organic, flowing particle visualization driven by noise

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

## Troubleshooting

### Blank white canvas
Cause: Missing `background()` call in `draw()` or no dark CSS background.
Solution: Add `background(10)` at the start of `draw()` and `background: #0a0a0a` to `<body>`.

### p5.js not loading
Cause: CDN URL incorrect or blocked by iframe sandbox.
Solution: Verify CDN URL is correct and uses HTTPS. The sandbox `allow-scripts allow-same-origin` flags are required.

### Animation stuttering
Cause: Unbounded array growth (e.g. particles never removed).
Solution: Cap arrays with `splice(0, excess)` or filter by `life > 0`. Keep particle count under ~2000 for smooth performance.

### Canvas not filling viewport
Cause: Missing `windowResized()` handler or `margin` on body.
Solution: Add `body { margin: 0; overflow: hidden; }` CSS and `function windowResized() { resizeCanvas(windowWidth, windowHeight); }`.

## Quality checklist
Before returning code:
- [ ] Single HTML file, no external dependencies except CDN
- [ ] Dark background set
- [ ] Canvas fills viewport (`windowWidth/windowHeight`)
- [ ] `windowResized()` handler for responsiveness
- [ ] Animation runs smoothly (no memory leaks from unbounded arrays)
