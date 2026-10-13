import { Card, type CardProps } from "../Card";
import { monthTitle, weekdayInitials } from "../../lib/format";

export interface CalendarEvent {
  title: string;
  time: string;
  color: string;
}

export interface CalendarProps extends Omit<CardProps, "title" | "children"> {
  now: () => Date;
  events: (day: Date) => CalendarEvent[];
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Days shown for the month of `d`: from the Sunday before the 1st, whole weeks. */
function monthDays(d: Date): Date[] {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const count = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;
  return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

function weekDays(d: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay() + i));
}

/**
 * Month grid with today's agenda when large; the current week and the next
 * events otherwise.
 */
export function CalendarCard(p: CalendarProps) {
  const selected = signal<number>(0); // day offset from today the agenda shows
  const shown = () => {
    const n = p.now();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate() + selected());
  };
  const cell = 32;

  const day = (d: Date, inMonth: boolean) => {
    const today = () => sameDay(d, p.now());
    const picked = () => sameDay(d, shown());
    const hasEvents = p.events(d).length > 0;
    return (
      <Box
        key={d.toDateString()}
        width={cell}
        height={cell}
        radius={cell / 2}
        direction="column"
        align="center"
        justify="center"
        bg={() => (today() ? "$yellow" : picked() ? "$track" : "#00000000")}
        hoverBg="$track"
        onClick={() => {
          const n = p.now();
          selected.set(Math.round((d.getTime() - new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()) / 86_400_000));
        }}
      >
        <Label text={String(d.getDate())} size={12} color={() => (today() ? "$onAccent" : inMonth ? "$text" : "$textGhost")} />
        {hasEvents ? <Box width={4} height={4} radius={2} bg={() => (today() ? "$onAccent" : "$purple")} /> : null}
      </Box>
    );
  };

  const header = (
    <Box justify="between">
      {weekdayInitials.map((w, i) => (
        <Box key={i} width={cell} justify="center"><Label text={w} size={10} color="$textFaint" /></Box>
      ))}
    </Box>
  );

  const agenda = (max: number) => (
    <Box direction="column" gap={6}>
      {() => {
        const events = p.events(shown());
        if (events.length === 0) return <Label text="nada marcado" size={11} color="$textFaint" />;
        const visible = events.length > max ? events.slice(0, max - 1) : events;
        return [
          ...visible.map((e, i) => (
            <Box key={i} gap={8} align="center" padding={[6, 10]} radius={10} bg="$raisedAlt">
              <Box width={3} height={14} radius={2} bg={e.color} />
              <Box grow><Label text={e.title} size={12} color="$text" maxWidth={p.width - 120} /></Box>
              <Label text={e.time || "dia todo"} size={11} color="$textMuted" />
            </Box>
          )),
          events.length > max ? <Label key="more" text={`+${events.length - visible.length}`} size={11} color="$textFaint" /> : null,
        ];
      }}
    </Box>
  );

  const body =
    p.size === "large"
      ? <Box direction="column" gap={6} grow>
          {header}
          {() => {
            const days = monthDays(p.now());
            const weeks = Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7));
            const month = p.now().getMonth();
            return weeks.map((week, w) => <Box key={w} justify="between">{week.map((d) => day(d, d.getMonth() === month))}</Box>);
          }}
          <Box height={6} />
          {agenda(3)}
        </Box>
      : <Box direction="column" gap={8} grow>
          {header}
          {() => <Box justify="between">{weekDays(shown()).map((d) => day(d, true))}</Box>}
          {p.size === "wide" ? agenda(2) : null}
        </Box>;

  return (
    <Card {...p} title={() => monthTitle(p.now())} action={() => (selected() !== 0 ? "hoje" : "")} onAction={() => selected.set(0)} gap={8}>
      {body}
    </Card>
  );
}
