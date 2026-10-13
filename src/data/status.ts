// System status shown in the bar and the drawer: CPU, memory, battery,
// network, audio, notifications, keyboard layout, AI usage and the agenda.
// Every accessor is lazy: a surface only needs the capabilities of what it
// reads.

export const cpu = () => system.cpu() ?? 0;
export const cpuHistory = () => system.cpuHistory() ?? [];
export const memory = () => system.memory() ?? { percent: 0, usedGiB: 0, totalGiB: 0 };
export const disk = () => system.disk() ?? { percent: 0, usedGiB: 0, totalGiB: 0 };
export const temperature = () => system.temperature() ?? 0;
export const battery = (): Battery | null => system.battery();

export interface Net {
  online: boolean;
  wired: boolean;
  wifiEnabled: boolean;
  /** 0..1 */
  strength: number;
  ssid: string;
  bluetooth: { present: boolean; enabled: boolean; connected: string[] };
}
export const net = () => use("network").subscribe<Net>("state")();

export interface Audio {
  volume: number;
  muted: boolean;
}
export const audio = () => use("audio").subscribe<Audio>("state")();
export const changeVolume = (delta: number) => use("audio").call("change", { delta });
export const toggleMute = () => use("audio").call("toggle_mute");

export interface Notifications {
  count: number;
  dnd: boolean;
}
export const notifications = () => use("notifications").subscribe<Notifications>("state")();

/** "us" or "intl" (US international, with dead keys). */
export const keyboardLayout = () => (/intl|international/i.test(hyprland.keyboardLayout()) ? "intl" : "us");
export const toggleLayout = () => hyprland.switchLayout(keyboardLayout() === "intl" ? 0 : 1);

/** One AI quota window. `percent` < 0 = unknown; `resetsIn` in seconds, 0 = unknown. */
export interface Quota {
  percent: number;
  resetsIn: number;
}
export interface AiUsage {
  claude: Quota;
  codex: Quota;
}
interface RawQuota {
  percent: number;
  resetsAt: number | null;
}
export function ai(): AiUsage | null {
  const raw = use("ai").subscribe<{ claude: RawQuota; codex: RawQuota }>("state")();
  if (!raw) return null;
  const now = ctx.now("minute").getTime() / 1000;
  const quota = (q: RawQuota): Quota => ({ percent: q.percent, resetsIn: q.resetsAt ? Math.max(0, q.resetsAt - now) : 0 });
  return { claude: quota(raw.claude), codex: quota(raw.codex) };
}
export const refreshAi = () => use("ai").call("refresh");

export interface AgendaEvent {
  /** "2026-10-12" */
  date: string;
  /** "15:00", or "" for all day. */
  time: string;
  title: string;
}
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const eventsOn = (day: Date): AgendaEvent[] =>
  (use("agenda").subscribe<AgendaEvent[]>("events")() ?? []).filter((e) => e.date === iso(day));
export const agendaToday = () => eventsOn(ctx.now("minute")).length;
