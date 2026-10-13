// Power strip (the clock): log out, power off, suspend, lock, reload.
// Dangerous buttons ask for a second click within 3 s.

import { HangingPanel } from "@kit/components/HangingPanel";
import { RoundButton } from "@kit/components/RoundButton";
import { launch } from "../data/desktop";
import { close, shownAs } from "../data/shell";

const BAR_BOTTOM = 56;
const SIZE = 46;
const GAP = 10;

interface Action {
  id: string;
  icon: string;
  color: Color;
  tint: Color;
  confirm: boolean;
  label: string;
  command: string[];
}

const actions: Action[] = [
  { id: "logout", icon: "sign-out", color: "$red", tint: "$redTint", confirm: true, label: "sair", command: ["sh", "-c", "uwsm stop || hyprctl dispatch exit"] },
  { id: "poweroff", icon: "power", color: "$text", tint: "$raised", confirm: true, label: "desligar", command: ["systemctl", "poweroff"] },
  { id: "suspend", icon: "moon", color: "$purple", tint: "$raised", confirm: false, label: "suspender", command: ["systemctl", "suspend"] },
  { id: "lock", icon: "lock-key", color: "$cyan", tint: "$raised", confirm: false, label: "bloquear", command: ["loginctl", "lock-session"] },
  // The shell reloads itself on file changes; this reloads the compositor's config.
  { id: "reload", icon: "arrows-clockwise", color: "$green", tint: "$raised", confirm: false, label: "recarregar", command: ["hyprctl", "reload"] },
];

const armed = signal("");
let disarm: (() => void) | null = null;

function trigger(a: Action) {
  if (a.confirm && armed() !== a.id) {
    armed.set(a.id);
    disarm?.();
    disarm = after(3000, () => armed.set(""));
    return;
  }
  armed.set("");
  close();
  launch(a.command);
}

export default function Power() {
  const width = actions.length * SIZE + (actions.length - 1) * GAP + 32;
  return (
    <HangingPanel
      visible={shownAs("power", () => armed.set(""))}
      onDismiss={close}
      side="right"
      width={width}
      offset={22}
      barBottom={BAR_BOTTOM}
      padding={16}
      topPadding={26}
    >
      <Box gap={GAP}>
        {actions.map((a) => (
          <RoundButton
            key={a.id}
            icon={a.icon}
            color={a.color}
            tint={a.tint}
            armed={() => armed() === a.id}
            label={() => (armed() === a.id ? "de novo" : a.label)}
            size={SIZE}
            onClick={() => trigger(a)}
          />
        ))}
      </Box>
    </HangingPanel>
  );
}
