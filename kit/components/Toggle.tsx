import { map, read } from "../lib/bind";

export interface ToggleProps {
  checked: Bind<boolean>;
  accent?: Color;
  /** Called with the new state. */
  onToggle?: (checked: boolean) => void;
}

/** The 30×17 switch: accent track and a dark knob on the right when on. */
export function Toggle(p: ToggleProps) {
  const accent = p.accent ?? "$cyan";
  return (
    <Box
      width={30}
      height={17}
      radius={9}
      padding={2}
      align="center"
      justify={map(p.checked, (c) => (c ? "end" : "start"))}
      bg={map(p.checked, (c) => (c ? accent : "$dimmer"))}
      hoverOpacity={0.85}
      onClick={() => p.onToggle?.(!read(p.checked))}
    >
      <Box width={13} height={13} radius={7} bg={map(p.checked, (c) => (c ? "$onAccent" : "$textMuted"))} />
    </Box>
  );
}
