import { describe, expect, it } from 'vitest';
import type { Bill, BillItem, ChargePreset, Payment, Stay } from '@/data/types';
import { computeBillView, nextDueDate, periodsFor, planBills, rentForPeriod } from './billing';
import { addMonthsClamped, financialYear, humanDate } from './dates';

function makeStay(over: Partial<Stay> = {}): Stay {
  return {
    id: 'stay1',
    tenantId: 't1',
    bedId: 'b1',
    fromDate: '2026-01-12',
    toDate: null,
    agreedRent: 6000,
    cycle: 'anniversary',
    prorateFirst: false,
    createdAt: '2026-01-12T00:00:00.000Z',
    ...over,
  };
}

const noPresets: ChargePreset[] = [];

describe('date maths', () => {
  it('keeps the day of month across short months', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    // measured from the anchor, so the 31st comes back rather than sticking at 28
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2024-01-31', 1)).toBe('2024-02-29'); // leap year
  });

  it('formats Indian financial years for receipt numbers', () => {
    expect(financialYear('2026-08-12')).toBe('2026-27');
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(humanDate('2026-08-12')).toBe('12 Aug 2026');
  });
});

describe('anniversary cycle', () => {
  it('runs join-date to the day before the next join-date', () => {
    const p = periodsFor(makeStay(), '2026-04-01');
    expect(p.map((x) => [x.start, x.end])).toEqual([
      ['2026-01-12', '2026-02-11'],
      ['2026-02-12', '2026-03-11'],
      ['2026-03-12', '2026-04-11'],
    ]);
    expect(p.every((x) => x.due === x.start)).toBe(true); // rent in advance
  });

  it('handles a 31st join date without losing the 31st', () => {
    const p = periodsFor(makeStay({ fromDate: '2026-01-31' }), '2026-04-01');
    expect(p.map((x) => x.start)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('charges full rent for every whole period', () => {
    const stay = makeStay();
    for (const p of periodsFor(stay, '2026-04-01')) {
      expect(rentForPeriod(stay, p)).toBe(6000);
    }
  });

  it('does not bill a period that has not started yet', () => {
    expect(periodsFor(makeStay(), '2026-01-11')).toHaveLength(0);
    expect(periodsFor(makeStay(), '2026-01-12')).toHaveLength(1);
  });
});

describe('fixed-date cycle', () => {
  const stay = makeStay({
    cycle: 'fixed_date',
    anchorDay: 5,
    fromDate: '2026-01-20',
    prorateFirst: true,
  });

  it('bills a part-month stub then falls into the common date', () => {
    const p = periodsFor(stay, '2026-03-01');
    expect(p.map((x) => [x.start, x.end])).toEqual([
      ['2026-01-20', '2026-02-04'],
      ['2026-02-05', '2026-03-04'],
    ]);
  });

  it('prorates the stub on days actually stayed', () => {
    const [stub, full] = periodsFor(stay, '2026-03-01');
    // 16 of the cycle's 31 days
    expect(rentForPeriod(stay, stub)).toBe(Math.round((6000 * 16) / 31));
    expect(rentForPeriod(stay, full)).toBe(6000);
  });

  it('charges the stub in full when proration is off', () => {
    const noProrate = { ...stay, prorateFirst: false };
    const [stub] = periodsFor(noProrate, '2026-03-01');
    expect(rentForPeriod(noProrate, stub)).toBe(6000);
  });

  it('skips the stub when she joins exactly on the billing date', () => {
    const onDate = { ...stay, fromDate: '2026-01-05' };
    const p = periodsFor(onDate, '2026-02-01');
    expect(p.map((x) => [x.start, x.end])).toEqual([['2026-01-05', '2026-02-04']]);
    expect(rentForPeriod(onDate, p[0])).toBe(6000);
  });
});

describe('vacating', () => {
  it('always prorates the final part-period', () => {
    const stay = makeStay({ toDate: '2026-03-20' });
    const p = periodsFor(stay, '2026-05-01');
    expect(p.map((x) => [x.start, x.end])).toEqual([
      ['2026-01-12', '2026-02-11'],
      ['2026-02-12', '2026-03-11'],
      ['2026-03-12', '2026-03-20'],
    ]);
    expect(rentForPeriod(stay, p[2])).toBe(Math.round((6000 * 9) / 31));
  });

  it('stops billing after she has gone', () => {
    const stay = makeStay({ toDate: '2026-02-11' });
    expect(periodsFor(stay, '2026-12-01').map((x) => x.start)).toEqual(['2026-01-12']);
  });
});

describe('short stay', () => {
  it('accrues a single growing bill at the daily rate', () => {
    const stay = makeStay({ cycle: 'short_stay', fromDate: '2026-08-01', dailyRate: 400 });
    const p = periodsFor(stay, '2026-08-10');
    expect(p).toHaveLength(1);
    expect(rentForPeriod(stay, p[0])).toBe(4000); // 10 nights inclusive
  });
});

describe('nextDueDate', () => {
  it('points at the next period start', () => {
    expect(nextDueDate(makeStay(), '2026-02-20')).toBe('2026-03-12');
    expect(nextDueDate(makeStay(), '2026-03-12')).toBe('2026-03-12');
  });
  it('returns nothing once the stay is over', () => {
    expect(nextDueDate(makeStay({ toDate: '2026-02-11' }), '2026-05-01')).toBe(null);
  });
});

describe('planBills', () => {
  const base = {
    stays: [makeStay()],
    existingBills: [] as Bill[],
    existingItems: [] as BillItem[],
    payments: [] as Payment[],
    branchOf: () => 'br1',
    presets: noPresets,
    upTo: '2026-03-15',
  };

  it('creates one bill per started period with a rent line', () => {
    const res = planBills(base);
    expect(res.bills).toHaveLength(3);
    expect(res.items.filter((i) => i.type === 'rent')).toHaveLength(3);
    expect(res.items.every((i) => i.amount === 6000)).toBe(true);
  });

  it('is idempotent — running it again creates nothing', () => {
    const first = planBills(base);
    const second = planBills({
      ...base,
      existingBills: first.bills,
      existingItems: first.items,
    });
    expect(second.bills).toHaveLength(0);
    expect(second.items).toHaveLength(0);
    expect(second.updatedItems).toHaveLength(0);
  });

  it('adds automatic charge presets to each new bill', () => {
    const res = planBills({
      ...base,
      presets: [{ id: 'p1', label: 'Mess', type: 'food', amount: 2500, auto: true }],
    });
    expect(res.items.filter((i) => i.type === 'food')).toHaveLength(3);
  });

  it('corrects the last bill when she vacates mid-period', () => {
    const first = planBills(base);
    const vacated = makeStay({ toDate: '2026-03-20' });
    const second = planBills({
      ...base,
      stays: [vacated],
      existingBills: first.bills,
      existingItems: first.items,
      upTo: '2026-03-25',
    });
    expect(second.bills).toHaveLength(0);
    expect(second.updatedItems).toHaveLength(1);
    expect(second.updatedItems[0].amount).toBe(Math.round((6000 * 9) / 31));
  });

  it('never rewrites a settled bill below what was already paid', () => {
    const first = planBills(base);
    const lastBill = first.bills[2];
    const second = planBills({
      ...base,
      stays: [makeStay({ toDate: '2026-03-20' })],
      existingBills: first.bills,
      existingItems: first.items,
      payments: [
        {
          id: 'pay1',
          billId: lastBill.id,
          tenantId: 't1',
          branchId: 'br1',
          amount: 6000,
          paidOn: '2026-03-12',
          method: 'cash',
          receiptNo: 'R1',
          createdAt: '2026-03-12T00:00:00.000Z',
        },
      ],
      upTo: '2026-03-25',
    });
    expect(second.updatedItems).toHaveLength(0);
  });
});

describe('bill status', () => {
  const bill: Bill = {
    id: 'bill1',
    stayId: 'stay1',
    tenantId: 't1',
    branchId: 'br1',
    periodStart: '2026-08-01',
    periodEnd: '2026-08-31',
    dueDate: '2026-08-01',
    createdAt: '2026-08-01T00:00:00.000Z',
  };
  const items: BillItem[] = [
    { id: 'i1', billId: 'bill1', type: 'rent', label: 'Room rent', amount: 6000 },
    { id: 'i2', billId: 'bill1', type: 'food', label: 'Mess', amount: 2500 },
  ];
  const pay = (amount: number): Payment => ({
    id: `p${amount}`,
    billId: 'bill1',
    tenantId: 't1',
    branchId: 'br1',
    amount,
    paidOn: '2026-08-03',
    method: 'upi',
    receiptNo: 'R1',
    createdAt: '2026-08-03T00:00:00.000Z',
  });

  it('totals rent plus extras', () => {
    const v = computeBillView(bill, items, [], { today: '2026-08-01' });
    expect(v.total).toBe(8500);
    expect(v.status).toBe('due');
  });

  it('tracks a part payment as a balance, not a tick', () => {
    const v = computeBillView(bill, items, [pay(3000)], { today: '2026-08-02', graceDays: 5 });
    expect(v.paid).toBe(3000);
    expect(v.balance).toBe(5500);
    expect(v.status).toBe('partial');
  });

  it('adds up several payments and settles the bill', () => {
    const v = computeBillView(bill, items, [pay(3000), pay(5500)], { today: '2026-08-20' });
    expect(v.balance).toBe(0);
    expect(v.status).toBe('paid');
  });

  it('goes overdue only after the grace days', () => {
    const inGrace = computeBillView(bill, items, [], { today: '2026-08-05', graceDays: 5 });
    expect(inGrace.status).toBe('due');
    const late = computeBillView(bill, items, [], { today: '2026-08-09', graceDays: 5 });
    expect(late.status).toBe('overdue');
    expect(late.daysOverdue).toBe(3);
  });

  it('honours a written-off balance', () => {
    const v = computeBillView({ ...bill, waivedAmount: 8500 }, items, [], { today: '2026-09-30' });
    expect(v.balance).toBe(0);
    expect(v.status).toBe('waived');
  });
});
