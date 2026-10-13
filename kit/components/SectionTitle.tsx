export interface SectionTitleProps {
  label: Bind<string>;
  /** Yellow link at the end ("wiremix ↗", "procurar"). */
  action?: Bind<string>;
  onAction?: On;
}

/** "saída ──────── wiremix ↗": a faint caption, a rule and an optional link. */
export function SectionTitle(p: SectionTitleProps) {
  return (
    <Box gap={8} align="center">
      <Label text={p.label} size={11} color="$textFaint" />
      <Box grow height={1} bg="$raised" />
      {p.action ? <Box onClick={p.onAction} hoverOpacity={0.8}><Label text={p.action} size={11} color="$yellow" /></Box> : null}
    </Box>
  );
}
