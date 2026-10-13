// Data for the drawer cards: plugins (media, weather, power) and values the
// shell keeps in its state file (timers, tasks, draft, layout).

import type { CardSize } from "../components/Card";
import { eventsOn as agenda } from "./status";

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
export const player = () => use("media").subscribe<Player>("player")();
export const playPause = () => use("media").call("play_pause");
export const next = () => use("media").call("next");
export const previous = () => use("media").call("previous");

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
export const weather = () => use("weather").subscribe<Weather>("state")();

export type Profile = "power-saver" | "balanced" | "performance";
export const powerProfile = () => use("power").subscribe<Profile>("profile")() ?? "";
export const setPowerProfile = (profile: Profile) => use("power").call("set", { profile });

export interface Event {
  title: string;
  /** "14:00", or "" for all-day. */
  time: string;
  color: string;
}
export const eventsOn = (day: Date): Event[] =>
  agenda(day).map((e) => ({ title: e.title, time: e.time, color: "$purple" }));

export interface Timer {
  id: number;
  label: string;
  /** Epoch ms when it rings. */
  endsAt: number;
}
export const timers = shared<Timer[]>("timers", [], { store: true });

export interface Task {
  id: number;
  text: string;
  done: boolean;
}
export const tasks = shared<Task[]>("tasks", [], { store: true });
export const draft = shared("draft", "", { store: true });

export interface Placed {
  key: string;
  size: CardSize;
}
/** Saved card layout; `null` until the first edit (then the default applies). */
export const layout = shared<Placed[] | null>("drawerLayout", null, { store: true });
