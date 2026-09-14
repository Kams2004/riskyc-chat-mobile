"""
Regenerates every app icon asset from the same brand recipe used by
src/components/Logo.tsx (radial gradient pink card, gold border, white
Playfair Display "RC" monogram, gold dot) so the in-app logo, the iOS/web
icon, and every Android adaptive-icon layer are all pixel-consistent instead
of hand-made / AI-generated separately (which is how the previous Android
layers ended up broken: background.png was a leftover design-tool safe-zone
guide template, foreground.png was missing the "RC" mark entirely, and
monochrome.png was blank).
"""
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "node_modules/@expo-google-fonts/playfair-display/700Bold/PlayfairDisplay_700Bold.ttf"

GOLD = (230, 184, 0, 255)       # #e6b800
WHITE = (255, 255, 255, 255)

def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

STOPS = [(0.0, hex_rgb('ff5585')), (0.55, hex_rgb('ff1a5e')), (1.0, hex_rgb('c2003d'))]

def radial_gradient(size, center, radius):
    """Matches Logo.tsx's <radialGradient cx=32% cy=26% r=90%> over a square bbox."""
    y, x = np.mgrid[0:size, 0:size]
    dist = np.sqrt((x - center[0]) ** 2 + (y - center[1]) ** 2) / radius
    dist = np.clip(dist, 0, 1)
    out = np.zeros((size, size, 3), dtype=np.float64)
    for (s0, c0), (s1, c1) in zip(STOPS, STOPS[1:]):
        mask = (dist >= s0) & (dist <= s1)
        t = np.zeros_like(dist)
        span = (s1 - s0) or 1
        t[mask] = (dist[mask] - s0) / span
        for ch in range(3):
            out[..., ch][mask] = c0[ch] + (c1[ch] - c0[ch]) * t[mask]
    return out.astype(np.uint8)

def draw_mark(draw, size, font_size, center_y_bias=0.0, color=WHITE, dot_color=GOLD):
    """Draws the 'RC' wordmark + gold accent dot, centered, matching Logo.tsx's
    layout (dot sits just below/right of the 'C'). Returns nothing; draws in place."""
    font = ImageFont.truetype(FONT_PATH, font_size)
    text = "RC"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx, cy = size / 2, size / 2 + size * center_y_bias
    tx = cx - tw / 2 - bbox[0]
    ty = cy - th / 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=color)
    dot_r = size * 0.039
    dot_cx = cx + size * 0.224
    dot_cy = cy + size * 0.145
    draw.ellipse([dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r], fill=dot_color)

def rounded_rect_mask(size, inset, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([inset, inset, size - inset, size - inset], radius=radius, fill=255)
    return mask

# ---------------------------------------------------------------------------
# 1. icon.png — main iOS/web/fallback icon: full-bleed rounded card, gold
#    border, gradient fill, white "RC", gold dot.
# ---------------------------------------------------------------------------
SIZE = 1024
inset, radius, border = 32, 215, 18
grad = radial_gradient(SIZE, (32 + 0.32 * 960, 32 + 0.26 * 960), 0.9 * 960)
base = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
grad_img = Image.fromarray(np.dstack([grad, np.full((SIZE, SIZE), 255, dtype=np.uint8)]), 'RGBA')
card_mask = rounded_rect_mask(SIZE, inset, radius)
base.paste(grad_img, (0, 0), card_mask)

border_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
bd = ImageDraw.Draw(border_layer)
bd.rounded_rectangle([inset, inset, SIZE - inset, SIZE - inset], radius=radius, outline=GOLD, width=border)
base = Image.alpha_composite(base, border_layer)

draw = ImageDraw.Draw(base)
draw_mark(draw, SIZE, font_size=430, center_y_bias=0.01)
base.save('assets/icon.png')
base.save('assets/splash-icon-card.png')  # scratch, unused

# ---------------------------------------------------------------------------
# 2. android-icon-background.png — full-bleed gradient, NO rounding/border:
#    Android applies its own mask shape on top of this layer.
# ---------------------------------------------------------------------------
grad_full = radial_gradient(SIZE, (0.32 * SIZE, 0.26 * SIZE), 0.9 * SIZE)
bg = Image.fromarray(np.dstack([grad_full, np.full((SIZE, SIZE), 255, dtype=np.uint8)]), 'RGBA')
bg.save('assets/android-icon-background.png')

# ---------------------------------------------------------------------------
# 3. android-icon-foreground.png — mark only, transparent bg, sized to sit
#    inside Android's safe zone (inner ~66% of the canvas survives every
#    mask shape) so the "RC" is never clipped by a circular/squircle mask.
# ---------------------------------------------------------------------------
fg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
fg_draw = ImageDraw.Draw(fg)
draw_mark(fg_draw, SIZE, font_size=300, center_y_bias=0.0)
fg.save('assets/android-icon-foreground.png')

# ---------------------------------------------------------------------------
# 4. android-icon-monochrome.png — same silhouette, solid white on
#    transparent (Android 13+ themed-icon layer; the OS tints it itself).
# ---------------------------------------------------------------------------
mono = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
mono_draw = ImageDraw.Draw(mono)
draw_mark(mono_draw, SIZE, font_size=300, center_y_bias=0.0, color=WHITE, dot_color=WHITE)
mono.save('assets/android-icon-monochrome.png')

# ---------------------------------------------------------------------------
# 5. splash-icon.png — clean centered wordmark for the splash SCREEN, which
#    already has the pink brand color as its full-screen background
#    (app.json expo-splash-screen backgroundColor) — no redundant card/
#    border here, that would just draw a small icon-on-icon.
# ---------------------------------------------------------------------------
splash = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
splash_draw = ImageDraw.Draw(splash)
draw_mark(splash_draw, SIZE, font_size=340, center_y_bias=0.0, color=WHITE, dot_color=GOLD)
splash.save('assets/splash-icon.png')

# ---------------------------------------------------------------------------
# 6. favicon.png — small web favicon, same card design as icon.png.
# ---------------------------------------------------------------------------
favicon = base.resize((196, 196), Image.LANCZOS)
favicon.save('assets/favicon.png')

import os
os.remove('assets/splash-icon-card.png')

print("done")
