// Widget drawer (the battery icon or the grid pin): slides in on the right,
// under the bar, over the windows. Cards follow the saved layout in a
// two-column grid with three sizes: small (1×1), wide (2×1), large (2×2).
// Edit mode cycles sizes, removes, reorders and adds cards.

import { cardBox, type CardSize } from "@kit/components/Card";
import { Chip } from "@kit/components/Chip";
import { Icon } from "@kit/components/Icon";
import { CalendarCard } from "../cards/CalendarCard";
import { EnergyCard } from "../cards/EnergyCard";
import { AiCard, NetworkCard, NotesCard, TimersCard, WorldClockCard } from "../cards/ListCards";
import { MediaCard } from "../cards/MediaCard";
import { SystemCard } from "../cards/SystemCard";
import { WeatherCard } from "../cards/WeatherCard";
import * as data from "../data/drawer";
import { launch } from "../data/desktop";
import { close, panel } from "../data/shell";
import * as status from "../data/status";

const BAR_BOTTOM = 56;
const WIDTH = 600;
const PAD_X = 26;
const GRID = WIDTH - 2 * PAD_X;
const GAP = 14;
const ROW = 180;

interface Info {
  label: string;
  icon: string;
  color: string;
  sizes: CardSize[];
  size: CardSize;
}

const catalog: Record<string, Info> = {
  media: { label: "mídia", icon: "music-notes", color: "$purple", sizes: ["small", "wide", "large"], size: "wide" },
  weather: { label: "clima", icon: "cloud-sun", color: "$yellow", sizes: ["small", "wide"], size: "small" },
  energy: { label: "energia", icon: "lightning", color: "$green", sizes: ["small", "wide"], size: "small" },
  calendar: { label: "calendário & agenda", icon: "calendar-blank", color: "$cyan", sizes: ["small", "wide", "large"], size: "large" },
  system: { label: "sistema", icon: "cpu", color: "$cyan", sizes: ["small", "wide"], size: "small" },
  timers: { label: "alarmes & timers", icon: "alarm", color: "$orange", sizes: ["small", "wide", "large"], size: "small" },
  notes: { label: "tarefas & rascunho", icon: "note-pencil", color: "$yellow", sizes: ["small", "wide", "large"], size: "wide" },
  clock: { label: "relógio mundial", icon: "globe-hemisphere-west", color: "$cyan", sizes: ["small", "wide"], size: "small" },
  ai: { label: "limites de IA", icon: "gauge", color: "$orange", sizes: ["small", "wide"], size: "small" },
  network: { label: "rede", icon: "wifi-high", color: "$green", sizes: ["small", "wide"], size: "small" },
};
const defaultKeys = ["media", "weather", "energy", "calendar", "system", "timers", "notes"];

const editing = signal(false);
const picking = signal(false);

const layout = (): data.Placed[] =>
  (data.layout() ?? defaultKeys.map((key) => ({ key, size: catalog[key].size }))).filter((i) => catalog[i.key]);
const save = (next: data.Placed[]) => data.layout.set(next);

function cycleSize(key: string) {
  save(layout().map((i) => {
    if (i.key !== key) return i;
    const sizes = catalog[key].sizes;
    return { key, size: sizes[(sizes.indexOf(i.size) + 1) % sizes.length] };
  }));
}
const remove = (key: string) => save(layout().filter((i) => i.key !== key));
const add = (key: string) => save([...layout(), { key, size: catalog[key].size }]);
function move(key: string, delta: number) {
  const list = layout();
  const from = list.findIndex((i) => i.key === key);
  const to = Math.max(0, Math.min(list.length - 1, from + delta));
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  save(next);
}

/** First-fit in two columns: a small card takes the earliest free half row. */
function pack(items: data.Placed[]): data.Placed[][] {
  const rows: data.Placed[][] = [];
  let half = -1;
  for (const item of items) {
    if (item.size !== "small") {
      rows.push([item]);
    } else if (half >= 0) {
      rows[half].push(item);
      half = -1;
    } else {
      half = rows.length;
      rows.push([item]);
    }
  }
  return rows;
}

