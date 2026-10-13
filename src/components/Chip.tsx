import { Icon } from "./Icon";
import { map } from "../lib/bind";

export interface ChipProps {
  label: Bind<string>;
  icon?: string;
  active?: Bind<boolean>;
  size?: number;
  onClick?: On;
}

/** Tab / scope pill: yellow when active. */
export function Chip(p: ChipProps) {
  const active = p.active ?? false;
  const size = p.size ?? 12;
  const fg = map(active, (a) => (a ? "$onAccent" : "$textMuted"));
  return (
    <Box
      direction="row"
      gap={6}
      align="center"
      padding={[7, 14]}
      radius={999}
      bg={map(active, (a) => (a ? "$yellow" : "$raised"))}
      hoverBg="$track"
      onClick={p.onClick}
    >
      {p.icon ? <Icon name={p.icon} size={size} color={fg} /> : null}
      <Label text={p.label} size={size} color={fg} />
    </Box>
  );
}
