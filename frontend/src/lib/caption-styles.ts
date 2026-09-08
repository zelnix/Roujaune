export type CaptionTone = "proud" | "playful" | "minimal";

export const CAPTION_TONES: { key: CaptionTone; label: string }[] = [
  { key: "proud", label: "Proud" },
  { key: "playful", label: "Playful" },
  { key: "minimal", label: "Minimal" },
];

/** Build a shareable caption in the rider's chosen voice from a few facts.
 * `stats` is a list of already-formatted snippets, e.g. ["23.7 km", "1:00:00",
 * "248 W avg"]. Used by the achievement, scenic-recap and summary share sheets. */
export function styleCaption(
  tone: CaptionTone,
  facts: { title?: string; place?: string; stats?: string[] },
): string {
  const title = (facts.title || "").trim();
  const place = (facts.place || "").trim();
  const stats = (facts.stats || []).filter(Boolean);
  const statLine = stats.join(" · ");
  const where = place ? ` in ${place}` : "";
  const name = title || "Today's ride";

  switch (tone) {
    case "proud":
      return [
        `Left it all out there${where}. 💪`,
        `${name}${statLine ? ` — ${statLine}` : ""}`,
        `Ridden on ROUJAUNE · Your strongest ride is your own.`,
      ].join("\n");
    case "playful":
      return [
        `Legs said no, I said one more 😅🚴`,
        `${name}${statLine ? ` · ${statLine}` : ""}${where}!`,
        `Powered by ROUJAUNE 🟡 #Roujaune`,
      ].join("\n");
    case "minimal":
    default:
      return `${name}${statLine ? ` — ${statLine}` : ""}\n#Roujaune`;
  }
}
