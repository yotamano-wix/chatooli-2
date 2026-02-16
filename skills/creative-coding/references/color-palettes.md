# Color Palettes for Creative Coding

Curated palettes that work well on dark backgrounds.

## Neon

```javascript
const NEON = ['#ff006e', '#fb5607', '#ffbe0b', '#3a86ff', '#8338ec'];
```

## Synthwave

```javascript
const SYNTHWAVE = ['#ff00ff', '#00ffff', '#ff6ec7', '#7b2d8e', '#1a1a2e'];
```

## Sunset

```javascript
const SUNSET = ['#ff6b6b', '#ffa07a', '#ffd700', '#ee82ee', '#9370db'];
```

## Ocean

```javascript
const OCEAN = ['#0077b6', '#00b4d8', '#90e0ef', '#caf0f8', '#023e8a'];
```

## Earth

```javascript
const EARTH = ['#d4a373', '#ccd5ae', '#e9edc9', '#fefae0', '#faedcd'];
```

## HSB Cycling (p5.js)

```javascript
// Rainbow cycling based on position or time
colorMode(HSB, 360, 100, 100, 100);
fill((frameCount + i * 10) % 360, 80, 90);
```

## Gradient Mapping

Map a 0-1 value to a palette:

```javascript
function lerpPalette(palette, t) {
  t = Math.max(0, Math.min(1, t));
  const idx = t * (palette.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= palette.length - 1) return palette[palette.length - 1];
  // Lerp between colors (use p5 lerpColor or manual RGB interpolation)
  return lerpColor(color(palette[i]), color(palette[i + 1]), f);
}
```
