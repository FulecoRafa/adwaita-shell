import { Card, type CardProps } from "@kit/components/Card";
import { MediaPlayer, type PlayerChoice, type Track } from "@kit/components/MediaPlayer";

export interface MediaProps extends Omit<CardProps, "title" | "children"> {
  player: () => Track | null;
  onPlayPause: On;
  onNext: On;
  onPrevious: On;
  onSeek: (seconds: number) => void;
  players: () => PlayerChoice[];
  onChoose: (instance: string) => void;
}

/** What is playing; no caption, like the reference (the player's name is in the text). */
export function MediaCard(p: MediaProps) {
  return (
    <Card {...p} gap={12}>
      <MediaPlayer
        track={p.player}
        layout={p.size}
        width={p.width - 32}
        onPlayPause={p.onPlayPause}
        onNext={p.onNext}
        onPrevious={p.onPrevious}
        onSeek={p.onSeek}
        players={p.players}
        onChoose={p.onChoose}
        empty="abra algo no mpv, helium ou spotify"
      />
    </Card>
  );
}
