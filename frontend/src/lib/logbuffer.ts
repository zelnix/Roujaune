// Lightweight in-memory ring buffer that captures recent console output so the
// "About & Support" screen can attach it to a support email. Non-invasive: the
// original console methods are still called.

type Level = "log" | "info" | "warn" | "error";

const MAX = 200;
const buffer: { t: number; level: Level; msg: string }[] = [];
let installed = false;

function fmt(args: any[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function push(level: Level, args: any[]) {
  buffer.push({ t: Date.now(), level, msg: fmt(args).slice(0, 800) });
  if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);
}

export function installLogBuffer() {
  if (installed) return;
  installed = true;
  (["log", "info", "warn", "error"] as Level[]).forEach((level) => {
    const orig = (console as any)[level]?.bind(console);
    (console as any)[level] = (...args: any[]) => {
      try {
        push(level, args);
      } catch {
        // never let logging break the app
      }
      orig?.(...args);
    };
  });
}

/** Recent logs as a readable string, oldest → newest. */
export function getRecentLogs(): string {
  if (buffer.length === 0) return "(no recent logs captured)";
  return buffer
    .map((e) => `[${new Date(e.t).toISOString()}] ${e.level.toUpperCase()}: ${e.msg}`)
    .join("\n");
}
