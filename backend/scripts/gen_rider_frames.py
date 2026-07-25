"""One-off: generate articulated pedalling sprite frames for a virtual rider
from an existing rear-view plate using Gemini Nano Banana image editing.

Usage: python scripts/gen_rider_frames.py <input_png> <out_prefix> [n_frames]
Outputs <out_prefix>_0.png .. to the frontend assets dir.
"""
import asyncio
import base64
import os
import sys
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

load_dotenv()
API_KEY = os.getenv("EMERGENT_LLM_KEY")
MODEL = "gemini-3.1-flash-image-preview"

# Leg descriptions around one pedal revolution (rear view).
LEG_POS = [
    "LEFT foot at the very top of the pedal stroke with the left knee raised, RIGHT leg fully extended straight down pressing the pedal",
    "both legs at mid pedal stroke, LEFT leg descending, RIGHT leg rising, knees slightly bent",
    "RIGHT foot at the very top of the pedal stroke with the right knee raised, LEFT leg fully extended straight down pressing the pedal",
    "both legs at mid pedal stroke, RIGHT leg descending, LEFT leg rising, knees slightly bent",
]

ASSETS = "/app/frontend/assets/images"


async def main():
    inp = sys.argv[1]
    prefix = sys.argv[2]
    n = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    with open(inp, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")

    for i in range(n):
        pos = LEG_POS[i % len(LEG_POS)]
        chat = LlmChat(api_key=API_KEY, session_id=f"rider-{prefix}-{i}", system_message="You are an expert sports photo editor.")
        chat.with_model("gemini", MODEL).with_params(modalities=["image", "text"])
        prompt = (
            "Take the rear-view road cyclist in this image. Keep the SAME rider, SAME kit and colors, "
            "SAME bike, SAME body proportions, SAME camera angle and framing, SAME lighting. "
            "Place the rider on a FULLY TRANSPARENT background (alpha), removing all scenery. "
            f"Adjust ONLY the legs to this pedalling position: {pos}. "
            "Photorealistic, sharp, rear view, centered, full body from helmet to pedals."
        )
        msg = UserMessage(text=prompt, file_contents=[ImageContent(b64)])
        text, images = await chat.send_message_multimodal_response(msg)
        if images:
            data = base64.b64decode(images[0]["data"])
            out = os.path.join(ASSETS, f"{prefix}_{i}.png")
            with open(out, "wb") as fh:
                fh.write(data)
            print(f"saved {out} ({len(data)} bytes) mime={images[0]['mime_type']}")
        else:
            print(f"frame {i}: NO IMAGE. text={text[:120]}")


if __name__ == "__main__":
    asyncio.run(main())
