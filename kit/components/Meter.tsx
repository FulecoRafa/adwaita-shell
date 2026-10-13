import { Icon } from "./Icon";
import { map } from "../lib/bind";

export interface MeterProps {
  /** 0..1 */
  value: Bind<number>;
  accent?: Bind<Color>;
  track?: Color;
  thickness?: number;
  /** Set by click, drag or wheel; a plain level without it. */
  onChange?: (value: number) => void;
}

/** A level bar that fills its row (volume, brightness, a quota). */
export function Meter(p: MeterProps) {
  return (
    <Box grow align="center">
      <Slider
        value={p.value}
        color={p.accent ?? "$yellow"}
        track={p.track ?? "$raised"}
        thickness={p.thickness ?? 8}
        onChange={p.onChange ? (e) => p.onChange!(e.value) : undefined}
      />
    </Box>
  );
}

export interface LevelRowProps extends MeterProps {
  icon: Bind<string>;
  iconColor?: Bind<Color>;
  onIcon?: On;
}

/** Icon · meter · "62%": the volume, microphone and brightness rows. */
export function LevelRow(p: LevelRowProps) {
  return (
    <Box gap={10} align="center">
      <Box onClick={p.onIcon} hoverOpacity={p.onIcon ? 0.8 : undefined}>
        <Icon name={p.icon} size={18} color={p.iconColor ?? "$text"} />
      </Box>
      <Meter {...p} />
      <Box width={30} justify="end">
        <Label text={map(p.value, (v) => `${Math.round(v * 100)}%`)} size={11} color="$textMuted" />
      </Box>
    </Box>
  );
}
