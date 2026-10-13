// Formatting shared by every surface. Dates are always Portuguese, lowercase
// and without dots ("seg 12 out"), like the reference shell.

const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthNames = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const pad = (n: number) => String(n).padStart(2, "0");

/** "21:39" */
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** "21:39:05" */
export const hms = (d: Date) => `${hm(d)}:${pad(d.getSeconds())}`;
/** "seg 12 out" */
export const shortDate = (d: Date) => `${weekdays[d.getDay()]} ${pad(d.getDate())} ${months[d.getMonth()]}`;
/** "outubro de 2026" */
export const monthTitle = (d: Date) => `${monthNames[d.getMonth()]} de ${d.getFullYear()}`;
export const weekdayInitials = ["d", "s", "t", "q", "q", "s", "s"];

/** "4h12" from seconds; "" when unknown. */
export function duration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h${pad(minutes % 60)}`;
}

/** Green below 50 %, orange below 85 %, red above. */
export function usageColor(percent: number): string {
  if (percent >= 85) return "$red";
  if (percent >= 50) return "$orange";
  return "$green";
}

/** "1,2 GiB" */
export const gib = (v: number) => `${v.toFixed(1).replace(".", ",")} GiB`;
