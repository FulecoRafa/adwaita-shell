// Workspaces, windows and pinned apps, from the hyprland and apps modules.

import * as installed from "@kit/data/apps";
import { toggle, type Panel } from "./shell";

export const workspaceCount = 6;

export const workspaces = (): Workspace[] => hyprland.workspaces();
export const clients = (): Client[] => hyprland.clients();

export const switchTo = (id: number) => hyprland.dispatch(`workspace ${id}`);
/** -1: previous workspace (wheel up), 1: next. */
export const cycleWorkspace = (delta: number) => hyprland.dispatch(`workspace r${delta < 0 ? "-" : "+"}1`);
export const focusWindow = (address: string) => hyprland.dispatch(`focuswindow address:${address}`);
export const launch = installed.launch;

/** A pinned app: a command to launch, or a panel to toggle. */
export interface Pinned {
  key: string;
  icon: string;
  /** Theme icon of the app, when it has a desktop entry. */
  image?: string;
  color: string;
  /** Matches the class of the app's windows. */
  match?: RegExp;
  command?: string[] | string;
  panel?: Panel;
}

const builtin: Pinned[] = [
  { key: "browser", icon: "compass", color: "$cyan", match: /helium|chrom|firefox|zen/i, command: ["helium"] },
  { key: "terminal", icon: "terminal-window", color: "$green", match: /ghostty|kitty|foot|alacritty|^fuleco\.terminal$/i, command: ["ghostty"] },
  { key: "files", icon: "folder", color: "$yellow", match: /yazi|nautilus|thunar|dolphin/i, command: ["ghostty", "--class=fuleco.yazi", "-e", "yazi"] },
  { key: "launcher", icon: "magnifying-glass", color: "$yellow", panel: "launcher" },
  { key: "drawer", icon: "squares-four", color: "$purple", panel: "drawer" },
];

/** Icons for terminal apps that have no desktop entry. */
export const tuiIcons: Record<string, string> = {
  wifitui: "wifi-high", btop: "gauge", yazi: "folder", calcure: "calendar-dots", wiremix: "faders", bluetui: "bluetooth",
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Built-in pins with the user's in the middle, like the reference bar. */
export function pinned(): Pinned[] {
  const user: Pinned[] = installed.pins().map((id): Pinned => {
    if (id.startsWith("tui:")) {
      const name = id.slice(4);
      return { key: id, icon: tuiIcons[name] ?? "terminal-window", color: "$green", match: new RegExp(`^fuleco\\.${escape(name)}$`), command: ["ghostty", `--class=fuleco.${name}`, "-e", name] };
    }
    const base = id.replace(/\.desktop$/, "");
    return { key: id, icon: "app-window", image: installed.iconFor(base), color: "$cyan", match: new RegExp(`^${escape(base)}$`, "i"), command: base };
  });
  return [...builtin.slice(0, 3), ...user, ...builtin.slice(3)];
}

export const windowsOf = (p: Pinned) => (p.match ? clients().filter((c) => p.match!.test(c.class)) : []);

/** Open windows of apps that are not pinned, one entry per class. */
export function extraApps(): string[] {
  const all = pinned();
  const seen = new Set<string>();
  for (const c of clients()) {
    if (!c.class || seen.has(c.class)) continue;
    if (all.some((p) => p.match?.test(c.class))) continue;
    seen.add(c.class);
  }
  return [...seen];
}

function cycle(windows: Client[]) {
  if (windows.length === 0) return;
  const current = windows.findIndex((w) => w.focused);
  focusWindow(windows[(current + 1) % windows.length].address);
}

/** Toggle its panel, cycle through its windows, or launch it. */
export function activate(p: Pinned) {
  if (p.panel) return toggle(p.panel);
  const windows = windowsOf(p);
  if (windows.length === 0) return p.command && launch(p.command);
  cycle(windows);
}

export const activateClass = (cls: string) => cycle(clients().filter((c) => c.class === cls));

/** Theme icon for a window class; "" when there is none. */
export const appIcon = installed.iconFor;
