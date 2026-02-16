---
name: svg-and-animation
description: >
  Generate SVG graphics and CSS/JS animations for the web. Use when the user asks for
  SVG art, vector graphics, text-on-path, CSS animations, motion graphics, animated logos,
  or any scalable vector visual. Also use for CSS-only animations and Web Animations API.
  Do NOT use for Canvas/p5.js (use creative-coding) or 3D/shaders (use threejs-and-shaders).
compatibility: >
  Requires browser with SVG and CSS animations support. No external dependencies.
  Output rendered in sandboxed iframe.
metadata:
  author: chatooli
  version: 2.1.0
  category: creative-coding
---

# SVG and Animation Skill

Generate animated SVG and CSS/JS motion graphics as self-contained HTML files.

## Output Rules

- ALWAYS output a **single self-contained HTML file** with inline SVG and `<style>`/`<script>`.
- No external dependencies needed — SVG and CSS animations are native.
- Use a **dark background** (e.g. `#0a0a0a`, `#1a1a2e`).
- Center the SVG in the viewport using flexbox.
- The HTML must work inside an iframe with `sandbox="allow-scripts allow-same-origin"`.

## Examples

### Example 1: Animated logo
User says: "Generate an SVG animation with text orbiting along a curved path"
Actions:
1. Create HTML with inline SVG, define a circular or elliptical `<path>` in `<defs>`
2. Place `<text>` with `<textPath>` referencing the path
3. Animate `startOffset` with `<animate>` from 0% to 100% on infinite loop
4. Style with white text on dark background, smooth easing
Result: Text smoothly orbiting along a curved SVG path

### Example 2: Geometric pattern
User says: "Make a pulsing geometric mandala"
Actions:
1. Create concentric circles and rotated polygon groups in SVG
2. Apply CSS `@keyframes` for scale pulsing and rotation
3. Stagger animation delays for each ring to create wave effect
4. Use radial gradient fills with complementary colors
Result: Mesmerizing pulsing mandala with layered geometric shapes

## SVG Fundamentals

### Basic structure
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; background: #0a0a0a; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    svg { max-width: 90vw; max-height: 90vh; }
  </style>
</head>
<body>
  <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    <!-- content -->
  </svg>
</body>
</html>
```

### Path commands
- `M x y` — move to
- `L x y` — line to
- `C x1 y1 x2 y2 x y` — cubic bezier
- `Q x1 y1 x y` — quadratic bezier
- `A rx ry rotation large-arc sweep x y` — arc
- `Z` — close path

### Text on path
```svg
<defs>
  <path id="textPath" d="M 50 200 C 150 50, 350 50, 450 200" fill="none"/>
</defs>
<text fill="#ffffff" font-size="24" font-family="sans-serif">
  <textPath href="#textPath" startOffset="0%">
    Your text here
    <animate attributeName="startOffset" from="0%" to="100%" dur="6s" repeatCount="indefinite"/>
  </textPath>
</text>
```

## Animation Techniques

### CSS `@keyframes`
Best for: loops, pulsing, rotating, fading, color cycling.
```css
@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.element { animation: rotate 3s linear infinite; transform-origin: center; }
```

### SVG SMIL `<animate>`
Best for: path morphing, stroke drawing, attribute animation.
```svg
<circle r="10">
  <animate attributeName="r" values="10;20;10" dur="2s" repeatCount="indefinite"/>
</circle>
```

### Stroke drawing effect
```svg
<path d="..." stroke="#fff" stroke-width="2" fill="none"
      stroke-dasharray="1000" stroke-dashoffset="1000">
  <animate attributeName="stroke-dashoffset" to="0" dur="3s" fill="freeze"/>
</path>
```

### JavaScript animation
Best for: complex sequences, interactive animation, physics.
```javascript
const el = document.querySelector('.target');
let t = 0;
function animate() {
  t += 0.02;
  el.setAttribute('transform', `translate(${Math.sin(t) * 100}, ${Math.cos(t) * 50})`);
  requestAnimationFrame(animate);
}
animate();
```

### Web Animations API
```javascript
element.animate([
  { transform: 'scale(1)', opacity: 1 },
  { transform: 'scale(1.5)', opacity: 0.5 },
  { transform: 'scale(1)', opacity: 1 }
], { duration: 2000, iterations: Infinity, easing: 'ease-in-out' });
```

## Easing
- `ease-in-out` for natural motion
- `cubic-bezier(0.68, -0.55, 0.27, 1.55)` for bouncy
- `linear` for continuous rotation

## Color in SVG
- Use `fill`, `stroke` attributes
- Gradients: `<linearGradient>`, `<radialGradient>` in `<defs>`
- Filters: `<feGaussianBlur>` for glow, `<feColorMatrix>` for color shifts

## Troubleshooting

### SVG not visible
Cause: Missing `viewBox` attribute or zero-size SVG.
Solution: Always set `viewBox="0 0 width height"` and ensure the SVG or its container has explicit dimensions.

### Animation not playing
Cause: CSS `transform-origin` not set for rotations, or SMIL `<animate>` syntax error.
Solution: For CSS rotations, add `transform-origin: center` on the element. For SMIL, ensure `attributeName` matches the attribute exactly (case-sensitive).

### Text on path not showing
Cause: `<textPath>` `href` doesn't match the path's `id`, or path has zero length.
Solution: Verify `href="#pathId"` matches `<path id="pathId">`. Ensure the path `d` attribute defines a visible curve.

### Jerky animations
Cause: Animating layout-triggering properties (width, height, top, left).
Solution: Use `transform` and `opacity` for smooth GPU-accelerated animations. Avoid animating dimensions directly.

## Quality checklist
- [ ] Single self-contained HTML file
- [ ] Dark background
- [ ] SVG uses `viewBox` for responsiveness
- [ ] Animations loop smoothly (no jank)
- [ ] Text is readable (sufficient size and contrast)
