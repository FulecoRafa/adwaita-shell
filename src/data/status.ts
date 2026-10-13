// System status shown in the bar: CPU, battery, network, audio,
// notifications, keyboard layout and AI usage.
// MOCK: values move on a timer until `system`, `hyprland` and the plugins exist.

const tick = signal(0);
every(2000, () => tick.update((n) => n + 1));

export const cpu = () => 20 + ((tick() * 37) % 70);
export const cpuHistory = () => Array.from({ length: 30 }, (_, i) => 20 + (((tick() + i) * 37) % 70));

export const memory = () => ({ percent: 46, usedGiB: 7.2, totalGiB: 15.5 });
export const disk = () => ({ percent: 63, usedGiB: 290, totalGiB: 460 });
export const temperature = () => 52;

export const battery = (): Battery | null => ({ percent: 87, charging: true, timeLeft: 2400, watts: 12.4 });

export interface Net {
  online: boolean;
  wired: boolean;
  wifiEnabled: boolean;
  /** 0..1 */
  strength: number;
  ssid: string;
  bluetooth: { present: boolean; enabled: boolean; connected: string[] };
}
export const net = (): Net | null => ({
  online: true, wired: false, wifiEnabled: true, strength: 0.8, ssid: "casa",
  bluetooth: { present: true, enabled: true, connected: [] },
});

export interface Audio {
  volume: number;
  muted: boolean;
}
const mockAudio = signal<Audio>({ volume: 0.5, muted: false });
export const audio = (): Audio | null => mockAudio();
export const changeVolume = (delta: number) =>
  mockAudio.update((a) => ({ ...a, volume: Math.min(1, Math.max(0, a.volume + delta)) }));

export interface Notifications {
  count: number;
  dnd: boolean;
}
export const notifications = (): Notifications | null => ({ count: 4, dnd: false });

const mockLayout = signal("us");
export const keyboardLayout = () => (/intl|international/i.test(mockLayout()) ? "intl" : "us");
export const toggleLayout = () => mockLayout.update((l) => (l === "us" ? "intl" : "us"));

/** One AI quota window. `percent` < 0 = unknown. */
export interface Quota {
  percent: number;
  resetsIn: number;
}
export interface AiUsage {
  claude: Quota;
  codex: Quota;
}
export const ai = (): AiUsage | null => ({ claude: { percent: 17, resetsIn: 3 * 3600 }, codex: { percent: -1, resetsIn: 0 } });

/** Events today in the agenda. */
export const agendaToday = () => 2;