function card(item: data.Placed) {
  const { width, height } = cardBox(item.size, GRID, GAP, ROW);
  const common = {
    size: item.size,
    width,
    height,
    editing,
    sizes: catalog[item.key].sizes,
    onCycleSize: () => cycleSize(item.key),
    onRemove: () => remove(item.key),
  };
  const now = () => ctx.now("second");
  const terminal = (cmd: string) => () => {
    launch(["ghostty", `--class=fuleco.${cmd}`, "-e", cmd]);
    close();
  };
  switch (item.key) {
    case "media":
      return <MediaCard {...common} player={data.player} onPlayPause={data.playPause} onNext={data.next} onPrevious={data.previous} />;
    case "weather":
      return <WeatherCard {...common} weather={data.weather} onOpen={terminal("weathr")} />;
    case "energy":
      return <EnergyCard {...common} battery={status.battery} profile={data.powerProfile} onProfile={(pr) => data.setPowerProfile(pr as data.Profile)} />;
    case "calendar":
      return <CalendarCard {...common} now={() => ctx.now("minute")} events={data.eventsOn} />;
    case "system":
      return (
        <SystemCard
          {...common}
          onOpen={terminal("btop")}
          meters={() => {
            const m = status.memory();
            const d = status.disk();
            return [
              { label: "cpu", value: status.cpu() / 100, text: `${Math.round(status.cpu())}%`, color: "$cyan" },
              { label: "memória", value: m.percent / 100, text: `${m.usedGiB.toFixed(1)}/${Math.round(m.totalGiB)}G`, color: "$green" },
              { label: "disco /", value: d.percent / 100, text: `${Math.round(d.usedGiB)}/${Math.round(d.totalGiB)}G`, color: "$purple" },
              { label: "temp", value: status.temperature() / 100, text: `${status.temperature()}°c`, color: "$orange" },
            ];
          }}
        />
      );
    case "timers":
      return (
        <TimersCard
          {...common}
          timers={data.timers}
          now={now}
          onAdd={(min) => data.timers.update((ts) => [...ts, { id: Date.now(), label: `${min} min`, endsAt: Date.now() + min * 60_000 }])}
          onCancel={(id) => data.timers.update((ts) => ts.filter((t) => t.id !== id))}
        />
      );
    case "notes":
      return (
        <NotesCard
          {...common}
          tasks={data.tasks}
          draft={data.draft}
          onDraft={data.draft.set}
          onToggle={(id) => data.tasks.update((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))}
          onAdd={(text) => {
            if (!text.trim()) return;
            data.tasks.update((ts) => [...ts, { id: Date.now(), text: text.trim(), done: false }]);
            data.draft.set("");
          }}
        />
      );
    case "clock":
      return <WorldClockCard {...common} now={() => ctx.now("minute")} />;
    case "ai":
      return <AiCard {...common} usage={status.ai} />;
    case "network":
      return <NetworkCard {...common} net={status.net} onOpen={terminal("wifitui")} />;
  }
  return null;
}

function Header() {
  const weekday = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const month = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return (
    <Box align="end" gap={12}>
      <Box direction="column" gap={3} grow>
        <Label
          text={() => {
            const d = ctx.now("minute");
            return `${weekday[d.getDay()]}, ${d.getDate()} de ${month[d.getMonth()]}`;
          }}
          size={24}
          color="$textBright"
        />
        <Label
          text={() => {
            if (editing()) return "↑↓ reordenam · 1×1, 2×1 e 2×2 trocam o tamanho";
            const events = data.eventsOn(ctx.now("minute")).length;
            const alarms = data.timers().length;
            const open = data.tasks().filter((t) => !t.done).length;
            return `${events} ${events === 1 ? "evento" : "eventos"} · ${alarms} ${alarms === 1 ? "alarme" : "alarmes"} · ${open} ${open === 1 ? "tarefa aberta" : "tarefas abertas"}`;
          }}
          size={12}
          color="$textFaint"
        />
      </Box>
      <Chip label={() => (editing() ? "pronto" : "editar")} active={editing} size={11} onClick={() => editing.update((e) => !e)} />
    </Box>
  );
}

/** Reorder handles over a card in edit mode. */
function Reorder(p: { item: data.Placed }) {
  return (
    <Box place={{ bottom: 10, right: 12 }} gap={6}>
      {[["caret-up", -1], ["caret-down", 1]].map(([icon, delta]) => (
        <Box key={String(icon)} width={24} height={24} radius={12} bg="$raisedAlt" hoverBg="$track" align="center" justify="center" onClick={() => move(p.item.key, delta as number)}>
          <Icon name={icon as string} size={12} color="$text" />
        </Box>
      ))}
    </Box>
  );
}

function AddCard() {
  const available = () => Object.keys(catalog).filter((k) => !layout().some((i) => i.key === k));
  return () => {
    if (!editing() || available().length === 0) return null;
    return (
      <Box direction="column" gap={8} padding={14} radius={22} border="$dim">
        <Box gap={8} align="center" onClick={() => picking.update((v) => !v)} hoverOpacity={0.8}>
          <Icon name="plus-circle" size={16} color="$yellow" />
          <Label text={`adicionar cartão (${available().length})`} size={12} color="$text" />
        </Box>
        {() =>
          picking()
            ? available().map((key) => (
              <Box key={key} gap={10} align="center" padding={[6, 10]} radius={12} hoverBg="$raised" onClick={() => add(key)}>
                <Icon name={catalog[key].icon} size={14} color={catalog[key].color} />
                <Label text={catalog[key].label} size={12} color="$text" />
              </Box>
            ))
            : null}
      </Box>
    );
  };
}

export default function Drawer() {
  return (
    <Surface
      layer="overlay"
      anchor="top right bottom"
      width={WIDTH}
      margin={[BAR_BOTTOM + GAP, 0, 0, 0]}
      visible={() => panel() === "drawer"}
      onDismiss={close}
    >
      <Box grow direction="column" bg="$surface" border="$surfaceBorder" radius={[26, 0, 0, 26]} padding={[24, PAD_X, 24, PAD_X]} gap={12} scroll>
        <Header />
        {() =>
          pack(layout()).map((row) => (
            <Box key={row.map((i) => i.key).join("+")} gap={GAP}>
              {row.map((item) => (
                <Box key={item.key}>
                  {card(item)}
                  {() => (editing() ? <Reorder item={item} /> : null)}
                </Box>
              ))}
            </Box>
          ))}
        <AddCard />
      </Box>
    </Surface>
  );
}
