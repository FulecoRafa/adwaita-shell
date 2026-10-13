import { Card, Level, type CardProps } from "../Card";
import { Icon } from "../Icon";

export interface WeatherData {
  place: string;
  temperature: number;
  feelsLike: number;
  icon: string;
  color: string;
  hours: { hour: string; icon: string; color: string; temperature: number; rain: number }[];
}

/** Now and the next hours: stacked when small, side by side when wide. */
export function WeatherCard(p: Omit<CardProps, "title" | "children"> & { weather: () => WeatherData | null; onOpen?: On }) {
  const compact = p.size === "small";
  const now = (
    <Box gap={12} align="center">
      <Icon name={() => p.weather()?.icon ?? "cloud"} size={compact ? 36 : 46} color={() => p.weather()?.color ?? "$textMuted"} />
      <Box direction="column" gap={2}>
        <Label text={() => (p.weather() ? `${p.weather()!.temperature}°` : "--°")} size={compact ? 26 : 32} color="$textBright" />
        <Label text={() => (p.weather() ? `sensação ${p.weather()!.feelsLike}°` : "buscando…")} size={11} color="$textMuted" />
      </Box>
    </Box>
  );
  const hours = (
    <Box direction="column" gap={compact ? 6 : 10} grow justify="center">
      {() =>
        (p.weather()?.hours ?? []).map((h) => (
          <Box key={h.hour} gap={8} align="center">
            <Box width={30}><Label text={h.hour} size={11} color="$textFaint" /></Box>
            <Icon name={h.icon} size={14} color={h.color} />
            <Box width={26}><Label text={`${h.temperature}°`} size={11} color="$text" /></Box>
            <Box grow><Level height={4} value={h.rain} color="$cyan" /></Box>
          </Box>
        ))}
    </Box>
  );
  return (
    <Card {...p} title={() => p.weather()?.place || "clima"} action="weathr ↗" onAction={p.onOpen}>
      {compact
        ? <Box direction="column" gap={10} grow>{now}{hours}</Box>
        : <Box gap={24} grow align="center">{now}{hours}</Box>}
    </Card>
  );
}
