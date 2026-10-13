import { read } from "../lib/bind";

export interface GaugeProps {
  /** Percent, 0..100. */
  value: Bind<number>;
  size?: number;
  thickness?: number;
  /** Show the rounded number inside. */
  label?: boolean;
  onClick?: On;
}

/** Circular percent meter: cyan, orange from 60 %, red from 85 %. */
export function Gauge(p: GaugeProps) {
  const size = p.size ?? 32;
  const color = () => {
    const v = read(p.value);
    return v >= 85 ? "$red" : v >= 60 ? "$orange" : "$cyan";
  };
  return (
    <Box hoverOpacity={0.85} onClick={p.onClick}>
      <Ring
        size={size}
        thickness={p.thickness ?? 3.5}
        value={() => Math.min(100, Math.max(0, read(p.value))) / 100}
        color={color}
        track="$surfaceBorder"
      >
        {p.label === false ? null : <Label text={() => String(Math.round(read(p.value)))} size={Math.round(size * 0.31)} color="$text" />}
      </Ring>
    </Box>
  );
}
