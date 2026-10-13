import { Icon } from "./Icon";
import { read } from "../lib/bind";

export interface MenuProps {
  title: Bind<string>;
  entries: Signal<MenuEntry[] | null>;
  /** A leaf entry was clicked; the menu does not close itself. */
  onTrigger: (entry: MenuEntry) => void;
}

/** dbusmenu-style labels mark the mnemonic with "_" ("_Sair"); "__" is a literal "_". */
const plain = (label: string) => label.replace(/__/g, "\u0000").replace(/_/g, "").replace(/\u0000/g, "_");

/**
 * A context menu: checkmarks, radios, icons, separators and submenus.
 * Submenus stack in place with a "back" caret in the header.
 */
export function Menu(p: MenuProps) {
  const stack = signal<MenuEntry[]>([]);
  const current = () => {
    const s = stack();
    return s.length > 0 ? s[s.length - 1].children : (p.entries() ?? []);
  };

  const header = (
    <Box gap={6} align="center" padding={[2, 8, 4, 8]}>
      {() =>
        stack().length > 0
          ? <Box onClick={() => stack.update((s) => s.slice(0, -1))} hoverOpacity={0.7}>
              <Icon name="caret-left" size={12} color="$textMuted" />
            </Box>
          : null}
      <Label
        text={() => {
          const s = stack();
          const t = s.length > 0 ? plain(s[s.length - 1].label) : read(p.title);
          return t.toLowerCase();
        }}
        size={11}
        color="$textFaint"
        maxWidth={200}
      />
    </Box>
  );

  const toggleIcon = (e: MenuEntry) =>
    e.toggle === "radio" ? (e.checked ? "radio-button" : "circle") : e.checked ? "check-square" : "square";

  const row = (e: MenuEntry) =>
    e.separator
      ? <Box key={e.id} height={9} padding={[4, 8]}><Box grow height={1} bg="$divider" /></Box>
      : (
        <Box
          key={e.id}
          height={30}
          padding={[0, 10]}
          gap={8}
          align="center"
          radius={10}
          hoverBg={e.enabled ? "$raised" : undefined}
          onClick={e.enabled
            ? () => (e.children.length > 0 ? stack.update((s) => [...s, e]) : p.onTrigger(e))
            : undefined}
        >
          {e.toggle ? <Icon name={toggleIcon(e)} size={13} color={e.checked ? "$yellow" : "$textGhost"} /> : null}
          {e.icon ? <Image src={e.icon} size={14} /> : null}
          <Box grow><Label text={plain(e.label)} size={12} color={e.enabled ? "$text" : "$textGhost"} maxWidth={170} /></Box>
          {e.children.length > 0 ? <Icon name="caret-right" size={11} color="$textFaint" /> : null}
        </Box>
      );

  return (
    <Box direction="column" gap={2} padding={8} radius={16} bg="$surface" border="$surfaceBorder">
      {header}
      {() => current().map(row)}
    </Box>
  );
}
