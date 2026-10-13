import { Icon } from "./Icon";

export interface NotificationCardProps {
  /** Phosphor glyph in the round tinted badge. */
  icon: string;
  /** App icon (an image source); wins over the glyph. */
  image?: string;
  /** Accent token name without "$": "cyan", "purple"... ("$<accent>Tint" is the badge). */
  accent: string;
  /** "app · summary" */
  title: string;
  /** "agora", "4 min" */
  age: Bind<string>;
  body?: string;
  /** Lines of body before an ellipsis. */
  lines?: number;
  width: number;
  onClick?: On;
  onClose?: On;
}

/** A notification: tinted round icon, title, age, close button and the body. */
export function NotificationCard(p: NotificationCardProps) {
  return (
    <Box
      direction="column"
      gap={10}
      padding={14}
      width={p.width}
      radius={22}
      bg="$surface"
      border="$surfaceBorder"
      onClick={p.onClick}
    >
      <Box gap={10} align="center">
        <Box width={30} height={30} radius={15} bg={`$${p.accent}Tint`} align="center" justify="center">
          {p.image ? <Image src={p.image} size={20} /> : <Icon name={p.icon} size={16} color={`$${p.accent}`} />}
        </Box>
        <Box grow><Label text={p.title} size={12} color="$text" maxWidth={p.width - 130} /></Box>
        <Label text={p.age} size={11} color="$textFaint" />
        <Box padding={2} hoverOpacity={0.7} onClick={p.onClose} tooltip="dispensar">
          <Icon name="x" size={13} color="$textFaint" />
        </Box>
      </Box>
      {p.body ? <Label text={p.body} size={12} color="$textMuted" wrap lines={p.lines ?? 5} /> : null}
    </Box>
  );
}
