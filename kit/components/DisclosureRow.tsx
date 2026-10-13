import { Icon } from "./Icon";
import { map, read } from "../lib/bind";

export interface DisclosureRowProps {
  icon: Bind<string>;
  iconColor?: Bind<Color>;
  label: Bind<string>;
  /** A small lock after the label (secured networks). */
  secure?: Bind<boolean>;
  /** Highlighted (the connected network or device). */
  strong?: Bind<boolean>;
  trailing?: Bind<string>;
  trailingColor?: Bind<Color>;
  open: Bind<boolean>;
  onToggle?: On;
  /** Shown under the header while open. */
  children?: Child;
}

/** A list row that opens in place: a 36 px header with a caret, details below. */
export function DisclosureRow(p: DisclosureRowProps) {
  const strong = () => read(p.open) || read(p.strong ?? false);
  return (
    <Box direction="column" radius={14} bg={() => (strong() ? "$raised" : "#00000000")} hoverBg={() => (strong() ? "$raised" : "$raisedAlt")}>
      <Box height={36} padding={[0, 12]} gap={10} align="center" onClick={p.onToggle}>
        <Icon name={p.icon} size={16} color={p.iconColor ?? "$textMuted"} />
        <Label text={p.label} size={12} color={() => (strong() ? "$text" : "$textMuted")} maxWidth={200} />
        {() => (read(p.secure ?? false) ? <Icon name="lock-simple" size={12} color="$textGhost" /> : null)}
        <Box grow />
        <Label text={p.trailing ?? ""} size={11} color={p.trailingColor ?? "$textFaint"} />
        <Icon name={map(p.open, (o) => (o ? "caret-up" : "caret-down"))} size={12} color="$textGhost" />
      </Box>
      {() => (read(p.open) ? <Box direction="column" gap={10} padding={[0, 12, 12, 12]}>{p.children}</Box> : null)}
    </Box>
  );
}
