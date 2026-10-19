/** Shell command that sets the guest terminal size, clamped to 1..1000 columns and rows. */
export function sttyCommand(cols: number, rows: number): string {
  const clamp = (n: number) => Math.min(1000, Math.max(1, Math.floor(n)))
  return `stty cols ${clamp(cols)} rows ${clamp(rows)}\n`
}
