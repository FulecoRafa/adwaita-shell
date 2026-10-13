// Control center (the logo, or the network, bluetooth and volume icons):
// hangs from the bar on the left, with the tabs rede / som / sistema and the
// volume and microphone always at hand.

import { ActionButton } from "@kit/components/ActionButton";
import { Chip } from "@kit/components/Chip";
import { DisclosureRow } from "@kit/components/DisclosureRow";
import { HangingPanel } from "@kit/components/HangingPanel";
import { Icon } from "@kit/components/Icon";
import { LevelRow, Meter } from "@kit/components/Meter";
import { SectionTitle } from "@kit/components/SectionTitle";
import { SelectRow } from "@kit/components/SelectRow";
import { ToggleCard } from "@kit/components/ToggleCard";
import { hm, shortDate } from "@kit/lib/format";
import * as control from "../data/control";
import { setPowerProfile, powerProfile, type Profile } from "../data/drawer";
import * as notifications from "../data/notifications";
import { close, controlTab, panel, shownAs } from "../data/shell";
import { launch } from "../data/desktop";
import * as status from "../data/status";

const BAR_BOTTOM = 56;
const WIDTH = 420;
const PAD = 20;
const INNER = WIDTH - 2 * PAD;
const MAX_NETWORKS = 24;

// The open row of the network/bluetooth lists ("wifi:<ssid>", "bt:<address>"),
// and what is typed in it. Kept here, not in the rows: the lists are rebuilt
// on every scan, mid-typing.
const expanded = signal("");
const draft = signal("");
const reveal = signal(false);
const wifiError = signal("");
const connecting = signal("");

function expand(key: string) {
  expanded.update((k) => (k === key ? "" : key));
  draft.set("");
  reveal.set(false);
  wifiError.set("");
}

function terminal(app: string) {
  launch(["ghostty", `--class=fuleco.${app}`, "-e", app]);
  close();
}

const wifiIcon = (strength: number) => (strength > 0.66 ? "wifi-high" : strength > 0.33 ? "wifi-medium" : "wifi-low");

function Header() {
  const now = () => ctx.now("minute");
  return (
    <Box gap={10} align="center">
      <Label text="central de controle" size={15} color="$textBright" />
      <Box grow />
      <Label text={() => `${hm(now())} · ${shortDate(now())}`} size={11} color="$textFaint" />
      {/* Settings = the nix-config repository, in Zed. */}
      <Box hoverOpacity={0.7} tooltip="configurações" onClick={() => {
        close();
        launch(["zeditor", `${ctx.home}/Documents/Dev/nix-config`]);
      }}>
        <Icon name="gear-six" size={16} color="$textMuted" />
      </Box>
    </Box>
  );
}

function Tabs() {
  return (
    <Box gap={6}>
      {["rede", "som", "sistema"].map((tab) => (
        <Chip key={tab} label={tab} active={() => controlTab() === tab} onClick={() => controlTab.set(tab)} />
      ))}
    </Box>
  );
}

/** A list that grows up to `max` px, then scrolls. */
function ScrollList(p: { max: number; children?: Child }) {
  return <Box direction="column" gap={4} maxHeight={p.max} scroll>{p.children}</Box>;
}

function Ghost(p: { text: Bind<string> }) {
  return <Box padding={[0, 12]}><Label text={p.text} size={11} color="$textGhost" /></Box>;
}

/** What a closed row shows; rows are rebuilt only when this changes. */
interface WifiRowData {
  ssid: string;
  icon: string;
  secure: boolean;
  connected: boolean;
  known: boolean;
}

