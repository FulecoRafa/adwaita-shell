/** Thin separator; vertical between groups of a row, horizontal in lists. */
export function Divider(p: { vertical?: boolean; length?: number; color?: Color }) {
  const vertical = p.vertical ?? true;
  const length = p.length ?? 22;
  return (
    <Box
      width={vertical ? 1 : length}
      height={vertical ? length : 1}
      bg={p.color ?? "$divider"}
    />
  );
}
