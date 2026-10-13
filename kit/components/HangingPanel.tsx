export interface HangingPanelProps {
  visible: Bind<boolean>;
  onDismiss: On;
  /** Which edge it is measured from; "left" by default. */
  side?: "left" | "right";
  width: number;
  /** Distance from that edge. */
  offset: number;
  /** Where the bar's bottom edge is (its top margin plus height). */
  barBottom: number;
  padding?: number;
  topPadding?: number;
  children?: Child;
}

/**
 * A panel that hangs from the bar: no top border, square top corners,
 * rounded bottom ones, starting 8 px above the bar's bottom edge so the two
 * read as one shape. Closes on an outside click; clicks on the bar still
 * reach the bar.
 */
export function HangingPanel(p: HangingPanelProps) {
  const side = p.side ?? "left";
  const pad = p.padding ?? 20;
  const top = p.barBottom - 8;
  return (
    <Surface
      layer="overlay"
      anchor={`top ${side}`}
      width={p.width}
      margin={side === "left" ? [top, 0, 0, p.offset] : [top, p.offset, 0, 0]}
      visible={p.visible}
      onDismiss={p.onDismiss}
    >
      <Box
        direction="column"
        width={p.width}
        padding={[p.topPadding ?? 30, pad, pad, pad]}
        radius={[0, 0, 26, 26]}
        bg="$surface"
        border="$surfaceBorder"
      >
        {/* Hides the top border where the panel meets the bar. */}
        <Box place={{ top: 0, left: 1, right: 1 }} height={2} bg="$surface" />
        {p.children}
      </Box>
    </Surface>
  );
}
