// AI usage limits (the cc/cx chip): hangs from the bar on the right with the
// session and weekly windows of Claude Code and Codex, and each one's daily
// peak over the last 7 days.

import { HangingPanel } from "@kit/components/HangingPanel";
import { Icon } from "@kit/components/Icon";
import { Meter } from "@kit/components/Meter";
import { hm, shortDate } from "@kit/lib/format";
import * as ai from "../data/ai";
import { close, shownAs } from "../data/shell";

const BAR_BOTTOM = 56;
const WIDTH = 520;
const PAD = 22;

const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const now = () => ctx.now("minute");

/** "35min", "2h11", "4d" until `at` (epoch s). */
function remaining(at: number): string {
  const minutes = Math.max(0, Math.round((at * 1000 - now().getTime()) / 60000));
  if (minutes < 60) return `${minutes}min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
  return `${Math.round(minutes / 1440)}d`;
}

/** "reseta 16:43 · em 2h11", or "reseta qui 09:00 · em 3d" on another day. */
function resetText(limit: ai.Limit): string {
  if (!limit.resetsAt) return "reset não informado";
  const date = new Date(limit.resetsAt * 1000);
  const when = date.toDateString() === now().toDateString() ? hm(date) : `${weekdays[date.getDay()]} ${hm(date)}`;
  return `reseta ${when} · em ${remaining(limit.resetsAt)}`;
}

function updatedText(at: number): string {
  if (!at) return "sem dados";
  const minutes = Math.round((now().getTime() / 1000 - at) / 60);
  if (minutes < 1) return "atualizado agora";
  if (minutes < 60) return `atualizado há ${minutes} min`;
  const d = new Date(at * 1000);
  return `atualizado ${shortDate(d).split(" ")[0]} ${hm(d)}`;
}

const pct = (v: number) => (v < 0 ? "—" : `${Math.round(v)}%`);

interface Spec {
  name: "claude" | "codex";
  icon: string;
  accent: Color;
  tint: Color;
  label: string;
  hint: string;
  limits: Record<string, { label: string; color: Color }>;
}

const providers: Spec[] = [
  {
    name: "claude",
    icon: "asterisk",
    accent: "$orange",
    tint: "$orangeTint",
    label: "claude code",
    hint: "abra o claude code: a status line grava os limites",
    limits: {
      session: { label: "sessão (5h)", color: "$orange" },
      week: { label: "semana · todos os modelos", color: "$yellow" },
      opus: { label: "semana · opus", color: "$purple" },
      sonnet: { label: "semana · sonnet", color: "$cyan" },
    },
  },
  {
    name: "codex",
    icon: "hexagon",
    accent: "$green",
    tint: "$greenTint",
    label: "codex",
    hint: "faça login com `codex login` para ver os limites",
    limits: {
      session: { label: "sessão (5h)", color: "$green" },
      week: { label: "semana", color: "$cyan" },
    },
  },
];

function LimitRow(p: { limit: ai.Limit; label: string; color: Color }) {
  const v = p.limit.percent;
  return (
    <Box direction="column" gap={7}>
      <Box align="center">
        <Label text={p.label} size={12} color="$textMuted" />
        <Box grow />
        <Label text={pct(v)} size={12} color="$text" />
      </Box>
      <Box><Meter value={Math.max(0, v) / 100} accent={v >= 90 ? "$red" : p.color} track="$track" /></Box>
      <Label text={() => resetText(p.limit)} size={11} color="$textFaint" />
    </Box>
  );
}

function ProviderCard(p: { spec: Spec; data: ai.Provider | undefined }) {
  const s = p.spec;
  const d = p.data;
  const available = d?.available ?? false;
  const limits = (d?.limits ?? []).filter((l) => s.limits[l.key]);
  const badge = d?.plan ?? "";
  const detail = !available ? "sem dados" : s.name === "codex" ? (d?.stale ? "em cache" : "") : (d?.model ?? "");
  return (
    <Box direction="column" gap={14} padding={16} radius={20} bg="$raised">
      <Box gap={10} align="center">
        <Box width={28} height={28} radius={10} bg={s.tint} align="center" justify="center">
          <Icon name={s.icon} size={15} color={s.accent} />
        </Box>
        <Label text={s.label} size={13} color="$textBright" />
        {badge ? <Box padding={[3, 9]} radius={10} bg="$track"><Label text={badge} size={10} color="$textMuted" /></Box> : null}
        <Box grow />
        <Label text={detail} size={11} color="$textFaint" />
      </Box>
      {!available || limits.length === 0 ? <Label text={s.hint} size={11} color="$textGhost" wrap /> : null}
      {available ? limits.map((l) => <LimitRow key={l.key} limit={l} {...s.limits[l.key]} />) : null}
    </Box>
  );
}

function History(p: { name: string; values: number[]; accent: Color }) {
  const peak = Math.max(1, ...p.values);
  return (
    <Box grow direction="column" gap={6}>
      <Label text={`7 dias · ${p.name}`} size={11} color="$textFaint" />
      <Box gap={12} align="end" height={34}>
        {p.values.map((v, i) => (
          <Box key={i} width={18} height={Math.max(4, (34 * v) / peak)} radius={3} bg={i === 6 ? p.accent : "#3D4657"} />
        ))}
      </Box>
    </Box>
  );
}

export default function AiPanel() {
  const details = memo(() => ai.details());
  return (
    <HangingPanel
      visible={shownAs("ai", ai.refresh)}
      onDismiss={close}
      side="right"
      width={WIDTH}
      offset={356}
      barBottom={BAR_BOTTOM}
      padding={PAD}
      topPadding={28}
    >
      <Box direction="column" gap={16} width={WIDTH - 2 * PAD}>
        <Box gap={10} align="center">
          <Icon name="gauge" size={18} color="$orange" />
          <Label text="limites de uso" size={15} color="$textBright" />
          <Box grow />
          <Label text={() => updatedText(details()?.updatedAt ?? 0)} size={11} color="$textFaint" />
          <Box padding={2} hoverOpacity={0.7} tooltip="atualizar" onClick={ai.refresh}>
            <Icon name="arrows-clockwise" size={14} color="$textFaint" />
          </Box>
        </Box>
        {() => {
          const d = details();
          return (
            <Box direction="column" gap={16}>
              {providers.map((s) => <ProviderCard key={s.name} spec={s} data={d?.[s.name]} />)}
              <Box gap={16}>
                <History name="claude" values={d?.history.claude ?? [0, 0, 0, 0, 0, 0, 0]} accent="$orange" />
                <History name="codex" values={d?.history.codex ?? [0, 0, 0, 0, 0, 0, 0]} accent="$green" />
              </Box>
            </Box>
          );
        }}
      </Box>
    </HangingPanel>
  );
}
