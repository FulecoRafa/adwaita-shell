import { Icon } from "./Icon";
import { Toggle } from "./Toggle";
import { map } from "../lib/bind";

export interface ToggleCardProps {
  icon: Bind<string>;
  label: string;
  /** Second line: what the state means ("desligado", "2 conectados"). */
  detail: Bind<string>;
  checked: Bind<boolean>;
  accent?: Color;
  onToggle?: (checked: boolean) => void;
}

/** A raised card with an icon, a label, a switch and a line of detail (wi-fi, bluetooth, caffeine). */
export function ToggleCard(p: ToggleCardProps) {
  const accent = p.accent ?? "$cyan";
  return (
    <Box grow direction="column" gap={8} padding={14} radius={18} bg="$raised">
      <Box gap={8} align="center">
        <Icon name={p.icon} size={18} color={map(p.checked, (c) => (c ? accent : "$textFaint"))} />
        <Box grow><Label text={p.label} size={12} color="$text" /></Box>
        <Toggle checked={p.checked} accent={accent} onToggle={p.onToggle} />
      </Box>
      <Label text={p.detail} size={12} color="$textMuted" maxWidth={150} />
    </Box>
  );
}
