import { Icon } from "./Icon";
import { map } from "../lib/bind";

export interface ListRowProps {
  title: Bind<string>;
  subtitle?: Bind<string>;
  /** Image source (an app icon); wins over `icon`. */
  image?: string;
  /** Phosphor glyph when there is no image. */
  icon?: string;
  iconColor?: Color;
  /** Text on the right ("↵", a shortcut, a count). */
  trailing?: Bind<string>;
  /** Highlighted, like the keyboard selection of a list. */
  selected?: Bind<boolean>;
  height?: number;
  onClick?: On;
  onRightClick?: On;
}

/** One row of a list: icon, title over subtitle, something on the right. */
export function ListRow(p: ListRowProps) {
  const height = p.height ?? 44;
  const iconSize = Math.round(height * 0.55);
  return (
    <Box
      height={height}
      padding={[0, 12]}
      gap={12}
      align="center"
      radius={12}
      bg={map(p.selected ?? false, (s) => (s ? "$raised" : "#00000000"))}
      hoverBg="$raised"
      onClick={p.onClick}
      onRightClick={p.onRightClick}
    >
      {p.image
        ? <Image src={p.image} size={iconSize} />
        : <Icon name={p.icon ?? "app-window"} size={iconSize} color={p.iconColor ?? "$textMuted"} />}
      <Box direction="column" gap={1} grow>
        <Label text={p.title} size={13} color="$textBright" maxWidth={360} />
        {p.subtitle ? <Label text={p.subtitle} size={11} color="$textFaint" maxWidth={360} /> : null}
      </Box>
      {p.trailing ? <Label text={p.trailing} size={11} color="$textFaint" /> : null}
    </Box>
  );
}
