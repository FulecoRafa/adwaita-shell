// Workspaces, windows and pinned apps.
// MOCK: fixed data until the `hyprland` and `apps` modules exist.

import { toggle, type Panel } from "./shell";

export const workspaceCount = 6;

const mockWorkspaces = signal<Workspace[]>([
  { id: 1, name: "1", monitor: "eDP-1", windows: 2, active: false, focused: false },
  { id: 2, name: "2", monitor: "eDP-1", windows: 1, active: false, focused: false },
  { id: 3, name: "3", monitor: "eDP-1", windows: 3, active: true, focused: true },
  { id: 4, name: "4", monitor: "eDP-1", windows: 1, active: false, focused: false },
]);

const mockClients = signal<Client[]>([
  { address: "0x1", class: "helium", title: "GitHub", workspace: 1, focused: false },
  { address: "0x2", class: "com.mitchellh.ghostty", title: "zsh", workspace: 3, focused: true },
  { address: "0x3", class: "discord", title: "Discord", workspace: 2, focused: false },
]);

export const workspaces: Signal<Workspace[]> = mockWorkspaces;
export const clients: Signal<Client[]> = mockClients;

export function switchTo(id: number) {
  mockWorkspaces.update((ws) => ws.map((w) => ({ ...w, active: w.id === id, focused: w.id === id })));
}

export function cycleWorkspace(delta: number) {
  const current = workspaces().find((w) => w.focused)?.id ?? 1;
  switchTo(Math.min(workspaceCount, Math.max(1, current + delta)));
}

export function focusWindow(address: string) {
  mockClients.update((cs) => cs.map((c) => ({ ...c, focused: c.address === address })));
}

/** A pinned app: a command to launch, or a panel to toggle. */
export interface Pinned {
  key: string;
  icon: string;
  color: string;
  /** Matches the class of the app's windows. */
  match?: RegExp;
  command?: string[];
  panel?: Panel;
}

export const pinned: Pinned[] = [
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

export const windowsOf = (p: Pinned) => (p.match ? clients().filter((c) => p.match!.test(c.class)) : []);

/** Open windows of apps that are not pinned, one entry per class. */
export function extraApps(): string[] {
  const seen = new Set<string>();
  for (const c of clients()) {
    if (!c.class || seen.has(c.class)) continue;
    if (pinned.some((p) => p.match?.test(c.class))) continue;
    seen.add(c.class);
  }
  return [...seen];
}

/** Cycle through the app's windows, or launch it. */
export function activate(p: Pinned) {
  if (p.panel) return toggle(p.panel);
  const windows = windowsOf(p);
  if (windows.length === 0) return launch(p.command ?? []);
  const current = windows.findIndex((w) => w.focused);
  focusWindow(windows[(current + 1) % windows.length].address);
}

export function activateClass(cls: string) {
  const windows = clients().filter((c) => c.class === cls);
  if (windows.length === 0) return;
  const current = windows.findIndex((w) => w.focused);
  focusWindow(windows[(current + 1) % windows.length].address);
}

export function launch(command: string[] | string) {
  log("launch", JSON.stringify(command));
}

/** Theme icon for a window class; "" when there is none. */
export function appIcon(cls: string): string {
  return cls === "discord" ? "icon:discord" : "";
}
