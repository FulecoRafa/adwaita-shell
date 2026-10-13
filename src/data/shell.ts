// Which panel is open. One at a time: opening another closes the previous,
// like the reference shell. Shared by every surface.

export type Panel = "" | "control" | "power" | "notifications" | "drawer" | "ai" | "launcher";

export const panel = shared<Panel>("panel", "");
export const controlTab = shared<string>("controlTab", "rede");

export function toggle(name: Panel) {
  panel.update((p) => (p === name ? "" : name));
}

export function close() {
  panel.set("");
}

export function openControl(tab: string) {
  controlTab.set(tab);
  panel.set("control");
}
