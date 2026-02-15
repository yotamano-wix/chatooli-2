"""
Simple Dithering Effect
Implements Floyd-Steinberg dithering algorithm to reduce color depth
"""

import numpy as np
from PIL import Image
import os


def floyd_steinberg_dither(image_array):
    """
    Apply Floyd-Steinberg dithering to an image
    
    Args:
        image_array: numpy array of the image (grayscale or RGB)
    
    Returns:
        dithered image array
    """
    # Work with a copy to avoid modifying the original
    img = image_array.astype(float)
    height, width = img.shape[:2]
    
    # Process each pixel
    for y in range(height):
        for x in range(width):
            old_pixel = img[y, x].copy()
            
            # Quantize to black or white (or nearest color)
            if len(img.shape) == 2:  # Grayscale
                new_pixel = 255 if old_pixel > 127 else 0
            else:  # RGB
                new_pixel = np.array([255 if c > 127 else 0 for c in old_pixel])
            
            img[y, x] = new_pixel
            error = old_pixel - new_pixel
            
            # Distribute error to neighboring pixels
            if x + 1 < width:
                img[y, x + 1] += error * 7/16
            
            if x > 0 and y + 1 < height:
                img[y + 1, x - 1] += error * 3/16
            
            if y + 1 < height:
                img[y + 1, x] += error * 5/16
            
            if x + 1 < width and y + 1 < height:
                img[y + 1, x + 1] += error * 1/16
    
    return np.clip(img, 0, 255).astype(np.uint8)


def ordered_dither(image_array, matrix_size=2):
    """
    Apply ordered (Bayer matrix) dithering
    
    Args:
        image_array: numpy array of the image
        matrix_size: size of Bayer matrix (2, 4, or 8)
    
    Returns:
        dithered image array
    """
    # Bayer matrices
    bayer_2x2 = np.array([
        [0, 2],
        [3, 1]
    ]) / 4.0
    
    bayer_4x4 = np.array([
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ]) / 16.0
    
    bayer_8x8 = np.array([
        [0, 32, 8, 40, 2, 34, 10, 42],
        [48, 16, 56, 24, 50, 18, 58, 26],
        [12, 44, 4, 36, 14, 46, 6, 38],
        [60, 28, 52, 20, 62, 30, 54, 22],
        [3, 35, 11, 43, 1, 33, 9, 41],
        [51, 19, 59, 27, 49, 17, 57, 25],
        [15, 47, 7, 39, 13, 45, 5, 37],
        [63, 31, 55, 23, 61, 29, 53, 21]
    ]) / 64.0
    
    if matrix_size == 2:
        bayer = bayer_2x2
    elif matrix_size == 4:
        bayer = bayer_4x4
    elif matrix_size == 8:
        bayer = bayer_8x8
    else:
        bayer = bayer_2x2
    
    img = image_array.astype(float) / 255.0
    height, width = img.shape[:2]
    
    result = np.zeros_like(img)
    
    for y in range(height):
        for x in range(width):
            threshold = bayer[y % matrix_size, x % matrix_size]
            if len(img.shape) == 2:  # Grayscale
                result[y, x] = 255 if img[y, x] > threshold else 0
            else:  # RGB
                for c in range(img.shape[2]):
                    result[y, x, c] = 255 if img[y, x, c] > threshold else 0
    
    return result.astype(np.uint8)


def create_sample_image():
    """Create a sample gradient image for demonstration"""
    width, height = 400, 400
    image = np.zeros((height, width), dtype=np.uint8)
    
    # Create a gradient
    for y in range(height):
        for x in range(width):
            # Radial gradient
            dx = x - width / 2
            dy = y - height / 2
            distance = np.sqrt(dx**2 + dy**2)
            max_distance = np.sqrt((width/2)**2 + (height/2)**2)
            value = int(255 * (1 - distance / max_distance))
            image[y, x] = max(0, min(255, value))
    
    return image


def main():
    print("Simple Dithering Effect Demo")
    print("=" * 50)
    
    # Create output directory
    os.makedirs("output", exist_ok=True)
    
    # Create a sample image
    print("\n1. Creating sample gradient image...")
    sample_img = create_sample_image()
    Image.fromarray(sample_img).save("output/original.png")
    print("   Saved: output/original.png")
    
    # Apply Floyd-Steinberg dithering
    print("\n2. Applying Floyd-Steinberg dithering...")
    dithered_fs = floyd_steinberg_dither(sample_img)
    Image.fromarray(dithered_fs).save("output/dithered_floyd_steinberg.png")
    print("   Saved: output/dithered_floyd_steinberg.png")
    
    # Apply ordered dithering with different matrix sizes
    print("\n3. Applying Ordered (Bayer) dithering...")
    for size in [2, 4, 8]:
        dithered_ordered = ordered_dither(sample_img, matrix_size=size)
        Image.fromarray(dithered_ordered).save(f"output/dithered_ordered_{size}x{size}.png")
        print(f"   Saved: output/dithered_ordered_{size}x{size}.png")
    
    print("\n" + "=" * 50)
    print("Done! Check the 'output' folder for results.")
    print("\nYou can also use this script with your own images:")
    print("  from PIL import Image")
    print("  img = Image.open('your_image.png').convert('L')")
    print("  dithered = floyd_steinberg_dither(np.array(img))")


if __name__ == "__main__":
    main()
