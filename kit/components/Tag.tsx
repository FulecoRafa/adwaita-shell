import { Icon } from "./Icon";
import { map } from "../lib/bind";

export interface TagProps {
  text: Bind<string>;
  icon?: string;
  /** Filled with the accent; outlined otherwise. */
  filled?: Bind<boolean>;
  accent?: Color;
  /** Background tint when not filled ("$purpleTint"); outline when absent. */
  tint?: Color;
  height?: number;
  size?: number;
  onClick?: On;
}

/**
 * Small labelled tag: the keyboard layout ("us"/"intl") or the agenda
 * counter. Filled, tinted or outlined.
 */
export function Tag(p: TagProps) {
  const filled = p.filled ?? false;
  const accent = p.accent ?? "$cyan";
  const height = p.height ?? 18;
  const size = p.size ?? 10;
  const fg = map(filled, (f) => (f ? "$onAccent" : p.tint ? accent : "$textMuted"));
  return (
    <Box
      height={height}
      padding={[0, p.icon ? 9 : 6]}
      gap={4}
      align="center"
      radius={p.tint ? height / 2 : 5}
      bg={map(filled, (f) => (f ? accent : p.tint ?? "#00000000"))}
      border={map(filled, (f) => (f ? accent : p.tint ?? "$surfaceBorder"))}
      hoverOpacity={0.8}
      onClick={p.onClick}
    >
      {p.icon ? <Icon name={p.icon} size={size + 2} color={fg} /> : null}
      <Label text={p.text} size={size} weight={p.tint ? "normal" : "semibold"} color={fg} />
    </Box>
  );
}
