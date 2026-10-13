import { Icon } from "./Icon";
import { map, read } from "../lib/bind";

export interface SelectRowProps {
  icon: Bind<string>;
  label: Bind<string>;
  /** The chosen one: highlighted, green icon and trailing text. */
  selected: Bind<boolean>;
  trailing?: Bind<string>;
  onClick?: On;
}

/** A 36 px row of a list of choices (audio outputs and inputs). */
export function SelectRow(p: SelectRowProps) {
  const on = p.selected;
  return (
    <Box
      height={36}
      padding={[0, 12]}
      gap={10}
      align="center"
      radius={14}
      bg={map(on, (s) => (s ? "$raised" : "#00000000"))}
      hoverBg={map(on, (s) => (s ? "$raised" : "$raisedAlt"))}
      onClick={p.onClick}
    >
      <Icon name={p.icon} size={16} color={map(on, (s) => (s ? "$green" : "$textMuted"))} />
      <Label text={p.label} size={12} color={map(on, (s) => (s ? "$text" : "$textMuted"))} maxWidth={220} />
      <Box grow />
      {p.trailing === undefined ? null : <Label text={() => read(p.trailing!)} size={11} color={map(on, (s) => (s ? "$green" : "$textFaint"))} />}
    </Box>
  );
}
