import { Icon } from "./Icon";
import { read } from "../lib/bind";

export interface StatusIconProps {
  icon: Bind<string>;
  tint?: Bind<Color>;
  /** Number in a red pill over the icon; hidden at 0. */
  badge?: Bind<number>;
  size?: number;
  onClick?: On;
  onScroll?: On<{ delta: 1 | -1 }>;
}

/** A status glyph in the bar (network, audio, bell...), optionally badged. */
export function StatusIcon(p: StatusIconProps) {
  const size = p.size ?? 17;
  return (
    <Box
      width={size}
      height={22}
      align="center"
      justify="center"
      hoverOpacity={0.8}
      onClick={p.onClick}
      onScroll={p.onScroll}
    >
      <Icon name={p.icon} size={size} color={p.tint ?? "$textMuted"} />
      {() => {
        const n = p.badge === undefined ? 0 : read(p.badge);
        if (n <= 0) return null;
        return (
          <Box place={{ top: -1, left: size - 9 }} height={14} minWidth={14} padding={[0, 3]} radius={8} bg="$red" align="center" justify="center">
            <Label text={n > 9 ? "9+" : String(n)} size={9} color="$onAccent" />
          </Box>
        );
      }}
    </Box>
  );
}
