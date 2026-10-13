// Components run once; a prop is either a plain value or a function that
// returns it (a signal is such a function). These keep static props static,
// so a binding exists only where something can change.

export const read = <T,>(v: Bind<T>): T =>
  typeof v === "function" ? (v as () => T)() : v;

export const map = <T, U>(v: Bind<T>, f: (value: T) => U): Bind<U> =>
  typeof v === "function" ? () => f((v as () => T)()) : f(v);
