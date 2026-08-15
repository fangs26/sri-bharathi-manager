import type { Bed, BillView, Branch, Payment, Room, Settings, Tenant } from '@/data/types';
import { bridge } from '@/data/adapter';
import { humanDate, periodLabel } from '@/domain/dates';
import { money } from '@/ui/format';

export interface ReceiptInput {
  settings: Settings;
  branch?: Branch;
  tenant: Tenant;
  payment: Payment;
  bill?: BillView | null;
  room?: Room | null;
  bed?: Bed | null;
  /** balance left on the bill after this payment */
  balanceAfter?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  other: 'Other',
};

/**
 * A self-contained A5 receipt, styled to match the hostel's letterhead.
 * Returned as a whole HTML document so it can be printed or turned into a PDF
 * by the main process without loading anything external.
 */
export function buildReceiptHtml(input: ReceiptInput): string {
  const { settings, branch, tenant, payment, bill, room, bed } = input;
  const lines = bill?.items ?? [];

  const itemRows = lines
    .map(
      (it) => `<tr>
        <td>${esc(it.label)}</td>
        <td class="r">${esc(money(it.amount))}</td>
      </tr>`
    )
    .join('');

  const balance = input.balanceAfter ?? bill?.balance ?? 0;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Receipt ${esc(payment.receiptNo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: 'Segoe UI', system-ui, sans-serif; color:#241B15; background:#fff; }
  .sheet { width: 170mm; margin: 0 auto; }
  .head { display:flex; justify-content:space-between; align-items:flex-start;
          border-bottom:2px solid #C2643F; padding-bottom:12px; }
  .mark { display:flex; gap:12px; align-items:center; }
  .badge { width:46px; height:46px; border-radius:12px; color:#fff; display:flex;
           align-items:center; justify-content:center; font:700 17px Georgia, serif;
           background:linear-gradient(135deg,#C2643F,#D9A441); }
  h1 { font-size:19px; margin:0; letter-spacing:-.3px; }
  .tag { font-size:11.5px; color:#7C6B5C; margin-top:2px; }
  .doc { text-align:right; }
  .doc b { display:block; font-size:12px; letter-spacing:.14em; text-transform:uppercase; color:#7C6B5C; }
  .doc .no { font-size:15px; font-weight:700; margin-top:3px; }
  .doc .dt { font-size:12px; color:#7C6B5C; margin-top:2px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin:18px 0 4px; }
  .box { border:1px solid #E8DCC9; border-radius:10px; padding:11px 13px; background:#FCF8F1; }
  .box h2 { margin:0 0 6px; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:#7C6B5C; }
  .box .big { font-size:14.5px; font-weight:600; }
  .box .sm { font-size:12px; color:#5c4c40; margin-top:2px; }
  table { width:100%; border-collapse:collapse; margin-top:16px; font-size:13px; }
  th { text-align:left; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
       color:#7C6B5C; border-bottom:1px solid #E8DCC9; padding:0 0 6px; }
  td { padding:7px 0; border-bottom:1px solid #F1E7D6; }
  .r { text-align:right; font-variant-numeric:tabular-nums; }
  .tot td { border:0; padding-top:10px; font-weight:600; }
  .paid { margin-top:16px; border-radius:12px; background:#E6ECDF; border:1px solid #cfdcc2;
          padding:13px 15px; display:flex; justify-content:space-between; align-items:center; }
  .paid .lbl { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#566145; }
  .paid .amt { font-size:23px; font-weight:700; color:#3d4a30; font-variant-numeric:tabular-nums; }
  .bal { margin-top:9px; font-size:12.5px; color:#7C6B5C; display:flex; justify-content:space-between; }
  .bal b { color:#A44C2C; font-variant-numeric:tabular-nums; }
  .sign { margin-top:34px; display:flex; justify-content:space-between; align-items:flex-end; }
  .sign div { border-top:1px solid #d8c8ae; padding-top:5px; font-size:11.5px; color:#7C6B5C; width:44%; }
  .sign .r2 { text-align:right; }
  footer { margin-top:22px; border-top:1px solid #E8DCC9; padding-top:9px;
           font-size:11px; color:#7C6B5C; text-align:center; }
</style></head>
<body><div class="sheet">
  <div class="head">
    <div class="mark">
      <div class="badge">SB</div>
      <div>
        <h1>${esc(settings.hostelName)}</h1>
        <div class="tag">${esc(branch ? `${branch.shortName} · ${branch.name}` : settings.tagline)}</div>
        <div class="tag">${esc(branch?.address ?? '')}</div>
        <div class="tag">${esc(settings.phones.join(' · '))}</div>
      </div>
    </div>
    <div class="doc">
      <b>Rent receipt</b>
      <div class="no">${esc(payment.receiptNo)}</div>
      <div class="dt">${esc(humanDate(payment.paidOn))}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h2>Received from</h2>
      <div class="big">${esc(tenant.fullName)}</div>
      <div class="sm">${esc(tenant.phone)}</div>
      ${room && bed ? `<div class="sm">Room ${esc(room.roomNo)} · Bed ${esc(bed.label)}${room.floor ? ` · ${esc(room.floor)}` : ''}</div>` : ''}
    </div>
    <div class="box">
      <h2>Towards</h2>
      <div class="big">${bill ? esc(periodLabel(bill.periodStart, bill.periodEnd)) : 'Payment on account'}</div>
      <div class="sm">Paid by ${esc(METHOD_LABEL[payment.method] ?? payment.method)}${payment.reference ? ` · ${esc(payment.reference)}` : ''}</div>
      ${payment.note ? `<div class="sm">${esc(payment.note)}</div>` : ''}
    </div>
  </div>

  ${
    lines.length
      ? `<table>
      <thead><tr><th>Charge</th><th class="r">Amount</th></tr></thead>
      <tbody>
        ${itemRows}
        ${bill?.waivedAmount ? `<tr><td>Waived</td><td class="r">− ${esc(money(bill.waivedAmount))}</td></tr>` : ''}
        <tr class="tot"><td>Total for the period</td><td class="r">${esc(money(bill?.total ?? payment.amount))}</td></tr>
      </tbody>
    </table>`
      : ''
  }

  <div class="paid">
    <span class="lbl">Amount received</span>
    <span class="amt">${esc(money(payment.amount))}</span>
  </div>
  ${balance > 0 ? `<div class="bal"><span>Balance still due</span><b>${esc(money(balance))}</b></div>` : ''}

  <div class="sign">
    <div>Tenant signature</div>
    <div class="r2">For ${esc(settings.hostelName)}</div>
  </div>

  <footer>${esc(settings.receiptFooter)}</footer>
</div></body></html>`;
}

/** Print on paper, or fall back to the browser's print dialog outside Electron. */
export async function printReceipt(html: string): Promise<void> {
  const api = bridge();
  if (api) {
    await api.print.paper(html);
    return;
  }
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}

export async function saveReceiptPdf(html: string, receiptNo: string): Promise<boolean> {
  const api = bridge();
  const name = `${receiptNo.replace(/[\\/]/g, '-')}.pdf`;
  if (api) {
    const res = await api.print.pdf(html, name);
    return res.ok;
  }
  await printReceipt(html); // browsers can "Save as PDF" from the print dialog
  return true;
}
