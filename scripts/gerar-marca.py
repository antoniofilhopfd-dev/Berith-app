"""Gera logos e ícones da PWA a partir de design/logo-original.png (arquivo enviado pela comunidade).
Uso (apenas quando a logo mudar): python3 scripts/gerar-marca.py   — requer Pillow."""
from PIL import Image, ImageDraw
import os

RAIZ = os.path.join(os.path.dirname(__file__), "..")
src = Image.open(os.path.join(RAIZ, "design", "logo-original.png")).convert("RGBA")
W, H = src.size
VERDE = (88, 116, 88)       # fundo dos ícones (verde da marca, levemente escurecido p/ contraste)
COBRE = (176, 120, 64)

def aparar(img, pad=24):
    bb = img.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
    c = img.crop((max(bb[0] - pad, 0), max(bb[1] - pad, 0), min(bb[2] + pad, img.width), min(bb[3] + pad, img.height)))
    return c

topo, base = src.crop((0, 0, W, H // 2)), src.crop((0, H // 2, W, H))
for nome, img in (("logo-cor", topo), ("logo-branco", base)):
    l = aparar(img)
    l = l.resize((900, round(l.height * 900 / l.width)), Image.LANCZOS)
    l.save(os.path.join(RAIZ, "public", "brand", nome + ".png"), optimize=True)

# Tau com rosa (versão branca, parte de baixo) — recorte interno ao círculo
tau = aparar(base.crop((958, 285, 1268, 645)), pad=8)

def icone(tam, seguro):
    """seguro = fração do lado ocupada pelo conteúdo (maskable usa 0.6 para caber na zona segura)."""
    img = Image.new("RGBA", (tam, tam), VERDE + (255,))
    d = ImageDraw.Draw(img)
    lado = tam * seguro
    # anel cobre
    esp = max(2, round(tam * 0.018))
    box = ((tam - lado) / 2, (tam - lado) / 2, (tam + lado) / 2, (tam + lado) / 2)
    d.ellipse(box, outline=COBRE + (255,), width=esp)
    t = tau.copy(); alvo = lado * 0.58
    t = t.resize((round(t.width * alvo / t.height), round(alvo)), Image.LANCZOS)
    img.alpha_composite(t, ((tam - t.width) // 2, (tam - t.height) // 2))
    return img

icones = {"icon-192.png": (192, 0.80), "icon-512.png": (512, 0.80), "icon-maskable-512.png": (512, 0.62), "apple-touch-icon.png": (180, 0.80), "icon-48.png": (48, 0.86)}
for nome, (tam, seg) in icones.items():
    icone(tam, seg).convert("RGB").save(os.path.join(RAIZ, "public", "icons", nome), optimize=True)
icone(64, 0.86).save(os.path.join(RAIZ, "app", "favicon.ico"), format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
print("Marca gerada.")
