const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹12,34,567 — Indian digit grouping. */
export function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${inr.format(Math.abs(Math.round(n)))}`;
}

/** ₹1.2L / ₹45k — for headline tiles where the exact rupee doesn't matter. */
export function moneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (abs >= 100_000) return `₹${(n / 100_000).toFixed(1).replace(/\.0$/, '')}L`;
  if (abs >= 10_000) return `₹${Math.round(n / 1000)}k`;
  return money(n);
}

/** Digits only, with the Indian country code, ready for a wa.me link. */
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
  return digits;
}

export function prettyPhone(phone: string): string {
  const d = phone.replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
