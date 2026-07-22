// Extract an 11-char YouTube video ID from any standard URL or a bare ID.
export function getYouTubeId(input?: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  const re = /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]{11})/;
  const m = trimmed.match(re);
  return m && m[1].length === 11 ? m[1] : null;
}

export function posterFor(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
