"""Generate cinematic rear-POV road backdrops (no rider) for each virtual route
using Gemini Nano Banana. Saves to frontend assets as route_bg_<id>.<ext>.
"""
import asyncio, base64, os
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
load_dotenv()
API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"
ASSETS = "/app/frontend/assets/images"

COMMON = (
    "Cinematic first-person point-of-view from directly behind, looking straight down an EMPTY road "
    "that leads to a vanishing point in the exact CENTER of the frame. The road fills the lower-center. "
    "Absolutely NO people, NO cyclists, NO bikes, NO text. Wide 3:2 landscape, photorealistic, dramatic depth, "
    "high detail. Leave the center-foreground clear (a rider will be composited there)."
)

ROUTES = {
    "alpine-sunset-pass": "A mountain pass road climbing through the Italian Dolomites at golden-hour sunset, jagged peaks, an alpine lake to the left, warm orange light and long shadows.",
    "coastal-sprint": "A coastal road hugging the cliffs of the Amalfi Coast, brilliant turquoise Mediterranean sea to the right, bright midday sun, pastel seaside village in the distance.",
    "forest-loop": "A shaded forest road winding through the tall dark pines of the Black Forest in Germany, soft dappled morning light, green ferns and mist between the trees.",
    "desert-climb": "A long straight desert road climbing through the red-rock canyons of the Atacama in Chile, vast arid dunes, harsh blue sky, heat haze on the horizon.",
}

async def main():
    for rid, scene in ROUTES.items():
        chat = LlmChat(api_key=API_KEY, session_id=f"bg-{rid}", system_message="You are a world-class cinematographer.")
        chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
        msg = UserMessage(text=f"{scene} {COMMON}")
        text, images = await chat.send_message_multimodal_response(msg)
        if images:
            mime = images[0]["mime_type"]
            ext = "jpg" if "jpeg" in mime else "png"
            out = os.path.join(ASSETS, f"route_bg_{rid}.{ext}")
            with open(out, "wb") as f:
                f.write(base64.b64decode(images[0]["data"]))
            print(f"saved {out} mime={mime}")
        else:
            print(f"{rid}: NO IMAGE {text[:100]}")

asyncio.run(main())
