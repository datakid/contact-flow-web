export function splitTokens(text: string): string[] {
  return text
    .split(/[,،]/)
    .map((part) => part.trim())
    .filter(Boolean);
}
