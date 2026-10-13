import * as tray from "../data/tray";
import { Menu } from "./Menu";
import { Divider } from "./Divider";

/**
 * The app tray (StatusNotifierItem: Discord, Steam, nm-applet...). Self
 * contained: it reads the items itself and owns its menu.
 *
 * Left click activates (or opens the menu of menu-only items), middle click
 * is the secondary action, right click opens the menu, the wheel scrolls.
 * Hidden, divider included, while no app publishes an icon.
 */
export function Tray(p: { iconSize?: number; gap?: number; divider?: boolean }) {
  const size = p.iconSize ?? 16;
  const open = signal<string>("");
  const toggleMenu = (id: string) => open.update((o) => (o === id ? "" : id));

  const slot = (item: TrayItem) => (
    <Box
      key={item.id}
      width={size + 2}
      height={22}
      align="center"
      justify="center"
      hoverOpacity={0.75}
      tooltip={item.tooltip || item.title}
      onClick={() => (item.onlyMenu ? toggleMenu(item.id) : tray.activate(item.id))}
      onMiddleClick={() => tray.secondaryActivate(item.id)}
      onRightClick={() => item.hasMenu && toggleMenu(item.id)}
      onScroll={(e) => tray.scroll(item.id, e.delta)}
    >
      <Image src={item.icon} size={size} />
      {item.hasMenu
        ? (
          <Popup open={() => open() === item.id} onDismiss={() => open.set("")} width={240}>
            <Menu
              title={item.title || item.id}
              entries={() => tray.menu(item.id)()}
              onTrigger={(e) => {
                tray.trigger(item.id, e.id);
                open.set("");
              }}
            />
          </Popup>
        )
        : null}
    </Box>
  );

  return () => {
    const items = tray.items();
    if (items.length === 0) return null;
    return (
      <Box gap={p.gap ?? 10} align="center">
        {items.map(slot)}
        {p.divider === false ? null : <Divider />}
      </Box>
    );
  };
}
