import { Icon } from "./Icon";

export interface SearchFieldProps {
  value: Bind<string>;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  autofocus?: boolean;
  size?: number;
}

/** A rounded search input with a magnifier. */
export function SearchField(p: SearchFieldProps) {
  const size = p.size ?? 15;
  return (
    <Box height={Math.round(size * 2.9)} padding={[0, 16]} gap={10} align="center" radius={999} bg="$sunken" border="$surfaceBorder">
      <Icon name="magnifying-glass" size={size + 1} color="$textFaint" />
      <Input
        value={p.value}
        placeholder={p.placeholder ?? "buscar…"}
        size={size}
        autofocus={p.autofocus}
        onChange={(e) => p.onChange(e.value)}
        onSubmit={(e) => p.onSubmit?.(e.value)}
      />
    </Box>
  );
}
