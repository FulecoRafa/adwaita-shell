import { glyphs } from "../lib/glyphs";
import { map } from "../lib/bind";

/** A Phosphor (fill) glyph by name, e.g. "wifi-high". */
export function Icon(p: { name: Bind<string>; size?: Bind<number>; color?: Bind<Color> }) {
  return (
    <Label
      text={map(p.name, (n) => glyphs[n] ?? "")}
      font="Phosphor-Fill"
      size={p.size ?? 18}
      color={p.color ?? "$text"}
    />
  );
}
