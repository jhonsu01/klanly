#!/usr/bin/env python
"""
Genera los assets de la app de Android TV: el banner (obligatorio en el
lanzador de television) y los iconos de la app.

El banner debe ser 320x180 en xhdpi; Android TV lo muestra en la fila de apps.
Se dibuja con la identidad Nocturno: fondo #08080A, la K sobre el degradado de
marca y el nombre en claro.

Uso:  python scripts/gen_tv_assets.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
RES = RAIZ / "apps" / "androidtv" / "app" / "src" / "main" / "res"

BG = (8, 8, 10, 255)          # --bg
ACCENT = (91, 61, 245, 255)   # --accent
ACCENT2 = (139, 92, 246, 255) # --accent2
TEXTO = (237, 237, 243, 255)  # --text
DIM = (95, 95, 114, 255)      # --dim


def fuente(px, negrita=True):
    """Busca una fuente del sistema; si no hay, la de Pillow."""
    candidatas = [
        "C:/Windows/Fonts/segoeuib.ttf" if negrita else "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arialbd.ttf" if negrita else "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for c in candidatas:
        try:
            return ImageFont.truetype(c, px)
        except Exception:
            continue
    return ImageFont.load_default()


def degradado(tam, c1, c2):
    """Degradado diagonal, como el logo de la web."""
    w, h = tam
    img = Image.new("RGBA", tam)
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(1, w - 1) * 0.6) + (y / max(1, h - 1) * 0.4)
            px[x, y] = tuple(int(a + (b - a) * t) for a, b in zip(c1, c2))
    return img


def redondear(img, radio):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radio, fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


def logo(lado):
    """Cuadro con degradado y la K centrada."""
    tile = redondear(degradado((lado, lado), ACCENT, ACCENT2), int(lado * 0.28))
    d = ImageDraw.Draw(tile)
    f = fuente(int(lado * 0.58))
    caja = d.textbbox((0, 0), "K", font=f)
    d.text(
        ((lado - (caja[2] - caja[0])) / 2 - caja[0], (lado - (caja[3] - caja[1])) / 2 - caja[1]),
        "K", font=f, fill=(255, 255, 255, 255),
    )
    return tile


def banner():
    """320x180: lo que se ve en la fila de apps del televisor."""
    W, H = 320, 180
    img = Image.new("RGBA", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Trama de puntos de la identidad Nocturno
    for y in range(0, H, 12):
        for x in range(0, W, 12):
            d.point((x, y), fill=(255, 255, 255, 14))

    lado = 64
    img.alpha_composite(logo(lado), (24, (H - lado) // 2 - 10))

    f1, f2 = fuente(30), fuente(12, negrita=False)
    d.text((24 + lado + 18, H // 2 - 26), "Klanly", font=f1, fill=TEXTO)
    d.text((24 + lado + 18, H // 2 + 8), "ENTRENAMIENTO EN TV", font=f2, fill=DIM)

    salida = RES / "drawable"
    salida.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(salida / "tv_banner.png")
    print("banner  320x180 ->", (salida / "tv_banner.png").relative_to(RAIZ))


def iconos():
    """Iconos del lanzador, por densidad."""
    for carpeta, lado in [("mipmap-mdpi", 48), ("mipmap-hdpi", 72), ("mipmap-xhdpi", 96),
                          ("mipmap-xxhdpi", 144), ("mipmap-xxxhdpi", 192)]:
        dst = RES / carpeta
        dst.mkdir(parents=True, exist_ok=True)
        logo(lado).save(dst / "ic_launcher.png")
    print("iconos  mdpi..xxxhdpi -> res/mipmap-*/ic_launcher.png")


if __name__ == "__main__":
    banner()
    iconos()
    print("listo")
