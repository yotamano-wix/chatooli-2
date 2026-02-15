# Simple Dithering Effect

A Python implementation of popular dithering algorithms to create artistic black and white images with reduced color depth.

## Features

- **Floyd-Steinberg Dithering**: High-quality error diffusion algorithm that produces smooth, organic-looking patterns
- **Ordered (Bayer) Dithering**: Classic halftone patterns using 2x2, 4x4, or 8x8 Bayer matrices

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Run the demo

```bash
python dithering.py
```

This will create a sample gradient image and apply various dithering effects, saving the results in the `output/` folder.

### Use with your own images

```python
from PIL import Image
import numpy as np
from dithering import floyd_steinberg_dither, ordered_dither

# Load your image
img = Image.open('your_image.png').convert('L')  # Convert to grayscale
img_array = np.array(img)

# Apply Floyd-Steinberg dithering
dithered = floyd_steinberg_dither(img_array)
Image.fromarray(dithered).save('output_fs.png')

# Apply Ordered dithering (with 4x4 Bayer matrix)
dithered = ordered_dither(img_array, matrix_size=4)
Image.fromarray(dithered).save('output_ordered.png')
```

## Algorithms Explained

### Floyd-Steinberg Dithering
This algorithm uses error diffusion to distribute quantization errors to neighboring pixels:
- Processes pixels left-to-right, top-to-bottom
- Distributes error to 4 neighboring pixels using specific weights
- Creates organic, visually appealing patterns
- Best for photographs and natural images

### Ordered (Bayer) Dithering
Uses a threshold matrix (Bayer matrix) to determine pixel values:
- Creates regular, patterned halftone effects
- Different matrix sizes create different visual styles
- Faster than error diffusion methods
- Best for artistic effects and retro graphics

## Output Examples

The demo generates the following files in the `output/` folder:
- `original.png` - Original gradient image
- `dithered_floyd_steinberg.png` - Floyd-Steinberg algorithm result
- `dithered_ordered_2x2.png` - 2x2 Bayer matrix (coarse pattern)
- `dithered_ordered_4x4.png` - 4x4 Bayer matrix (medium pattern)
- `dithered_ordered_8x8.png` - 8x8 Bayer matrix (fine pattern)

## License

Free to use and modify as needed!
