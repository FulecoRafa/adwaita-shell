// The top bar: logo, workspaces, apps, AI usage, CPU, tray, keyboard layout,
// status icons, agenda and clock. Panels hang from it.

import { AppTile } from "../components/AppTile";
import { AiChip } from "../components/AiChip";
import { Clock } from "../components/Clock";
import { Divider } from "../components/Divider";
import { Gauge } from "../components/Gauge";
import { StatusIcon } from "../components/StatusIcon";
import { Tag } from "../components/Tag";
import { Tray } from "../components/Tray";
import { Workspaces } from "../components/Workspaces";
import * as desktop from "../data/desktop";
import * as status from "../data/status";
import { openControl, panel, toggle } from "../data/shell";

const MARGIN = 8;
const HEIGHT = 48;
const GAP = 14;

function Logo() {
  return (
    <Box width={28} height={28} hoverOpacity={0.85} onClick={() => toggle("control")}>
      <Image src="asset:assets/nix-snowflake.svg" size={28} />
    </Box>
  );
}

function Apps() {
  const pinnedTile = (app: desktop.Pinned) => (
    <AppTile
      key={app.key}
      icon={app.icon}
      image={app.image}
      accent={app.color}
      running={() => desktop.windowsOf(app).length > 0}
      active={() => (app.panel ? panel() === app.panel : desktop.windowsOf(app).some((w) => w.focused))}
      onClick={() => desktop.activate(app)}
    />
  );
  const extraTile = (cls: string) => {
    const tui = cls.startsWith("fuleco.");
    return (
      <AppTile
        key={cls}
        image={tui ? "" : desktop.appIcon(cls)}
        icon={tui ? (desktop.tuiIcons[cls.slice(7)] ?? "terminal-window") : "app-window"}
        accent={tui ? "$green" : "$cyan"}
        running
        tooltip={cls}
        active={() => desktop.clients().some((c) => c.class === cls && c.focused)}
        onClick={() => desktop.activateClass(cls)}
      />
    );
  };
  // Which tiles exist changes rarely; window titles change all the time
  // (a terminal's spinner). The memo keeps the tiles from being rebuilt
  // on every title change: it only reports when the set of apps changes.
  const tiles = memo(() => ({ pins: desktop.pinned().map((p) => p.key), extra: desktop.extraApps() }));
  return (
    <Box gap={6} align="center">
      {() => {
        const { pins, extra } = tiles();
        const byKey = new Map(desktop.pinned().map((p) => [p.key, p]));
        const tile = (key: string) => pinnedTile(byKey.get(key)!);
        const fixed = pins.length - 2; // launcher and drawer go last
        return [...pins.slice(0, fixed).map(tile), ...extra.map(extraTile), ...pins.slice(fixed).map(tile)];
      }}
    </Box>
  );
}

function StatusIcons() {
  const netIcon = () => {
    const n = status.net();
    if (!n) return "wifi-slash";
    if (n.wired) return "network";
    if (!n.wifiEnabled || !n.online) return "wifi-slash";
    return n.strength > 0.66 ? "wifi-high" : n.strength > 0.33 ? "wifi-medium" : "wifi-low";
  };
  const btIcon = () => {
    const bt = status.net()?.bluetooth;
    return bt?.connected.length ? "bluetooth-connected" : bt?.enabled ? "bluetooth" : "bluetooth-slash";
  };
  const volumeIcon = () => {
    const a = status.audio();
    if (!a || a.muted) return "speaker-x";
    return a.volume > 0.66 ? "speaker-high" : a.volume > 0 ? "speaker-low" : "speaker-none";
  };
  const batteryIcon = () => {
    const b = status.battery();
    if (!b) return "battery-warning";
    if (b.charging) return "battery-charging";
    const p = b.percent;
    return p > 85 ? "battery-full" : p > 55 ? "battery-high" : p > 25 ? "battery-medium" : p > 10 ? "battery-low" : "battery-warning";
  };
  // Presence changes rarely; the values behind it change often.
  const hasBluetooth = memo(() => status.net()?.bluetooth.present ?? false);
  const hasBattery = memo(() => status.battery() !== null);
  const batteryColor = () => {
    const b = status.battery();
    if (!b || b.charging) return "$green";
    return b.percent <= 15 ? "$red" : b.percent <= 30 ? "$orange" : "$green";
  };
  return (
    <Box gap={14} align="center">
      <StatusIcon icon={netIcon} tint={() => (status.net()?.online ? "$cyan" : "$textMuted")} onClick={() => openControl("rede")} />
      {() =>
        hasBluetooth()
          ? <StatusIcon
              icon={btIcon}
              tint={() => (status.net()?.bluetooth.connected.length ? "$cyan" : "$textMuted")}
              onClick={() => openControl("rede")}
            />
          : null}
      <StatusIcon icon={volumeIcon} onClick={() => openControl("som")} onScroll={(e) => status.changeVolume(e.delta * 0.05)} />
      <StatusIcon
        icon={() => (status.notifications()?.dnd ? "bell-slash" : "bell")}
        tint={() => (panel() === "notifications" ? "$yellow" : "$textMuted")}
        badge={() => status.notifications()?.count ?? 0}
        onClick={() => toggle("notifications")}
      />
      {() => (hasBattery() ? <StatusIcon icon={batteryIcon} tint={batteryColor} onClick={() => toggle("drawer")} /> : null)}
    </Box>
  );
}

export default function Bar() {
  const hasEvents = memo(() => status.agendaToday() > 0);
  return (
    <Surface layer="top" anchor="top left right" height={MARGIN + HEIGHT} exclusive={MARGIN + HEIGHT}>
      <Box padding={[MARGIN, GAP, 0, GAP]} grow>
        <Box
          grow
          height={HEIGHT}
          radius={20}
          bg="$surface"
          border="$surfaceBorder"
          padding={[0, 14, 0, 12]}
          gap={14}
          align="center"
        >
          <Logo />
          <Workspaces
            count={desktop.workspaceCount}
            workspaces={desktop.workspaces}
            onSelect={desktop.switchTo}
            onScroll={desktop.cycleWorkspace}
          />
          <Divider />
          <Apps />
          <Box grow />
          <AiChip
            usage={status.ai}
            active={() => panel() === "ai"}
            onClick={() => {
              status.refreshAi();
              toggle("ai");
            }}
          />
          <Gauge value={status.cpu} onClick={() => desktop.launch(["ghostty", "-e", "btop"])} />
          <Tray />
          <Tag
            text={status.keyboardLayout}
            filled={() => status.keyboardLayout() === "intl"}
            onClick={status.toggleLayout}
          />
          <StatusIcons />
          <Divider />
          <Box gap={12} align="center">
            {() =>
              hasEvents()
                ? <Tag icon="calendar-dots" text={() => String(status.agendaToday())} accent="$purple" tint="$purpleTint" height={20} size={11} onClick={() => toggle("drawer")} />
                : null}
            <Clock now={() => ctx.now("minute")} onClick={() => toggle("power")} />
          </Box>
        </Box>
      </Box>
    </Surface>
  );
}
