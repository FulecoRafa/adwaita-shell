import { Card, Level, type CardProps } from "@kit/components/Card";

export interface Meter {
  label: string;
  /** 0..1 */
  value: number;
  text: string;
  color: Color;
}

/** CPU, memory, disk and temperature levels: one column small, two otherwise. */
export function SystemCard(p: Omit<CardProps, "title" | "children"> & { meters: () => Meter[]; onOpen?: On }) {
  const compact = p.size === "small";
  const meter = (i: number) => {
    const m = () => p.meters()[i];
    return (
      <Box key={i} direction="column" gap={4} grow>
        <Box align="center">
          <Box grow><Label text={() => m().label} size={11} color="$textMuted" /></Box>
          <Label text={() => m().text} size={11} color={() => m().color} />
        </Box>
        <Level value={() => m().value} color={() => m().color} />
      </Box>
    );
  };
  const body = compact
    ? <Box direction="column" gap={8} grow justify="center">{[0, 1, 2, 3].map(meter)}</Box>
    : (
      <Box direction="column" gap={18} grow justify="center">
        <Box gap={24}>{meter(0)}{meter(1)}</Box>
        <Box gap={24}>{meter(2)}{meter(3)}</Box>
      </Box>
    );
  return (
    <Card {...p} title="sistema" action="btop ↗" onAction={p.onOpen} gap={8}>
      {body}
    </Card>
  );
}
