// Data and actions of the control center: networks, bluetooth devices, audio
// devices and streams, brightness, caffeine. Lazy like the rest: a surface
// needs only the capabilities of what it reads.

export interface WifiNetwork {
  ssid: string;
  /** 0..1 */
  strength: number;
  /** "wpa2", "wpa3", "aberta"... */
  security: string;
  secure: boolean;
  connected: boolean;
  /** NetworkManager has a saved connection for it. */
  known: boolean;
}
export const wifiNetworks = () => use("network").subscribe<WifiNetwork[]>("wifi")() ?? [];
export const setWifi = (enabled: boolean) => use("network").call("set_wifi", { enabled });
export const scanWifi = () => use("network").call("scan");
/** `done` gets "" on success or why it failed ("senha incorreta"). */
export function connectWifi(ssid: string, password: string | null, done: (error: string) => void) {
  use("network").call<string>("connect", password ? { ssid, password } : { ssid }, (r) => done(r.ok ? r.value : r.error));
}
export const disconnectWifi = (ssid: string) => use("network").call("disconnect", { ssid });
export const forgetWifi = (ssid: string) => use("network").call("forget", { ssid });

export interface BluetoothDevice {
  address: string;
  name: string;
  paired: boolean;
  connected: boolean;
  trusted: boolean;
  /** 0..100, -1 when the device does not report it. */
  battery: number;
}
export interface Bluetooth {
  discovering: boolean;
  devices: BluetoothDevice[];
}
export const bluetooth = () => use("network").subscribe<Bluetooth>("bluetooth")() ?? { discovering: false, devices: [] };
export const setBluetooth = (enabled: boolean) => use("network").call("set_bluetooth", { enabled });
export const discover = (on: boolean) => use("network").call("discover", { on });
export type BluetoothAction = "connect" | "disconnect" | "pair" | "cancel" | "forget";
export const bluetoothAction = (action: BluetoothAction, address: string) => use("network").call("bt", { action, address });

export interface AudioDevice {
  id: number;
  name: string;
  headphones: boolean;
  default: boolean;
}
export interface Stream {
  id: number;
  app: string;
  volume: number;
}
export interface AudioDevices {
  sinks: AudioDevice[];
  sources: AudioDevice[];
  streams: Stream[];
}
export const audioDevices = () => use("audio").subscribe<AudioDevices>("devices")() ?? { sinks: [], sources: [], streams: [] };
export const setDefaultDevice = (id: number) => use("audio").call("set_default", { id });
export const setVolume = (value: number) => use("audio").call("set", { value });
export const setMicVolume = (value: number) => use("audio").call("set_mic", { value });
export const toggleMicMute = () => use("audio").call("toggle_mic_mute");
export const setStreamVolume = (id: number, value: number) => use("audio").call("set_stream", { id, value });

/** `null` when the screen has no backlight. */
export const brightness = () => use("brightness").subscribe<{ value: number }>("state")()?.value ?? null;
export const setBrightness = (value: number) => use("brightness").call("set", { value });

export interface Caffeine {
  on: boolean;
  /** Epoch ms when it ends; 0 = until turned off. */
  until: number;
  minutes: number;
}
export const caffeine = () => use("power").subscribe<Caffeine>("caffeine")() ?? { on: false, until: 0, minutes: 0 };
/** 0 minutes: until turned off. */
export const setCaffeine = (minutes: number) => use("power").call("caffeine", { minutes });
export const caffeineOff = () => use("power").call("caffeine_off");
