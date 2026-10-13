import { Icon } from "./Icon";
import { map, read } from "../lib/bind";

export interface RoundButtonProps {
  icon: string;
  color: Color;
  /** Background at rest ("$raised", "$redTint"). */
  tint: Color;
  /** Filled with `color` (armed, waiting for a second click). */
  armed?: Bind<boolean>;
  /** Caption under the button: on hover, and while armed. */
  label?: Bind<string>;
  size?: number;
  onClick?: On;
}

/** A big square-ish icon button with a caption below (power actions). */
export function RoundButton(p: RoundButtonProps) {
  const size = p.size ?? 46;
  const armed = p.armed ?? false;
  return (
    <Box direction="column" align="center" width={size} tooltip={map(armed, (a) => (a ? "" : read(p.label ?? "")))}>
      <Box
        width={size}
        height={size}
        radius={16}
        align="center"
        justify="center"
        bg={map(armed, (a) => (a ? p.color : p.tint))}
        hoverOpacity={0.85}
        onClick={p.onClick}
      >
        <Icon name={p.icon} size={21} color={map(armed, (a) => (a ? "$onAccent" : p.color))} />
      </Box>
      {() => (read(armed) ? <Box place={{ top: size + 4 }}><Label text={p.label ?? ""} size={9} color={p.color} /></Box> : null)}
    </Box>
  );
}
