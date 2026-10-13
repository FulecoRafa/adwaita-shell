import { Icon } from "./Icon";

/** What a player is playing, as the media plugin reports it. */
export interface Track {
  /** MPRIS instance ("chromium.instance3388", "mpv"). */
  instance: string;
  /** Player name ("chromium", "mpv"). */
  identity: string;
  title: string;
  artist: string;
  album: string;
  /** Image source of the cover, "" if none. */
  art: string;
  playing: boolean;
  /** Seconds at `at` (ms since the epoch); advances by `rate` while playing. */
  position: number;
  at: number;
  rate: number;
  length: number;
}

/** A player that could be shown instead. */
export interface PlayerChoice {
  instance: string;
  identity: string;
  playing: boolean;
}

/** small: a 1×1 card; wide: 2×1; large: 2×2 with a big cover. */
export type MediaLayout = "small" | "wide" | "large";

export interface MediaPlayerProps {
  track: () => Track | null;
  layout: MediaLayout;
  /** Width of the content, px. */
  width: number;
  onPlayPause: On;
  onNext: On;
  onPrevious: On;
  /** Clicked or dragged on the progress line: go to `seconds`. */
  onSeek: (seconds: number) => void;
  /** Every player; with more than one (and room), a chip each picks which to show. */
  players?: () => PlayerChoice[];
  onChoose?: (instance: string) => void;
  /** Caption when nothing plays. */
  empty?: string;
}

const clock = (s: number) => {
  const total = Math.max(0, Math.floor(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Where the track is now, from the last report. */
const elapsed = (t: Track) =>
  Math.min(t.length || Infinity, t.position + (t.playing ? ((Date.now() - t.at) / 1000) * t.rate : 0));

const BUTTON = 46;
const GAP = 14;
const SKIP = 17;

/**
 * A media player like Android's: cover, title, "artist · album", a round
 * play button, and a wavy progress line between previous and next. The line
 * moves and waves by itself in the renderer (Slider `rate` and `wave`);
 * clicking or dragging it seeks.
 */
export function MediaPlayer(p: MediaPlayerProps) {
  const large = p.layout === "large";
  const small = p.layout === "small";
  const cover = large ? 168 : small ? 56 : 74;
  const textWidth = p.width - cover - BUTTON - 2 * GAP;
  // Read through memos: a new report re-renders texts, not the cover or the line.
  const has = memo(() => p.track() !== null);
  const art = memo(() => p.track()?.art ?? "");
  const playing = memo(() => p.track()?.playing ?? false);
  const subtitle = () => {
    const t = p.track();
    return t ? [t.artist, t.album].filter(Boolean).join(" · ") : "";
  };
  const times = () => {
    const t = p.track();
    return t && t.length > 0 ? `${clock(elapsed(t))} / ${clock(t.length)}` : "";
  };
  const caption = () => {
    const t = p.track();
    if (!t) return p.empty ?? "nada tocando";
    return [t.identity.toLowerCase(), times()].filter(Boolean).join(" · ");
  };

  const picture = (
    <Box width={cover} height={cover} radius={large ? 26 : 20} bg="$track" align="center" justify="center">
      {() =>
        art()
          ? <Image src={art()} size={cover} radius={large ? 26 : 20} fit="cover" />
          : <Icon name="music-notes" size={large ? 48 : 26} color="$textMuted" />}
    </Box>
  );
  const texts = (
    <Box direction="column" gap={4} grow>
      {large
        ? <Label text={() => p.track()?.title || "nada tocando"} size={19} color="$textBright" wrap lines={3} />
        : <Label text={() => p.track()?.title || "nada tocando"} size={15} color="$textBright" maxWidth={textWidth} />}
      {() => (subtitle() ? <Label text={subtitle} size={large ? 13 : 12} color="$textMuted" maxWidth={textWidth} /> : null)}
      {small ? null : <Label text={caption} size={11} color="$textFaint" maxWidth={textWidth} />}
    </Box>
  );
  const play = (
    <Box
      width={BUTTON}
      height={BUTTON}
      radius={BUTTON / 2}
      bg={() => (has() ? "$purple" : "$track")}
      hoverOpacity={0.85}
      align="center"
      justify="center"
      onClick={p.onPlayPause}
    >
      <Icon name={() => (playing() ? "pause" : "play")} size={19} color={() => (has() ? "$onAccent" : "$textFaint")} />
    </Box>
  );
  const chip = (c: PlayerChoice) => {
    const current = () => p.track()?.instance === c.instance;
    return (
      <Box
        key={c.instance}
        height={24}
        padding={[0, 8]}
        radius={12}
        gap={5}
        align="center"
        bg={() => (current() ? "$purple" : "$track")}
        hoverBg={() => (current() ? "$purple" : "$raisedAlt")}
        onClick={() => p.onChoose?.(c.instance)}
      >
        <Icon name={c.playing ? "play" : "pause"} size={10} color={() => (current() ? "$onAccent" : "$textMuted")} />
        <Label text={c.identity.toLowerCase()} size={11} color={() => (current() ? "$onAccent" : "$text")} />
      </Box>
    );
  };
  const choices = memo(() => (small || !p.players ? [] : p.players()));
  const chips = () => (choices().length > 1 ? <Box gap={6}>{choices().map(chip)}</Box> : null);

  const skip = (icon: string, onClick: On) => (
    <Box onClick={onClick} hoverOpacity={0.7}>
      <Icon name={icon} size={SKIP} color="$text" />
    </Box>
  );
  const line = () => (
    <Box gap={GAP} align="center">
      {skip("skip-back", p.onPrevious)}
      <Slider
        width={p.width - 2 * (SKIP + GAP)}
        value={() => {
          const t = p.track();
          return t && t.length > 0 ? Math.min(1, t.position / t.length) : 0;
        }}
        rate={() => {
          const t = p.track();
          return t && t.playing && t.length > 0 ? t.rate / t.length : 0;
        }}
        at={() => p.track()?.at ?? 0}
        wave={() => (playing() ? 3.5 : 0)}
        thickness={3}
        color="$purple"
        track="$dimmer"
        onCommit={(e) => {
          const t = p.track();
          if (t && t.length > 0) p.onSeek(e.value * t.length);
        }}
      />
      {skip("skip-forward", p.onNext)}
    </Box>
  );

  return (
    <Box direction="column" grow gap={12}>
      <Box gap={GAP} align="center">
        {picture}
        {texts}
        {large ? <Box height={cover} direction="column" justify="end">{play}</Box> : play}
      </Box>
      {chips}
      <Box grow />
      {small ? <Label text={times} size={11} color="$textFaint" /> : null}
      {() => (has() ? line() : null)}
    </Box>
  );
}
