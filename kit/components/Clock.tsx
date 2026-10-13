import { hm, hms, shortDate } from "../lib/format";
import { read } from "../lib/bind";

export interface ClockProps {
  now: () => Date;
  seconds?: Bind<boolean>;
  /** Show the date line under the time. */
  date?: boolean;
  size?: number;
  onClick?: On;
}

/** "21:39" over "seg 12 out". */
export function Clock(p: ClockProps) {
  const size = p.size ?? 13;
  const seconds = p.seconds ?? false;
  return (
    <Box direction="column" onClick={p.onClick} hoverOpacity={0.85}>
      <Label
        text={() => (read(seconds) ? hms(p.now()) : hm(p.now()))}
        size={size}
        color="$textBright"
      />
      {p.date === false ? null : <Label text={() => shortDate(p.now())} size={Math.round(size * 0.7)} color="$textFaint" />}
    </Box>
  );
}
