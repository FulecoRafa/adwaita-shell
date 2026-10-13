import { Icon } from "./Icon";
import { duration, usageColor } from "../lib/format";
import { map } from "../lib/bind";

export interface AiChipProps {
  usage: () => { claude: { percent: number; resetsIn: number }; codex: { percent: number; resetsIn: number } } | null;
  active?: Bind<boolean>;
  onClick?: On;
}

const pct = (v: number) => (v < 0 ? "–" : `${Math.round(v)}%`);
const tint = (v: number) => (v < 0 ? "$textFaint" : usageColor(v));

/** "cc 17% | cx –": AI quota use, red border from 90 %. */
export function AiChip(p: AiChipProps) {
  const claude = () => p.usage()?.claude.percent ?? -1;
  const codex = () => p.usage()?.codex.percent ?? -1;
  const remaining = () => {
    const u = p.usage();
    return duration(u?.claude.resetsIn || u?.codex.resetsIn || 0);
  };
  const part = (name: string, value: () => number) => (
    <Box gap={4} align="center">
      <Label text={name} size={12} color="$text" />
      <Label text={() => pct(value())} size={12} color={() => tint(value())} />
    </Box>
  );
  return (
    <Box
      height={26}
      padding={[0, 10]}
      gap={10}
      align="center"
      radius={13}
      bg={map(p.active ?? false, (a) => (a ? "$surfaceBorder" : "$raisedAlt"))}
      border={() => (Math.max(claude(), codex()) >= 90 ? "$red" : "$raisedAlt")}
      onClick={p.onClick}
    >
      <Icon name="gauge" size={14} color="$orange" />
      {part("cc", claude)}
      <Box width={1} height={13} bg="$dimmer" />
      {part("cx", codex)}
      {() => (remaining() ? <Label text={remaining} size={11} color="$textFaint" /> : null)}
    </Box>
  );
}
