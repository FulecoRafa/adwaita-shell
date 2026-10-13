// App launcher (the magnifier pin): search installed apps, launch with
// Enter or a click, right click pins to the bar. Built only from @kit, the
// same pieces the bar uses.

import { AppTile } from "@kit/components/AppTile";
import { ListRow } from "@kit/components/ListRow";
import { SearchField } from "@kit/components/SearchField";
import * as apps from "@kit/data/apps";
import { close, panel } from "../data/shell";

const WIDTH = 640;

export default function Launcher() {
  const query = signal("");
  const results = () => apps.search(query(), 8);

  const run = (app: apps.App) => {
    apps.launch(app.id);
    query.set("");
    close();
  };

  // Nothing typed: the most used apps as a grid.
  const grid = () => (
    <Box gap={8} justify="between" padding={[6, 4]}>
      {apps.search("", 5).map((a) => (
        <AppTile key={a.id} image={a.icon} icon="app-window" label={a.name} size={48} tooltip={a.name} onClick={() => run(a)} onRightClick={() => apps.togglePin(a.id)} />
      ))}
    </Box>
  );

  const list = () => {
    const found = results();
    return (
    <Box direction="column" gap={2}>
      {found.map((a, i) => (
        <ListRow
          key={a.id}
          title={a.name}
          subtitle={a.id}
          image={a.icon || undefined}
          selected={i === 0}
          trailing={() => (apps.pins().includes(a.id) ? "fixado" : i === 0 ? "↵" : "")}
          onClick={() => run(a)}
          onRightClick={() => apps.togglePin(a.id)}
        />
      ))}
      {found.length === 0 ? <Label text="nada encontrado" size={12} color="$textFaint" /> : null}
    </Box>
    );
  };

  return (
    <Surface
      layer="overlay"
      anchor="top"
      width={WIDTH}
      height={480}
      margin={[96, 0, 0, 0]}
      visible={() => panel() === "launcher"}
      onDismiss={close}
    >
      <Box grow direction="column" gap={14} padding={18} radius={26} bg="$surface" border="$surfaceBorder">
        <SearchField
          value={query}
          placeholder="buscar apps…"
          autofocus
          onChange={query.set}
          onSubmit={() => {
            const first = results()[0];
            if (first) run(first);
          }}
        />
        {() => (query().trim() === "" ? grid() : list())}
      </Box>
    </Surface>
  );
}