function WifiRow(p: { row: WifiRowData }) {
  const { ssid, connected, known } = p.row;
  const key = `wifi:${ssid}`;
  const needsPassword = p.row.secure && !known && !connected;
  const busy = () => connecting() === ssid;
  const connect = () => {
    wifiError.set("");
    if (needsPassword && draft().length < 8) return wifiError.set("a senha precisa de ao menos 8 caracteres");
    connecting.set(ssid);
    control.connectWifi(ssid, needsPassword ? draft() : null, (error) => {
      connecting.set("");
      if (error) wifiError.set(error);
      else expanded.set("");
    });
  };
  // Live values, read only while the row is open.
  const details = () => {
    const n = control.wifiNetworks().find((x) => x.ssid === ssid);
    if (!n) return "";
    return [`sinal ${Math.round(n.strength * 100)}%`, n.security, connected ? (status.net()?.ip ?? "") : ""].filter((s) => s !== "").join(" · ");
  };
  return (
    <DisclosureRow
      icon={p.row.icon}
      iconColor={connected ? "$green" : "$textMuted"}
      label={ssid}
      secure={p.row.secure}
      strong={connected}
      open={() => expanded() === key}
      trailing={() => (busy() ? "conectando…" : connected ? "conectado" : known ? "salva" : "")}
      trailingColor={() => (busy() ? "$yellow" : connected ? "$green" : "$textFaint")}
      onToggle={() => expand(key)}
    >
      <Label text={details} size={11} color="$textFaint" />
      {needsPassword
        ? <Box height={34} padding={[0, 10, 0, 12]} gap={8} align="center" radius={12} bg="$sunken" border="$surfaceBorder">
            <Input value={draft} placeholder="senha da rede" size={12} color="$textBright" secret={() => !reveal()} autofocus onChange={(e) => draft.set(e.value)} onSubmit={connect} />
            <Box hoverOpacity={0.7} onClick={() => reveal.update((r) => !r)}>
              <Icon name={() => (reveal() ? "eye-slash" : "eye")} size={15} color="$textFaint" />
            </Box>
          </Box>
        : null}
      {() => (wifiError() ? <Label text={wifiError} size={11} color="$red" wrap /> : null)}
      <Box gap={6}>
        {connected
          ? <ActionButton label="desconectar" onClick={() => control.disconnectWifi(ssid)} />
          : <ActionButton label={() => (busy() ? "conectando…" : "conectar")} primary accent="$yellow" onClick={() => !busy() && connect()} />}
        {known
          ? <ActionButton label="esquecer" accent="$red" onClick={() => {
              control.forgetWifi(ssid);
              expanded.set("");
            }} />
          : null}
      </Box>
    </DisclosureRow>
  );
}

function BluetoothRow(p: { device: control.BluetoothDevice }) {
  const d = p.device;
  const key = `bt:${d.address}`;
  const act = (a: control.BluetoothAction) => () => control.bluetoothAction(a, d.address);
  const details = [d.address, d.trusted ? "confiável" : "", d.battery >= 0 ? `bateria ${d.battery}%` : ""].filter((s) => s !== "").join(" · ");
  return (
    <DisclosureRow
      icon={d.connected ? "bluetooth-connected" : "bluetooth"}
      iconColor={d.connected ? "$cyan" : "$textMuted"}
      label={d.name}
      strong={d.connected}
      open={() => expanded() === key}
      trailing={d.battery >= 0 ? `${d.battery}%` : d.connected ? "conectado" : d.paired ? "pareado" : "novo"}
      trailingColor={d.connected ? "$cyan" : "$textFaint"}
      onToggle={() => expand(key)}
    >
      <Label text={details} size={11} color="$textFaint" />
      <Box gap={6}>
        {!d.paired ? <ActionButton label="parear" primary accent="$cyan" onClick={act("pair")} /> : null}
        {d.paired && !d.connected ? <ActionButton label="conectar" primary accent="$cyan" onClick={act("connect")} /> : null}
        {d.connected ? <ActionButton label="desconectar" onClick={act("disconnect")} /> : null}
        {d.paired
          ? <ActionButton label="esquecer" accent="$red" onClick={() => {
              control.bluetoothAction("forget", d.address);
              expanded.set("");
            }} />
          : null}
      </Box>
    </DisclosureRow>
  );
}

