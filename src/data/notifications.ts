// The notification history (plugin "notifications"), and how each entry is
// drawn: accent and glyph by app, like the reference's NotifService.

export interface Notification {
  id: number;
  app: string;
  summary: string;
  body: string;
  /** Theme icon name or path from the sender; "" if none. */
  icon: string;
  /** 0 low, 1 normal, 2 critical. */
  urgency: number;
  /** Epoch seconds. */
  time: number;
}

export const list = () => use("notifications").subscribe<Notification[]>("list")() ?? [];
export const dnd = () => use("notifications").subscribe<{ dnd: boolean }>("state")()?.dnd ?? false;
export const toggleDnd = () => use("notifications").call("toggle_dnd");
export const setDnd = (on: boolean) => use("notifications").call("set_dnd", { on });
export const dismiss = (id: number) => use("notifications").call("dismiss", { id });
export const clearAll = () => use("notifications").call("clear");

/** "cyan", "purple"...: a theme accent name. */
export function accent(n: Notification): string {
  const app = n.app.toLowerCase();
  if (n.urgency === 2) return "red";
  if (/calen|calcure|agenda/.test(app)) return "purple";
  if (/timer|pomodoro|alarm|relógio|clock/.test(app)) return "green";
  if (/claude|codex|ai-usage/.test(app)) return "orange";
  if (/discord|telegram|slack|mail/.test(app)) return "yellow";
  return "cyan";
}

export function glyph(n: Notification): string {
  const app = n.app.toLowerCase();
  if (/calen|calcure|agenda/.test(app)) return "calendar-dots";
  if (/timer|pomodoro|alarm/.test(app)) return "timer";
  if (/download|helium|firefox|browser/.test(app)) return "download-simple";
  if (/screenshot|hyprshot|gradia/.test(app)) return "crop";
  if (/claude|codex|ai-usage/.test(app)) return "gauge";
  if (/discord|telegram|slack/.test(app)) return "chat-circle-dots";
  if (/mail/.test(app)) return "envelope-simple";
  if (/battery|power|upower/.test(app)) return "battery-warning";
  return "bell-simple";
}

/** "app · summary", or whichever exists. */
export function title(n: Notification): string {
  const app = n.app.toLowerCase();
  return app && n.summary && app !== n.summary.toLowerCase() ? `${app} · ${n.summary}` : n.summary || app;
}

/** "agora", "4 min", "2 h", "3 d" at `now`. */
export function age(n: Notification, now: Date): string {
  const minutes = Math.floor((now.getTime() / 1000 - n.time) / 60);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  return `${Math.floor(minutes / 1440)} d`;
}

/** Image source of the sender's icon: a theme name or an absolute path. */
export function image(n: Notification): string {
  if (!n.icon) return "";
  if (n.icon.startsWith("/")) return `file:${n.icon}`;
  return apps.icon(n.icon);
}
