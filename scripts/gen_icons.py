#!/usr/bin/env python3
"""
Generador de iconos de Klanly.

Produce, a partir de un master vectorial-ish (gradiente + inicial de la marca):
  - Iconos de escritorio (Tauri): 32/128/256/512 PNG + icon.ico multi-resolucion
  - Iconos Android (mipmaps) para 5 densidades: mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi
       * ic_launcher.png (cuadrado redondeado)
       * ic_launcher_round.png (circular)
       * ic_launcher_foreground.png (adaptive, fondo transparente)

Uso:  python scripts/gen_icons.py [ruta_base_repo]
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

BASE = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

C1 = (91, 61, 245)    # #5B3DF5
C2 = (139, 92, 246)   # #8B5CF6
FONT_PATH = r"C:\Windows\Fonts\arialbd.ttf"
LETTER = "K"          # inicial de la marca (Klanly)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(n):
    """Gradiente diagonal suave (construido pequeno y reescalado)."""
    small = 64
    img = Image.new("RGB", (small, small))
    px = []
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * (small - 1))
            px.append(lerp(C1, C2, t))
    img.putdata(px)
    return img.resize((n, n), Image.BICUBIC).convert("RGBA")


def draw_S(img, ratio=0.62, fill=(255, 255, 255, 255)):
    n = img.size[0]
    d = ImageDraw.Draw(img)
    size = int(n * ratio)
    font = ImageFont.truetype(FONT_PATH, size)
    bbox = d.textbbox((0, 0), LETTER, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = (n - w) / 2 - bbox[0]
    y = (n - h) / 2 - bbox[1]
    d.text((x, y), LETTER, font=font, fill=fill)
    return img


def rounded_mask(n, radius_ratio=0.22):
    m = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(m)
    r = int(n * radius_ratio)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=r, fill=255)
    return m


def circle_mask(n):
    m = Image.new("L", (n, n), 0)
    ImageDraw.Draw(m).ellipse([0, 0, n - 1, n - 1], fill=255)
    return m


# Master 1024: gradiente + S crisp
MASTER = 1024
master = gradient(MASTER)
master = draw_S(master, ratio=0.60)

# Foreground adaptive (transparente + S mas pequena, dentro de la zona segura)
fg_master = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
fg_master = draw_S(fg_master, ratio=0.42)


def save(img, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path)
    print("  ->", os.path.relpath(path, BASE).replace("\\", "/"))


# ---------- TAURI (escritorio) ----------
tauri_icons = os.path.join(BASE, "apps", "admin-windows", "src-tauri", "icons")
print("Tauri (escritorio):")
sq = lambda n: master.resize((n, n), Image.LANCZOS)
save(sq(32), os.path.join(tauri_icons, "32x32.png"))
save(sq(128), os.path.join(tauri_icons, "128x128.png"))
save(sq(256), os.path.join(tauri_icons, "128x128@2x.png"))
save(sq(512), os.path.join(tauri_icons, "icon.png"))
# ICO multi-resolucion para Windows
ico_path = os.path.join(tauri_icons, "icon.ico")
sq(256).save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print("  ->", os.path.relpath(ico_path, BASE).replace("\\", "/"), "(16..256)")

# ---------- ANDROID (mipmaps) ----------
android_res = os.path.join(BASE, "apps", "android", "app", "src", "main", "res")
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FG_DENSITIES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
print("Android (mipmaps por densidad):")
for dens, size in DENSITIES.items():
    folder = os.path.join(android_res, f"mipmap-{dens}")
    # Legacy cuadrado redondeado
    base_sq = master.resize((size, size), Image.LANCZOS).convert("RGBA")
    base_sq.putalpha(rounded_mask(size))
    save(base_sq, os.path.join(folder, "ic_launcher.png"))
    # Legacy round (circular)
    base_round = master.resize((size, size), Image.LANCZOS).convert("RGBA")
    base_round.putalpha(circle_mask(size))
    save(base_round, os.path.join(folder, "ic_launcher_round.png"))
    # Adaptive foreground (transparente)
    fg_size = FG_DENSITIES[dens]
    fg = fg_master.resize((fg_size, fg_size), Image.LANCZOS)
    save(fg, os.path.join(folder, "ic_launcher_foreground.png"))

print("\nIconos generados correctamente.")
