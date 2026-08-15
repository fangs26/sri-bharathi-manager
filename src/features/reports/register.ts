import type { BillView, Settings } from '@/data/types';
import { humanDate, monthLabel, periodLabel } from '@/domain/dates';
import { money } from '@/ui/format';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface RegisterRow {
  bill: BillView;
  tenantName: string;
  room: string;
}

/** A month's rent register, laid out for A4 landscape printing and filing. */
export function buildRegisterHtml({
  settings,
  monthKey,
  branchName,
  rows,
}: {
  settings: Settings;
  monthKey: string;
  branchName: string;
  rows: RegisterRow[];
}): string {
  const sorted = [...rows].sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }));
  const expected = sorted.reduce((s, r) => s + r.bill.total, 0);
  const collected = sorted.reduce((s, r) => s + r.bill.paid, 0);

  const body = sorted
    .map(
      (r, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td>${esc(r.tenantName)}</td>
      <td>${esc(r.room)}</td>
      <td>${esc(periodLabel(r.bill.periodStart, r.bill.periodEnd))}</td>
      <td class="r">${esc(money(r.bill.total))}</td>
      <td class="r">${r.bill.paid ? esc(money(r.bill.paid)) : '—'}</td>
      <td class="r ${r.bill.balance > 0 ? 'due' : ''}">${r.bill.balance > 0 ? esc(money(r.bill.balance)) : '—'}</td>
      <td class="c">${statusWord(r.bill)}</td>
      <td></td>
    </tr>`
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Rent register — ${esc(monthLabel(monthKey))}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { margin:0; font-family:'Segoe UI', system-ui, sans-serif; color:#241B15; }
  header { display:flex; justify-content:space-between; align-items:flex-end;
           border-bottom:2px solid #C2643F; padding-bottom:9px; margin-bottom:12px; }
  h1 { margin:0; font-size:17px; }
  .sub { font-size:11.5px; color:#7C6B5C; margin-top:2px; }
  .meta { text-align:right; font-size:11.5px; color:#7C6B5C; }
  .meta b { display:block; font-size:15px; color:#241B15; }
  table { width:100%; border-collapse:collapse; font-size:11.5px; }
  th { text-align:left; background:#F6ECDB; border-bottom:1px solid #E8DCC9; padding:6px 7px;
       font-size:10px; letter-spacing:.07em; text-transform:uppercase; color:#5c4c40; }
  td { padding:5.5px 7px; border-bottom:1px solid #F1E7D6; }
  .r { text-align:right; font-variant-numeric:tabular-nums; }
  .c { text-align:center; }
  .due { color:#A44C2C; font-weight:600; }
  tfoot td { border-top:2px solid #E8DCC9; font-weight:700; padding-top:8px; }
  footer { margin-top:14px; font-size:10.5px; color:#7C6B5C; display:flex; justify-content:space-between; }
</style></head>
<body>
  <header>
    <div>
      <h1>${esc(settings.hostelName)} — Rent register</h1>
      <div class="sub">${esc(branchName)} · ${esc(monthLabel(monthKey))}</div>
    </div>
    <div class="meta">
      Collected of expected
      <b>${esc(money(collected))} / ${esc(money(expected))}</b>
    </div>
  </header>
  <table>
    <thead><tr>
      <th class="c">#</th><th>Name</th><th>Room</th><th>Period</th>
      <th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th>
      <th class="c">Status</th><th>Signature</th>
    </tr></thead>
    <tbody>${body || '<tr><td colspan="9" class="c">No rent months in this period.</td></tr>'}</tbody>
    <tfoot><tr>
      <td colspan="4">Total — ${sorted.length} entries</td>
      <td class="r">${esc(money(expected))}</td>
      <td class="r">${esc(money(collected))}</td>
      <td class="r due">${esc(money(Math.max(0, expected - collected)))}</td>
      <td colspan="2"></td>
    </tr></tfoot>
  </table>
  <footer>
    <span>Printed ${esc(humanDate(new Date().toISOString().slice(0, 10)))}</span>
    <span>${esc(settings.phones.join(' · '))}</span>
  </footer>
</body></html>`;
}

function statusWord(bill: BillView): string {
  if (bill.balance <= 0) return 'Paid';
  if (bill.paid > 0) return 'Part';
  return bill.daysOverdue > 0 ? `${bill.daysOverdue}d late` : 'Due';
}
