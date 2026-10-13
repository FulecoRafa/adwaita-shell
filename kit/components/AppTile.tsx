import { Icon } from "./Icon";
import { map, read } from "../lib/bind";

export interface AppTileProps {
  /** Phosphor glyph, used when there is no image. */
  icon?: Bind<string>;
  /** Image source (theme icon of the app); wins over `icon`. */
  image?: Bind<string>;
  accent?: Color;
  active?: Bind<boolean>;
  running?: Bind<boolean>;
  /** Tile edge in px (34 in the bar; bigger in a launcher grid). */
  size?: number;
  tooltip?: Bind<string>;
  /** A name under the tile (launcher grids); none in the bar. */
  label?: Bind<string>;
  onClick?: On;
  onRightClick?: On;
}

/** An app button: icon, hover/active background and a "running" dot. */
export function AppTile(p: AppTileProps) {
  const size = p.size ?? 34;
  const glyph = Math.round(size * 0.53);
  const accent = p.accent ?? "$cyan";
  const active = p.active ?? false;
  const image = p.image ?? "";
  const tile = (
    <Box
      width={size}
      height={size}
      radius={Math.round(size * 0.35)}
      align="center"
      justify="center"
      bg={map(active, (a) => (a ? "$surfaceBorder" : "#00000000"))}
      hoverBg="$hover"
      tooltip={p.tooltip}
      onClick={p.onClick}
      onRightClick={p.onRightClick}
    >
      {() =>
        read(image) !== ""
          ? <Image src={image} size={glyph} opacity={map(active, (a) => (a ? 1 : 0.75))} />
          : <Icon name={p.icon ?? "app-window"} size={glyph} color={map(active, (a) => (a ? accent : "$textMuted"))} />}
      <Box
        place={{ bottom: 2, left: (size - 4) / 2 }}
        width={4}
        height={4}
        radius={3}
        bg={() => {
          if (!read(p.running ?? false)) return "#00000000";
          return read(active) ? accent : "$dim";
        }}
      />
    </Box>
  );
  if (p.label === undefined) return tile;
  return (
    <Box direction="column" align="center" gap={6} width={Math.round(size * 2.2)}>
      {tile}
      <Label text={p.label} size={11} color="$text" maxWidth={Math.round(size * 2.2)} />
    </Box>
  );
}
