// Notification center (the bell): the history, newest first, on the right
// under the bar, with do-not-disturb and "clear all". A column of cards on a
// transparent window, like the reference; it scrolls past the screen height.

import { Icon } from "@kit/components/Icon";
import { NotificationCard } from "@kit/components/NotificationCard";
import * as n from "../data/notifications";
import { close, shownAs } from "../data/shell";

const BAR_BOTTOM = 56;
const WIDTH = 352;

function Header() {
  const color = () => (n.dnd() ? "$yellow" : "$textFaint");
  return (
    <Box height={38} padding={[0, 16]} gap={12} align="center" radius={19} bg="$surface" border="$surfaceBorder">
      <Label text="notificações" size={11} color="$textFaint" />
      <Box grow />
      <Box gap={6} align="center" hoverOpacity={0.8} onClick={n.toggleDnd}>
        <Icon name={() => (n.dnd() ? "bell-slash" : "bell-simple")} size={13} color={color} />
        <Label text="não perturbe" size={11} color={color} />
      </Box>
      <Box hoverOpacity={0.7} onClick={n.clearAll}>
        <Label text="limpar tudo" size={11} color="$textFaint" />
      </Box>
    </Box>
  );
}

function Empty() {
  return (
    <Box direction="column" height={92} gap={8} align="center" justify="center" radius={22} bg="$surface" border="$surfaceBorder">
      <Icon name="bell-simple-z" size={22} color="$dim" />
      <Label text="nada por aqui" size={12} color="$textFaint" />
    </Box>
  );
}

export default function NotificationCenter() {
  // Cards are rebuilt when the list changes; their age ticks on its own.
  const items = memo(() => n.list());
  const now = () => ctx.now("minute");
  return (
    <Surface
      layer="overlay"
      anchor="top right"
      width={WIDTH}
      margin={[BAR_BOTTOM + 14, 22, 0, 0]}
      visible={shownAs("notifications")}
      onDismiss={close}
    >
      <Box direction="column" gap={10} width={WIDTH} maxHeight={() => ctx.screen().height - BAR_BOTTOM - 40} scroll>
        <Header />
        {() => {
          const list = items();
          if (list.length === 0) return <Empty />;
          return list.map((item) => (
            <NotificationCard
              key={item.id}
              icon={n.glyph(item)}
              image={n.image(item)}
              accent={n.accent(item)}
              title={n.title(item)}
              age={() => n.age(item, now())}
              body={item.body}
              width={WIDTH}
              onClick={() => n.dismiss(item.id)}
              onClose={() => n.dismiss(item.id)}
            />
          ));
        }}
      </Box>
    </Surface>
  );
}
