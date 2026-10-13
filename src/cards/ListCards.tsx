// Cards that are mostly lists: timers, tasks, AI limits, network and
// world clock. Small shows the first item; bigger sizes show more.

import { Card, Level, type CardProps } from "@kit/components/Card";
import { Icon } from "@kit/components/Icon";
import { duration, hm, usageColor } from "@kit/lib/format";

type Base = Omit<CardProps, "title" | "children">;
const rows = (size: Base["size"]) => (size === "large" ? 7 : size === "wide" ? 3 : 2);

export interface TimerData {
  id: number;
  label: string;
  endsAt: number;
}

export function TimersCard(p: Base & { timers: () => TimerData[]; now: () => Date; onAdd: (minutes: number) => void; onCancel: (id: number) => void }) {
  const left = (t: TimerData) => {
    const s = Math.round((t.endsAt - p.now().getTime()) / 1000);
    if (s <= 0) return "pronto";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return (
    <Card {...p} title="alarmes & timers" action="+5 min" onAction={() => p.onAdd(5)}>
      <Box direction="column" gap={6} grow>
        {() => {
          const list = p.timers().slice(0, rows(p.size));
          if (list.length === 0) return <Label text="nenhum timer" size={11} color="$textFaint" />;
          return list.map((t) => (
            <Box key={t.id} gap={10} align="center" padding={[6, 10]} radius={12} bg="$raisedAlt">
              <Icon name="timer" size={14} color="$orange" />
              <Box grow><Label text={t.label} size={12} color="$text" /></Box>
              <Label text={() => left(t)} size={13} color="$textBright" />
              <Box onClick={() => p.onCancel(t.id)} hoverOpacity={0.6}><Icon name="x" size={11} color="$textFaint" /></Box>
            </Box>
          ));
        }}
      </Box>
    </Card>
  );
}

export interface TaskData {
  id: number;
  text: string;
  done: boolean;
}

export function NotesCard(p: Base & { tasks: () => TaskData[]; onToggle: (id: number) => void; onAdd: (text: string) => void; draft: () => string; onDraft: (text: string) => void }) {
  const open = () => p.tasks().filter((t) => !t.done).length;
  return (
    <Card {...p} title="tarefas & rascunho" action={() => `${open()} abertas`} actionColor="$textMuted">
      <Box direction="column" gap={6} grow>
        {() =>
          p.tasks().slice(0, rows(p.size) - 1).map((t) => (
            <Box key={t.id} gap={8} align="center" onClick={() => p.onToggle(t.id)} hoverOpacity={0.8}>
              <Icon name={t.done ? "check-square" : "square"} size={14} color={t.done ? "$green" : "$textGhost"} />
              <Label text={t.text} size={12} color={t.done ? "$textFaint" : "$text"} maxWidth={p.width - 60} />
            </Box>
          ))}
        <Box padding={[6, 10]} radius={10} bg="$sunken">
          <Input value={p.draft} placeholder="nova tarefa…" size={12} onChange={(e) => p.onDraft(e.value)} onSubmit={(e) => p.onAdd(e.value)} />
        </Box>
      </Box>
    </Card>
  );
}

export interface QuotaData {
  percent: number;
  resetsIn: number;
}

export function AiCard(p: Base & { usage: () => { claude: QuotaData; codex: QuotaData } | null }) {
  const quota = (name: string, q: () => QuotaData | undefined) => (
    <Box direction="column" gap={4}>
      <Box align="center">
        <Box grow><Label text={name} size={11} color="$textMuted" /></Box>
        <Label
          text={() => {
            const v = q();
            if (!v || v.percent < 0) return "–";
            const reset = duration(v.resetsIn);
            return `${Math.round(v.percent)}%${reset && p.size !== "small" ? ` · ${reset}` : ""}`;
          }}
          size={11}
          color={() => ((q()?.percent ?? -1) < 0 ? "$textFaint" : usageColor(q()!.percent))}
        />
      </Box>
      <Level value={() => Math.max(0, q()?.percent ?? 0) / 100} color={() => usageColor(q()?.percent ?? 0)} />
    </Box>
  );
  return (
    <Card {...p} title="limites de IA">
      <Box direction="column" gap={12} grow justify="center">
        {quota("claude · sessão", () => p.usage()?.claude)}
        {quota("codex", () => p.usage()?.codex)}
      </Box>
    </Card>
  );
}

export interface NetworkData {
  online: boolean;
  ssid: string;
  strength: number;
  bluetooth: { enabled: boolean; connected: string[] };
}

export function NetworkCard(p: Base & { net: () => NetworkData | null; onOpen?: On }) {
  return (
    <Card {...p} title="rede" action="wifitui ↗" onAction={p.onOpen}>
      <Box direction="column" gap={10} grow justify="center">
        <Box gap={10} align="center">
          <Icon name={() => (p.net()?.online ? "wifi-high" : "wifi-slash")} size={22} color={() => (p.net()?.online ? "$green" : "$textMuted")} />
          <Box direction="column" gap={2}>
            <Label text={() => p.net()?.ssid || "desconectado"} size={13} color="$textBright" />
            <Label text={() => (p.net()?.online ? `sinal ${Math.round((p.net()?.strength ?? 0) * 100)}%` : "")} size={11} color="$textMuted" />
          </Box>
        </Box>
        <Box gap={10} align="center">
          <Icon name="bluetooth" size={18} color={() => (p.net()?.bluetooth.connected.length ? "$cyan" : "$textMuted")} />
          <Label
            text={() => {
              const bt = p.net()?.bluetooth;
              if (!bt?.enabled) return "bluetooth desligado";
              return bt.connected.length ? bt.connected.join(", ") : "nada conectado";
            }}
            size={11}
            color="$textMuted"
          />
        </Box>
      </Box>
    </Card>
  );
}

/** Fixed UTC offsets: no time zone database in the sandbox yet. */
const zones = [
  { city: "lisboa", offset: 1 },
  { city: "nova york", offset: -4 },
  { city: "tóquio", offset: 9 },
];

export function WorldClockCard(p: Base & { now: () => Date }) {
  const at = (offset: number) => {
    const n = p.now();
    return new Date(n.getTime() + n.getTimezoneOffset() * 60_000 + offset * 3_600_000);
  };
  return (
    <Card {...p} title="relógio mundial">
      <Box direction="column" gap={8} grow justify="center">
        {zones.slice(0, rows(p.size) + 1).map((z) => (
          <Box key={z.city} align="center">
            <Box grow><Label text={z.city} size={12} color="$textMuted" /></Box>
            <Label text={() => hm(at(z.offset))} size={15} color="$textBright" />
          </Box>
        ))}
      </Box>
    </Card>
  );
}
