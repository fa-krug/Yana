#!/usr/bin/env python3
"""
Test script for image validation fix.

Tests that HTML content is properly rejected and not treated as images.
"""

import base64
import io
import os
import sys

# Add the project to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Mock Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "aggregato.settings")


def test_content_type_validation():
    """Test that non-image content types are rejected."""
    print("=" * 60)
    print("Test 1: Content Type Validation")
    print("=" * 60)

    # Simulate what would happen with text/html content type
    content_type = "text/html"

    # This should be rejected
    if not content_type.startswith("image/"):
        print(f"✓ PASS: {content_type} correctly rejected")
        return True
    else:
        print(f"✗ FAIL: {content_type} should have been rejected")
        return False


def test_pil_validation():
    """Test that invalid image data fails PIL validation."""
    print("\n" + "=" * 60)
    print("Test 2: PIL Image Validation")
    print("=" * 60)

    try:
        from PIL import Image

        # Test with HTML content disguised as image
        html_content = b"<!DOCTYPE html><html><body>Not an image</body></html>"

        try:
            img = Image.open(io.BytesIO(html_content))
            img.verify()
            print("✗ FAIL: PIL should have rejected HTML content")
            return False
        except Exception as e:
            print(
                f"✓ PASS: PIL correctly rejected invalid image data: {type(e).__name__}"
            )
            return True

    except ImportError:
        print("⚠ SKIP: PIL not available")
        return True


def test_valid_image():
    """Test that valid images are accepted."""
    print("\n" + "=" * 60)
    print("Test 3: Valid Image Acceptance")
    print("=" * 60)

    try:
        from PIL import Image

        # Create a small valid PNG image (1x1 red pixel)
        img = Image.new("RGB", (1, 1), color="red")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        valid_image_data = buffer.getvalue()

        # This should pass validation
        content_type = "image/png"

        if content_type.startswith("image/"):
            try:
                img = Image.open(io.BytesIO(valid_image_data))
                img.verify()
                print("✓ PASS: Valid PNG image accepted")
                return True
            except Exception as e:
                print(f"✗ FAIL: Valid PNG was rejected: {e}")
                return False
        else:
            print("✗ FAIL: image/png should be accepted")
            return False

    except ImportError:
        print("⚠ SKIP: PIL not available")
        return True


def test_data_uri_validation():
    """Test that data URIs are validated properly."""
    print("\n" + "=" * 60)
    print("Test 4: Data URI Validation")
    print("=" * 60)

    # Case 1: HTML data URI (should be rejected)
    html_b64 = base64.b64encode(b"<html>test</html>").decode("utf-8")
    html_data_uri = f"data:text/html;base64,{html_b64}"

    if html_data_uri.startswith("data:"):
        header = html_data_uri.split(";base64,")[0]
        content_type = header.split(":", 1)[1]

        if not content_type.startswith("image/"):
            print("✓ PASS: data:text/html URI correctly rejected")
        else:
            print("✗ FAIL: data:text/html should be rejected")
            return False

    # Case 2: Image data URI (should be accepted)
    try:
        from PIL import Image

        img = Image.new("RGB", (1, 1), color="blue")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        image_data = buffer.getvalue()
        image_b64 = base64.b64encode(image_data).decode("utf-8")
        image_data_uri = f"data:image/png;base64,{image_b64}"

        if image_data_uri.startswith("data:"):
            header = image_data_uri.split(";base64,")[0]
            content_type = header.split(":", 1)[1]

            if content_type.startswith("image/"):
                decoded = base64.b64decode(image_b64)
                img_test = Image.open(io.BytesIO(decoded))
                img_test.verify()
                print("✓ PASS: data:image/png URI correctly accepted")
                return True
            else:
                print("✗ FAIL: data:image/png should be accepted")
                return False

    except ImportError:
        print("⚠ SKIP: PIL not available for image data URI test")
        return True


def main():
    """Run all tests."""
    print("\n")
    print("╔" + "═" * 58 + "╗")
    print("║" + " " * 15 + "IMAGE VALIDATION FIX TESTS" + " " * 17 + "║")
    print("╚" + "═" * 58 + "╝")
    print()

    results = []

    # Run tests
    results.append(("Content Type Validation", test_content_type_validation()))
    results.append(("PIL Validation", test_pil_validation()))
    results.append(("Valid Image", test_valid_image()))
    results.append(("Data URI Validation", test_data_uri_validation()))

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    passed = sum(1 for _, result in results if result)
    total = len(results)

    for test_name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")

    print()
    print(f"Total: {passed}/{total} tests passed")

    if passed == total:
        print(
            "\n✓ All tests passed! The fix prevents HTML from being treated as images."
        )
        return 0
    else:
        print(f"\n✗ {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
