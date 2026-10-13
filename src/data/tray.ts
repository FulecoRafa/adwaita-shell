// StatusNotifierItem tray.
// MOCK: a Discord-like item with nested menus until the `tray` module exists.

const discordMenu: MenuEntry[] = [
  { id: 1, label: "_Abrir o Discord", enabled: true, separator: false, toggle: null, checked: false, icon: "", children: [] },
  { id: 2, label: "", enabled: true, separator: true, toggle: null, checked: false, icon: "", children: [] },
  {
    id: 3, label: "Status", enabled: true, separator: false, toggle: null, checked: false, icon: "", children: [
      { id: 31, label: "Disponível", enabled: true, separator: false, toggle: "radio", checked: true, icon: "", children: [] },
      { id: 32, label: "Ausente", enabled: true, separator: false, toggle: "radio", checked: false, icon: "", children: [] },
      { id: 33, label: "Não perturbe", enabled: true, separator: false, toggle: "radio", checked: false, icon: "", children: [] },
    ],
  },
  { id: 4, label: "Silenciar", enabled: true, separator: false, toggle: "checkmark", checked: false, icon: "", children: [] },
  { id: 5, label: "Ensurdecer", enabled: false, separator: false, toggle: "checkmark", checked: false, icon: "", children: [] },
  { id: 6, label: "", enabled: true, separator: true, toggle: null, checked: false, icon: "", children: [] },
  { id: 7, label: "Sair do Discord", enabled: true, separator: false, toggle: null, checked: false, icon: "", children: [] },
];

export const items = (): TrayItem[] => [
  { id: "discord", title: "Discord", tooltip: "Discord", status: "active", icon: "icon:discord", onlyMenu: false, hasMenu: true },
];

const mockMenu = signal<MenuEntry[] | null>(discordMenu);
export const menu = (_id: string): Signal<MenuEntry[] | null> => mockMenu;
export const activate = (id: string) => log("tray activate", id);
export const secondaryActivate = (id: string) => log("tray secondary", id);
export const scroll = (id: string, delta: number) => log("tray scroll", id, delta);
export const trigger = (id: string, entry: number) => log("tray trigger", id, entry);
