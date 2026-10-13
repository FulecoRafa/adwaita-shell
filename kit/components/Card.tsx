import { Icon } from "./Icon";
import { read } from "../lib/bind";

/** The three footprints a card can take in a two-column grid. */
export type CardSize = "small" | "wide" | "large";

export const sizeNames: Record<CardSize, string> = { small: "1×1", wide: "2×1", large: "2×2" };

/** Pixel size of a card for a grid of `width` with `gap` between cells. */
export function cardBox(size: CardSize, width: number, gap: number, rowUnit: number) {
  const cell = (width - gap) / 2;
  return {
    width: size === "small" ? cell : width,
    height: size === "large" ? 2 * rowUnit + gap : rowUnit,
  };
}

export interface CardProps {
  size: CardSize;
  width: number;
  height: number;
  /** Caption over the body; without one the body starts at the top (outside edit mode). */
  title?: Bind<string>;
  /** Yellow link on the right of the title ("btop ↗"). */
  action?: Bind<string>;
  actionColor?: Bind<Color>;
  onAction?: On;
  gap?: number;
  /** Edit mode: the body is replaced by size and remove buttons. */
  editing?: Bind<boolean>;
  sizes?: CardSize[];
  onCycleSize?: () => void;
  onRemove?: () => void;
  children?: Child;
}

function EditButton(p: { icon?: string; label?: string; onClick: On }) {
  return (
    <Box height={24} minWidth={24} padding={[0, p.label ? 9 : 0]} radius={12} bg="$raisedAlt" hoverBg="$track" align="center" justify="center" onClick={p.onClick}>
      {p.icon ? <Icon name={p.icon} size={12} color="$text" /> : <Label text={p.label ?? ""} size={11} color="$text" />}
    </Box>
  );
}

function Header(p: CardProps & { editing: () => boolean }) {
  const editing = p.editing;
  return (
    <Box gap={6} align="center">
      <Box grow><Label text={p.title ?? ""} size={11} color="$textFaint" maxWidth={p.width - 120} /></Box>
      {() =>
        editing()
          ? <Box gap={6}>
              {(p.sizes?.length ?? 0) > 1 ? <EditButton label={sizeNames[p.size]} onClick={() => p.onCycleSize?.()} /> : null}
              <EditButton icon="x" onClick={() => p.onRemove?.()} />
            </Box>
          : p.action
            ? <Box onClick={p.onAction} hoverOpacity={0.8}><Label text={p.action} size={11} color={p.actionColor ?? "$yellow"} /></Box>
            : null}
    </Box>
  );
}

/** A drawer card: caption, optional action link and the body below. */
export function Card(p: CardProps) {
  const editing = () => read(p.editing ?? false);
  return (
    <Box direction="column" width={p.width} height={p.height} radius={22} bg="$raised" border={() => (editing() ? "$dim" : "#00000000")} padding={16} gap={p.gap ?? 10}>
      {p.title !== undefined
        ? <Header {...p} editing={editing} />
        : () => (editing() ? <Header {...p} editing={editing} /> : null)}
      <Box direction="column" grow gap={p.gap ?? 10} opacity={() => (editing() ? 0.4 : 1)}>
        {p.children}
      </Box>
    </Box>
  );
}

/** Thin horizontal level bar (battery, memory, rain chance). */
export function Level(p: { value: Bind<number>; color?: Bind<Color>; height?: number }) {
  const height = p.height ?? 6;
  return (
    <Box width="100%" height={height} radius={height / 2} bg="$track">
      <Box
        height={height}
        radius={height / 2}
        bg={p.color ?? "$cyan"}
        width={() => `${Math.round(100 * Math.max(0, Math.min(1, read(p.value))))}%` as `${number}%`}
      />
    </Box>
  );
}