function NetworkTab() {
  const net = status.net;
  const wifiOn = memo(() => net()?.wifiEnabled ?? false);
  const btOn = memo(() => net()?.bluetooth.enabled ?? false);
  const btIcon = () => {
    const b = net()?.bluetooth;
    return b?.connected.length ? "bluetooth-connected" : b?.enabled ? "bluetooth" : "bluetooth-slash";
  };
  const wifiDetail = () => {
    const n = net();
    if (!n?.wifiEnabled) return "desligado";
    if (n.ssid) return `${n.ssid} · ${Math.round(n.strength * 100)}%`;
    return n.wired ? "cabo conectado" : "sem rede";
  };
  const btDetail = () => {
    const b = net()?.bluetooth;
    if (!b?.enabled) return "desligado";
    return b.connected.length === 1 ? "1 conectado" : `${b.connected.length} conectados`;
  };
  // Strength changes on every scan; rows only show its bucket, so they are
  // rebuilt only when a bucket, a connection or a saved network changes.
  const rows = memo((): WifiRowData[] =>
    control.wifiNetworks().map((n) => ({ ssid: n.ssid, icon: wifiIcon(n.strength), secure: n.secure, connected: n.connected, known: n.known })),
  );
  const bt = memo(() => control.bluetooth());
  return (
    <Box direction="column" gap={16}>
      <Box gap={10}>
        <ToggleCard
          icon={() => (wifiOn() ? (net()?.wired ? "network" : wifiIcon(net()?.strength ?? 0)) : "wifi-slash")}
          label="wi-fi"
          detail={wifiDetail}
          checked={wifiOn}
          onToggle={control.setWifi}
        />
        <ToggleCard icon={btIcon} label="bluetooth" detail={btDetail} checked={btOn} onToggle={control.setBluetooth} />
      </Box>
      {() =>
        wifiOn()
          ? <Box direction="column" gap={8}>
              <SectionTitle label={() => `redes wi-fi · ${rows().length}`} action="mais configurações ↗" onAction={() => terminal("wifitui")} />
              {() => {
                const list = rows();
                if (list.length === 0) return <Ghost text="procurando redes…" />;
                // The weakest ones past MAX_NETWORKS are left to wifitui: a crowded
                // building lists dozens, and each row costs a render.
                return <ScrollList max={260}>{list.slice(0, MAX_NETWORKS).map((r) => <WifiRow key={r.ssid} row={r} />)}</ScrollList>;
              }}
            </Box>
          : null}
      {() =>
        btOn()
          ? <Box direction="column" gap={8}>
              <SectionTitle
                label="bluetooth"
                action={() => (bt().discovering ? "parar busca" : "procurar")}
                onAction={() => control.discover(!bt().discovering)}
              />
              {() => {
                const { devices, discovering } = bt();
                if (devices.length === 0) return <Ghost text={discovering ? "procurando dispositivos…" : "nenhum dispositivo pareado · procurar para parear"} />;
                return <ScrollList max={180}>{devices.map((d) => <BluetoothRow key={JSON.stringify(d)} device={d} />)}</ScrollList>;
              }}
            </Box>
          : null}
      {() => (!wifiOn() && !btOn() ? <Ghost text="rádios desligados" /> : null)}
    </Box>
  );
}

function SoundTab() {
  const devices = memo(() => control.audioDevices());
  const rows = (list: control.AudioDevice[], icon: (d: control.AudioDevice) => string) =>
    list.map((d) => (
      <SelectRow
        key={`${d.id}|${d.default}`}
        icon={icon(d)}
        label={d.name}
        selected={d.default}
        trailing={d.default ? "padrão" : ""}
        onClick={() => control.setDefaultDevice(d.id)}
      />
    ));
  return (
    <Box direction="column" gap={8}>
      <SectionTitle label="saída" action="wiremix ↗" onAction={() => terminal("wiremix")} />
      {() => rows(devices().sinks, (d) => (d.headphones ? "headphones" : "speaker-high"))}
      <Box height={6} />
      <SectionTitle label="entrada" />
      {() => rows(devices().sources, () => "microphone")}
    </Box>
  );
}

const profiles: { label: string; profile: Profile }[] = [
  { label: "economia", profile: "power-saver" },
  { label: "equilíbrio", profile: "balanced" },
  { label: "desempenho", profile: "performance" },
];
const caffeineSpans = [
  { label: "30 min", minutes: 30 },
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "∞", minutes: 0 },
];

function SystemTab() {
  const caffeine = control.caffeine;
  const hasBrightness = memo(() => control.brightness() !== null);
  const shortcut = (icon: string, label: string, run: () => void) => (
    <Box grow height={38} radius={14} bg="$raised" hoverBg="$track" gap={8} align="center" justify="center" onClick={run}>
      <Icon name={icon} size={15} color="$textMuted" />
      <Label text={label} size={11} color="$text" />
    </Box>
  );
  return (
    <Box direction="column" gap={12}>
      <SectionTitle label="perfil de energia" />
      <Box gap={6}>
        {profiles.map((p) => (
          <Chip key={p.profile} label={p.label} size={11} active={() => powerProfile() === p.profile} onClick={() => setPowerProfile(p.profile)} />
        ))}
      </Box>
      <Box gap={10}>
        <ToggleCard
          icon="coffee"
          label="cafeína"
          detail={() => {
            const c = caffeine();
            if (!c.on) return "suspensão normal";
            return c.until > 0 ? `acesa até ${hm(new Date(c.until))}` : "sempre acesa";
          }}
          checked={() => caffeine().on}
          accent="$orange"
          onToggle={(on) => (on ? control.setCaffeine(0) : control.caffeineOff())}
        />
        <ToggleCard
          icon={() => (notifications.dnd() ? "bell-slash" : "bell-simple")}
          label="não perturbe"
          detail={() => (notifications.dnd() ? "popups silenciados" : "popups ativos")}
          checked={notifications.dnd}
          accent="$purple"
          onToggle={notifications.setDnd}
        />
      </Box>
      {/* How long caffeine lasts: turns it on right away. */}
      <Box gap={6} align="center">
        <Icon name="timer" size={15} color={() => (caffeine().on ? "$orange" : "$textFaint")} />
        <Label text="cafeína por" size={11} color="$textFaint" />
        <Box grow />
        {caffeineSpans.map((s) => {
          const active = () => caffeine().on && caffeine().minutes === s.minutes;
          return <Chip key={s.label} label={s.label} size={11} active={active} onClick={() => (active() ? control.caffeineOff() : control.setCaffeine(s.minutes))} />;
        })}
      </Box>
      {() =>
        hasBrightness()
          ? <LevelRow icon="sun-dim" value={() => control.brightness() ?? 0} accent="$cyan" onChange={control.setBrightness} />
          : null}
      <Box gap={8}>
        {shortcut("monitor", "monitores", () => {
          close();
          launch(["quickshell", "-c", "fuleco", "ipc", "call", "monitors", "toggle"]);
        })}
        {shortcut("chart-line", "btop", () => terminal("btop"))}
        {shortcut("calendar-dots", "calcure", () => terminal("calcure"))}
      </Box>
    </Box>
  );
}

