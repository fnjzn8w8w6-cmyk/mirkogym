/** Concatena classi CSS ignorando i valori falsy. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
