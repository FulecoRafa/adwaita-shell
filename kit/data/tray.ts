// StatusNotifierItem tray, from the tray module.

export const items = (): TrayItem[] => tray.items();
export const menu = (id: string): Signal<MenuEntry[] | null> => tray.menu(id);
export const activate = (id: string) => tray.activate(id);
export const secondaryActivate = (id: string) => tray.secondaryActivate(id);
export const scroll = (id: string, delta: number) => tray.scroll(id, delta);
export const trigger = (id: string, entry: number) => tray.trigger(id, entry);