const streamAccents = ["$cyan", "$purple", "$green", "$orange"];
function streamIcon(app: string) {
  const name = app.toLowerCase();
  if (name.includes("mpv") || name.includes("spotify")) return "music-notes";
  if (name.includes("helium") || name.includes("chrom") || name.includes("firefox")) return "compass";
  if (name.includes("discord")) return "chat-circle";
  return "waveform";
}

function Volumes() {
  const audio = status.audio;
  const muted = () => audio()?.muted ?? false;
  const micMuted = () => audio()?.micMuted ?? false;
  const streams = memo(() => control.audioDevices().streams.map((s) => ({ id: s.id, app: s.app })));
  const volumeOf = (id: number) => control.audioDevices().streams.find((s) => s.id === id)?.volume ?? 0;
  return (
    <Box direction="column" gap={12}>
      <LevelRow
        icon={() => {
          const v = audio()?.volume ?? 0;
          return muted() ? "speaker-slash" : v > 0.5 ? "speaker-high" : v > 0 ? "speaker-low" : "speaker-none";
        }}
        iconColor={() => (muted() ? "$textGhost" : "$text")}
        onIcon={status.toggleMute}
        value={() => audio()?.volume ?? 0}
        accent={() => (muted() ? "$dim" : "$yellow")}
        onChange={control.setVolume}
      />
      <LevelRow
        icon={() => (micMuted() ? "microphone-slash" : "microphone")}
        iconColor={() => (micMuted() ? "$textGhost" : "$textMuted")}
        onIcon={control.toggleMicMute}
        value={() => audio()?.micVolume ?? 0}
        accent={() => (micMuted() ? "$dim" : "$cyan")}
        onChange={control.setMicVolume}
      />
      {() => {
        const list = streams();
        if (list.length === 0) return null;
        return (
          <Box direction="column" gap={10} padding={12} radius={16} bg="$raisedAlt">
            <Label text="por aplicativo" size={11} color="$textFaint" />
            {list.map((s, i) => {
              const accent = streamAccents[i % streamAccents.length];
              return (
                <Box key={s.id} gap={10} align="center">
                  <Icon name={streamIcon(s.app)} size={15} color={accent} />
                  <Box width={52}><Label text={s.app.toLowerCase()} size={11} color="$textMuted" maxWidth={52} /></Box>
                  <Meter value={() => volumeOf(s.id)} accent={accent} track="$track" thickness={6} onChange={(v) => control.setStreamVolume(s.id, v)} />
                </Box>
              );
            })}
          </Box>
        );
      }}
    </Box>
  );
}

export default function ControlCenter() {
  const visible = shownAs(
    "control",
    () => {
      expanded.set("");
      control.scanWifi();
    },
    // Discovery stops with the panel, like the reference (a no-op when off).
    () => control.discover(false),
  );
  return (
    <HangingPanel visible={visible} onDismiss={close} width={WIDTH} offset={120} barBottom={BAR_BOTTOM} padding={PAD}>
      <Box direction="column" gap={16} width={INNER}>
        <Header />
        <Tabs />
        {() => {
          const tab = controlTab();
          return tab === "som" ? <SoundTab /> : tab === "sistema" ? <SystemTab /> : <NetworkTab />;
        }}
        <Box height={1} bg="$raised" />
        <Volumes />
        <Box gap={8} align="center" hoverOpacity={0.8} onClick={() => panel.set("drawer")}>
          <Icon name="lightning" size={13} color="$green" />
          <Label
            text={() => (status.battery() ? "energia e bateria agora vivem na gaveta de widgets" : "mais controles na gaveta de widgets")}
            size={11}
            color="$textMuted"
          />
        </Box>
      </Box>
    </HangingPanel>
  );
}
