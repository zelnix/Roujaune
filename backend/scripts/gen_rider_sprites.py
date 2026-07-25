"""Isolate each virtual rider on a chroma-green background via Gemini Nano
Banana, then key the green out to produce transparent rider sprite PNGs for
compositing over route backdrops. Saves vr_sprite_<name>.png to assets.
"""
import asyncio, base64, os, io
import numpy as np
from PIL import Image
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
load_dotenv()
API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"
ASSETS = "/app/frontend/assets/images"

SOURCES = ["vr_rider_male", "vr_rider_female", "vr_rider_mature_male", "vr_rider_mature_female"]

PROMPT = (
    "Take the rear-view road cyclist in this image. Keep the SAME rider, SAME kit and colors, SAME bicycle, "
    "SAME pose, SAME body proportions, SAME rear camera angle and framing. Replace the ENTIRE background with a "
    "single FLAT PURE CHROMA GREEN color (RGB 0,255,0), removing all scenery, sky and ground shadows so ONLY the "
    "rider and bicycle remain against solid green. Do not add any green tint to the rider. Photorealistic, sharp, centered."
)

def chroma_key(raw: bytes) -> bytes:
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    arr = np.array(im).astype(np.int16)
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    # Green screen mask: green clearly dominant over red & blue.
    dom = np.minimum(g - r, g - b)
    green = (g > 80) & (dom > 35)
    # Soft alpha near the key edge for anti-aliasing.
    alpha = np.clip(255 - (dom - 35) * 6, 0, 255)
    alpha = np.where(green, alpha, 255).astype(np.uint8)
    # Despill: pull green channel down toward max(r,b) where it spills.
    spill = np.maximum(r, b)
    g2 = np.where((g > spill) & (~green), spill, g)
    out = np.dstack([r, g2, b, alpha]).astype(np.uint8)
    return _to_png(Image.fromarray(out, "RGBA"))

def _to_png(im: Image.Image) -> bytes:
    # Trim fully-transparent margins to tighten the sprite.
    bbox = im.getchannel("A").getbbox()
    if bbox:
        im = im.crop(bbox)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return buf.getvalue()

async def main():
    for name in SOURCES:
        src = os.path.join(ASSETS, f"{name}.png")
        with open(src, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        chat = LlmChat(api_key=API_KEY, session_id=f"sprite-{name}", system_message="You are an expert VFX compositor.")
        chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
        msg = UserMessage(text=PROMPT, file_contents=[ImageContent(b64)])
        text, images = await chat.send_message_multimodal_response(msg)
        if images:
            keyed = chroma_key(base64.b64decode(images[0]["data"]))
            out = os.path.join(ASSETS, f"vr_sprite_{name.replace('vr_rider_','')}.png")
            with open(out, "wb") as fh:
                fh.write(keyed)
            print(f"saved {out} ({len(keyed)} bytes)")
        else:
            print(f"{name}: NO IMAGE {text[:100]}")

asyncio.run(main())
