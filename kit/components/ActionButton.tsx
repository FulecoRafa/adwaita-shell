import { map } from "../lib/bind";

export interface ActionButtonProps {
  label: Bind<string>;
  accent?: Color;
  /** Filled with the accent ("conectar"); quiet otherwise ("esquecer"). */
  primary?: boolean;
  onClick?: On;
}

/** A small rounded text button for row actions. */
export function ActionButton(p: ActionButtonProps) {
  const accent = p.accent ?? "$text";
  return (
    <Box
      height={28}
      padding={[0, 12]}
      radius={12}
      align="center"
      bg={p.primary ? accent : "$raisedAlt"}
      hoverBg={p.primary ? undefined : "$track"}
      hoverOpacity={p.primary ? 0.9 : undefined}
      onClick={p.onClick}
    >
      <Label text={p.label} size={11} color={p.primary ? "$onAccent" : accent} />
    </Box>
  );
}
