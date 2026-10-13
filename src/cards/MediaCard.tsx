import { Card, Level, type CardProps } from "@kit/components/Card";
import { Icon } from "@kit/components/Icon";

export interface PlayerData {
  identity: string;
  title: string;
  artist: string;
  album: string;
  art: string;
  playing: boolean;
  position: number;
  length: number;
}

export interface MediaProps extends Omit<CardProps, "title" | "children"> {
  player: () => PlayerData | null;
  onPlayPause: On;
  onNext: On;
  onPrevious: On;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function Cover(p: { art: () => string; size: number }) {
  return (
    <Box width={p.size} height={p.size} radius={Math.round(p.size / 5)} bg="$purpleTint" align="center" justify="center">
      {() => (p.art() ? <Image src={p.art} size={p.size} /> : <Icon name="music-notes" size={Math.round(p.size * 0.42)} color="$purple" />)}
    </Box>
  );
}

function Button(p: { icon: Bind<string>; size: number; primary?: boolean; onClick: On }) {
  const edge = p.size + (p.primary ? 18 : 10);
  return (
    <Box width={edge} height={edge} radius={edge / 2} align="center" justify="center" bg={p.primary ? "$purple" : "#00000000"} hoverBg={p.primary ? undefined : "$track"} hoverOpacity={p.primary ? 0.85 : undefined} onClick={p.onClick}>
      <Icon name={p.icon} size={p.size} color={p.primary ? "$onAccent" : "$text"} />
    </Box>
  );
}

/** What is playing: cover, titles, progress and transport controls. */
export function MediaCard(p: MediaProps) {
  const size = p.size;
  const has = () => p.player() !== null;
  const title = () => p.player()?.title || "nada tocando";
  const artist = () => p.player()?.artist ?? "";
  const progress = () => {
    const pl = p.player();
    return pl && pl.length > 0 ? pl.position / pl.length : 0;
  };
  const controls = (iconSize: number) => (
    <Box gap={6} align="center">
      <Button icon="skip-back" size={iconSize} onClick={p.onPrevious} />
      <Button icon={() => (p.player()?.playing ? "pause" : "play")} size={iconSize + 2} primary onClick={p.onPlayPause} />
      <Button icon="skip-forward" size={iconSize} onClick={p.onNext} />
    </Box>
  );
  const textWidth = size === "small" ? p.width - 32 : p.width - 32 - (size === "large" ? 0 : 92);
  const texts = (
    <Box direction="column" gap={3} grow>
      <Label text={title} size={size === "small" ? 13 : 15} color="$textBright" maxWidth={textWidth} />
      <Label text={artist} size={11} color="$textMuted" maxWidth={textWidth} />
    </Box>
  );
  const timeline = (
    <Box direction="column" gap={4}>
      <Level height={4} value={progress} color="$purple" />
      {size === "small"
        ? null
        : <Box>
            <Box grow><Label text={() => clock(p.player()?.position ?? 0)} size={10} color="$textFaint" /></Box>
            <Label text={() => clock(p.player()?.length ?? 0)} size={10} color="$textFaint" />
          </Box>}
    </Box>
  );
  const body =
    size === "small"
      ? <Box direction="column" gap={8} grow justify="center">{texts}{timeline}<Box justify="center">{controls(14)}</Box></Box>
      : size === "wide"
        ? <Box gap={16} grow align="center">
            <Cover art={() => p.player()?.art ?? ""} size={76} />
            <Box direction="column" gap={8} grow>{texts}{timeline}</Box>
            {controls(16)}
          </Box>
        : <Box direction="column" gap={14} grow>
            <Box justify="center"><Cover art={() => p.player()?.art ?? ""} size={170} /></Box>
            {texts}
            {timeline}
            <Box justify="center">{controls(18)}</Box>
          </Box>;
  return (
    <Card {...p} title={() => (has() ? p.player()!.identity : "mídia")}>
      {body}
    </Card>
  );
}
