import { openExternal } from '@/data/adapter';
import { waNumber } from '@/ui/format';

/** Replaces {name}, {amount}, … in a message template. Unknown keys are left alone. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole
  );
}

/** Opens WhatsApp (desktop app or web) with the message pre-typed, ready to send. */
export async function openWhatsApp(phone: string, message: string): Promise<void> {
  const number = waNumber(phone);
  if (!number || number.length < 10) return;
  await openExternal(`https://wa.me/${number}?text=${encodeURIComponent(message)}`);
}

export async function callPhone(phone: string): Promise<void> {
  await openExternal(`tel:${phone.replace(/\s/g, '')}`);
}
