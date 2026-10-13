import { Card, Level, type CardProps } from "../Card";
import { Icon } from "../Icon";
import { duration } from "../../lib/format";

export interface EnergyProps extends Omit<CardProps, "title" | "children"> {
  battery: () => Battery | null;
  profile: () => string;
  onProfile: (profile: string) => void;
}

const profiles = [
  { id: "power-saver", label: "economia", icon: "leaf" },
  { id: "balanced", label: "equilíbrio", icon: "scales" },
  { id: "performance", label: "desempenho", icon: "rocket-launch" },
];

const batteryColor = (b: Battery | null) =>
  !b || b.charging ? "$green" : b.percent <= 15 ? "$red" : b.percent <= 30 ? "$orange" : "$green";

const batteryIcon = (b: Battery | null) => {
  if (!b) return "plug";
  if (b.charging) return "battery-charging";
  const p = b.percent;
  return p > 85 ? "battery-full" : p > 55 ? "battery-high" : p > 25 ? "battery-medium" : p > 10 ? "battery-low" : "battery-warning";
};

/** Battery state and power profiles: icons only when small, labelled otherwise. */
export function EnergyCard(p: EnergyProps) {
  const compact = p.size === "small";
  const action = () => {
    const b = p.battery();
    if (!b) return "";
    const time = duration(b.timeLeft);
    return `${Math.round(b.percent)}%${time && !compact ? ` · ${time}` : ""}`;
  };
  const state = (
    <Box direction="column" gap={11} grow justify="center">
      <Box gap={12} align="center">
        <Icon name={() => batteryIcon(p.battery())} size={34} color={() => batteryColor(p.battery())} />
        <Box direction="column" gap={2}>
          <Label
            text={() => {
              const b = p.battery();
              return !b ? "tomada" : b.watts > 0 ? `${b.watts.toFixed(1)} W` : `${Math.round(b.percent)}%`;
            }}
            size={19}
            color="$textBright"
          />
          <Label
            text={() => {
              const b = p.battery();
              return !b ? "sem bateria" : b.charging ? (b.percent >= 99 ? "carregada" : "carregando") : "descarregando";
            }}
            size={11}
            color="$textMuted"
          />
        </Box>
      </Box>
      {() => (p.battery() ? <Level height={7} value={() => (p.battery()?.percent ?? 0) / 100} color={() => batteryColor(p.battery())} /> : null)}
    </Box>
  );
  const profileButton = (pr: (typeof profiles)[number]) => {
    const active = () => p.profile() === pr.id;
    const fg = () => (active() ? "$onAccent" : "$textMuted");
    return (
      <Box
        key={pr.id}
        grow
        height={30}
        radius={14}
        gap={7}
        align="center"
        justify="center"
        bg={() => (active() ? "$yellow" : "$track")}
        hoverBg="$dimmer"
        onClick={() => p.onProfile(pr.id)}
      >
        <Icon name={pr.icon} size={13} color={fg} />
        {compact ? null : <Label text={pr.label} size={11} color={fg} />}
      </Box>
    );
  };
  return (
    <Card {...p} title="energia" action={action} actionColor={() => batteryColor(p.battery())} gap={11}>
      {compact
        ? <Box direction="column" gap={11} grow>{state}<Box gap={7}>{profiles.map(profileButton)}</Box></Box>
        : <Box gap={24} grow align="center">{state}<Box direction="column" gap={7} grow>{profiles.map(profileButton)}</Box></Box>}
    </Card>
  );
}
