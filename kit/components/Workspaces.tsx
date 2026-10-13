export interface WorkspacesProps {
  count: number;
  workspaces: () => Workspace[];
  onSelect: (id: number) => void;
  onScroll?: (delta: number) => void;
}

/**
 * One pill per workspace: long yellow on the focused one, cyan where there
 * are windows, a dot when empty.
 */
export function Workspaces(p: WorkspacesProps) {
  const ids = Array.from({ length: p.count }, (_, i) => i + 1);
  const find = (id: number) => p.workspaces().find((w) => w.id === id);
  return (
    <Box gap={7} align="center" onScroll={p.onScroll ? (e) => p.onScroll!(-e.delta) : undefined}>
      {ids.map((id) => (
        <Box
          key={id}
          height={6}
          radius={4}
          width={() => {
            const w = find(id);
            return w?.focused ? 24 : (w?.windows ?? 0) > 0 ? 12 : 6;
          }}
          bg={() => {
            const w = find(id);
            return w?.focused ? "$yellow" : (w?.windows ?? 0) > 0 ? "$cyan" : "$dimmer";
          }}
          onClick={() => p.onSelect(id)}
        />
      ))}
    </Box>
  );
}
