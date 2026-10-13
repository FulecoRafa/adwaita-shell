// Data for the drawer cards.
// MOCK: fixed values until the media/weather plugins and the store exist.

import type { CardSize } from "../components/Card";

export interface Player {
  identity: string;
  title: string;
  artist: string;
  album: string;
  /** Image source of the cover, "" if none. */
  art: string;
  playing: boolean;
  /** Seconds. */
  position: number;
  length: number;
}
const mockPlayer = signal<Player | null>({
  identity: "helium", title: "Clair de Lune", artist: "Claude Debussy", album: "Suite bergamasque",
  art: "", playing: true, position: 94, length: 312,
});
export const player = (): Player | null => mockPlayer();
export const playPause = () => mockPlayer.update((p) => (p ? { ...p, playing: !p.playing } : p));
export const next = () => log("media next");
export const previous = () => log("media previous");

export interface Hour {
  hour: string;
  icon: string;
  color: string;
  temperature: number;
  /** Chance of rain, 0..1. */
  rain: number;
}
export interface Weather {
  place: string;
  temperature: number;
  feelsLike: number;
  icon: string;
  color: string;
  hours: Hour[];
}
export const weather = (): Weather | null => ({
  place: "são paulo", temperature: 24, feelsLike: 25, icon: "cloud-sun", color: "$yellow",
  hours: [
    { hour: "22h", icon: "cloud-moon", color: "$purple", temperature: 22, rain: 0.1 },
    { hour: "23h", icon: "cloud", color: "$textMuted", temperature: 21, rain: 0.3 },
    { hour: "00h", icon: "cloud-rain", color: "$cyan", temperature: 20, rain: 0.7 },
  ],
});

export type Profile = "power-saver" | "balanced" | "performance";
const mockProfile = signal<Profile>("balanced");
export const powerProfile = () => mockProfile();
export const setPowerProfile = (p: Profile) => mockProfile.set(p);

export interface Event {
  title: string;
  /** "14:00", or "" for all-day. */
  time: string;
  color: string;
}
export const eventsOn = (day: Date): Event[] =>
  day.getDate() === new Date().getDate()
    ? [{ title: "daily", time: "10:00", color: "$cyan" }, { title: "dentista", time: "16:30", color: "$purple" }]
    : [];

export interface Timer {
  id: number;
  label: string;
  /** Epoch ms when it rings. */
  endsAt: number;
}
export const timers = signal<Timer[]>([{ id: 1, label: "chá", endsAt: Date.now() + 4 * 60_000 }]);

export interface Task {
  id: number;
  text: string;
  done: boolean;
}
export const tasks = signal<Task[]>([
  { id: 1, text: "revisar o PR do tessela", done: false },
  { id: 2, text: "comprar café", done: true },
]);
export const draft = signal("");

export interface Placed {
  key: string;
  size: CardSize;
}
/** Saved card layout; `null` until the first edit (then the default applies). */
export const layout = signal<Placed[] | null>(null);
