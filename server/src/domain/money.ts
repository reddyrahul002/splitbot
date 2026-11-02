// Conversions between dollars and integer cents. Use these at every boundary.

/** Dollars → integer cents, rounding half away from zero. Float-safe: toCents(1.005) === 101. */
export function toCents(dollars: number): number {
  if (!Number.isFinite(dollars)) throw new RangeError(`Not a finite amount: ${dollars}`);
  // toFixed(6) strips binary float noise like 100.49999999999999 before rounding.
  const scaled = Number((Math.abs(dollars) * 100).toFixed(6));
  const cents = Math.round(scaled);
  // `cents !== 0` keeps tiny negatives like -0.001 from becoming -0.
  return dollars < 0 && cents !== 0 ? -cents : cents;
}

/** Integer cents → "$1,800.00" / "-$12.00". */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new RangeError(`Not a whole number of cents: ${cents}`);
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${cents < 0 ? '-' : ''}$${dollars}.${rest}`;
}
