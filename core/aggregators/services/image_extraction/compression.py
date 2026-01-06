"""
Image compression and encoding utilities.

Handles:
- Image resizing and format conversion using Pillow
- Base64 encoding for data URIs
- Quality optimization
"""

import base64
import io
import logging
from typing import Any, Dict, Optional

from PIL import Image

logger = logging.getLogger(__name__)

# Image compression settings
MAX_IMAGE_WIDTH = 600
MAX_IMAGE_HEIGHT = 600
MAX_HEADER_IMAGE_WIDTH = 1200
MAX_HEADER_IMAGE_HEIGHT = 1200
JPEG_QUALITY = 95
WEBP_QUALITY = 95
PREFER_WEBP = True
MIN_IMAGE_SIZE = 5000  # 5KB - skip compression if smaller


def compress_image(
    image_data: bytes,
    content_type: str,
    is_header: bool = False,
) -> Dict[str, Any] | None:
    """
    Compress and convert image to optimized format.

    Process:
    1. Load image with Pillow
    2. Resize if larger than max dimensions (never upscale)
    3. Convert to WebP or JPEG (prefer WebP)
    4. Return compressed data and metadata

    Args:
        image_data: Raw image bytes
        content_type: Original MIME type
        is_header: Whether this is a header image (uses MAX_HEADER_IMAGE_* if True)

    Returns:
        Dict with keys:
            - data: Compressed image bytes
            - contentType: Output MIME type (image/webp or image/jpeg)
            - size: Size in bytes
            - width: Output width
            - height: Output height
    """
    try:
        # Skip compression for very small files
        if len(image_data) < MIN_IMAGE_SIZE:
            logger.debug(f"Skipping compression for small image ({len(image_data)} bytes)")
            return {
                "data": image_data,
                "contentType": content_type,
                "size": len(image_data),
                "width": None,
                "height": None,
            }

        # Load image
        img: Any = Image.open(io.BytesIO(image_data))

        # Convert RGBA to RGB if needed (for JPEG)
        if img.mode in ("RGBA", "LA", "P"):
            # Check if image has transparency
            if img.mode == "P" and "transparency" in img.info:
                # Keep as PNG
                output_format = "PNG"
            elif img.mode == "RGBA" or img.mode == "LA":
                # Has transparency, keep as PNG or use WEBP
                output_format = "WEBP" if PREFER_WEBP else "PNG"
            else:
                # No transparency, convert to RGB
                background = Image.new("RGB", img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
                img = background
                output_format = "WEBP" if PREFER_WEBP else "JPEG"
        else:
            output_format = "WEBP" if PREFER_WEBP else "JPEG"

        # Get original dimensions
        original_width, original_height = img.size

        # Calculate resize ratio
        if is_header:
            max_width = MAX_HEADER_IMAGE_WIDTH
            max_height = MAX_HEADER_IMAGE_HEIGHT
            # Never upscale
            ratio = min(max_width / original_width, max_height / original_height, 1.0)
        else:
            # Do not shrink non-header images
            ratio = 1.0

        if ratio < 1.0:
            # Resize using high-quality resampling
            new_width = int(original_width * ratio)
            new_height = int(original_height * ratio)
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            logger.debug(
                f"Resized image from {original_width}x{original_height} to {new_width}x{new_height}"
            )
        else:
            new_width, new_height = original_width, original_height

        # Compress and encode
        output = io.BytesIO()

        if output_format == "WEBP":
            img.save(
                output,
                format="WEBP",
                quality=WEBP_QUALITY,
                method=6,  # Slowest but best quality
            )
            content_type = "image/webp"
        elif output_format == "PNG":
            img.save(output, format="PNG", optimize=True)
            content_type = "image/png"
        else:  # JPEG
            # Convert to RGB if needed
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(
                output,
                format="JPEG",
                quality=JPEG_QUALITY,
                optimize=True,
                progressive=True,
            )
            content_type = "image/jpeg"

        compressed_data = output.getvalue()

        # Log compression ratio
        original_size = len(image_data)
        compressed_size = len(compressed_data)
        ratio_pct = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0

        logger.debug(
            f"Compressed image: {original_size}b -> {compressed_size}b ({ratio_pct:.1f}% reduction) [{content_type}]"
        )

        return {
            "data": compressed_data,
            "contentType": content_type,
            "size": compressed_size,
            "width": new_width,
            "height": new_height,
        }

    except Exception as e:
        logger.error(f"Error compressing image: {e}")
        return None


def compress_and_encode_image(
    image_data: bytes,
    content_type: str,
    is_header: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Compress image and encode as base64 data URI.

    Process:
    1. Compress image using compress_image()
    2. Base64 encode compressed data
    3. Create data URI

    Args:
        image_data: Raw image bytes
        content_type: Original MIME type
        is_header: Whether this is a header image

    Returns:
        Dict with keys:
            - dataUri: Complete data URI for HTML (data:image/...;base64,...)
            - size: Compressed size in bytes
            - outputType: Output MIME type
        Returns None if compression fails
    """
    try:
        result = compress_image(image_data, content_type, is_header=is_header)
        if not result:
            return None

        compressed_data = result["data"]
        output_type = result["contentType"]

        # Base64 encode
        b64_str = base64.b64encode(compressed_data).decode("utf-8")
        data_uri = f"data:{output_type};base64,{b64_str}"

        logger.debug(f"Created data URI ({len(data_uri)} chars)")

        return {
            "dataUri": data_uri,
            "size": result["size"],
            "outputType": output_type,
        }

    except Exception as e:
        logger.error(f"Error encoding image to data URI: {e}")
        return None


def create_image_element(data_uri: str, alt: str = "Image") -> str:
    """
    Create HTML image element from data URI.

    Wraps image in <p> tag with responsive styling.

    Args:
        data_uri: Base64 data URI
        alt: Alt text for accessibility

    Returns:
        HTML string with <p><img></p>
    """
    # Escape alt text for HTML
    alt_escaped = alt.replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")

    return (
        f'<p><img src="{data_uri}" alt="{alt_escaped}" style="max-width: 100%; height: auto;"></p>'
    )
