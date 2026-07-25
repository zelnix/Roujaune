import asyncio, base64, os
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage
load_dotenv()
API_KEY=os.getenv("EMERGENT_LLM_KEY"); MODEL="gemini-3.1-flash-image-preview"; A="/app/frontend/assets/images"
COMMON=("Cinematic first-person point-of-view from directly behind, looking straight down an EMPTY road "
 "leading to a vanishing point in the exact CENTER of the frame. The road fills the lower-center. "
 "No people, no cyclists, no bikes, no text. Wide 3:2 landscape, photorealistic, dramatic depth, high detail. "
 "Leave the center-foreground clear.")
ROUTES={
 "city-night-crit":"An empty downtown city street race circuit in the evening, wet asphalt reflecting warm street lamps and colourful shop-window lights, modern glass buildings on both sides, metal crowd barriers along the edges.",
 "rainy-cobbles":"An empty narrow cobblestone country lane in the rain, wet shiny cobbles, grey misty overcast sky, bare trees and old brick farm buildings along both sides, cold atmospheric mood.",
}
async def one(rid,scene):
 for attempt in range(3):
  try:
   c=LlmChat(api_key=API_KEY,session_id=f"bg-{rid}-{attempt}",system_message="You are a world-class landscape cinematographer.")
   c.with_model("gemini",MODEL).with_params(modalities=["image","text"])
   t,imgs=await c.send_message_multimodal_response(UserMessage(text=f"{scene} {COMMON}"))
   if imgs:
    ext="jpg" if "jpeg" in imgs[0]["mime_type"] else "png"
    open(f"{A}/route_bg_{rid}.{ext}","wb").write(base64.b64decode(imgs[0]["data"]))
    print("saved",rid,ext); return
   print(rid,"noimg attempt",attempt)
  except Exception as e:
   print(rid,"err attempt",attempt,str(e)[:60])
  await asyncio.sleep(2)
async def main():
 for rid,scene in ROUTES.items():
  await one(rid,scene)
asyncio.run(main())
