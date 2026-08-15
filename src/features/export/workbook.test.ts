import { describe, expect, it } from 'vitest';
import { buildWorkbookSpec } from './workbook';
import { sampleData } from '@/data/seed';
import { computeBillView, planBills, sumBalance, worstStatus } from '@/domain/billing';
import type { BedView, BillView, Database, ID } from '@/data/types';

/** Rebuilds what the store derives, so the spec can be tested without React. */
function prepare() {
  const db: Database = sampleData();
  const tenantById = new Map(db.tenants.map((t) => [t.id, t]));
  const plan = planBills({
    stays: db.stays,
    existingBills: db.bills,
    existingItems: db.billItems,
    payments: db.payments,
    branchOf: (s) => tenantById.get(s.tenantId)?.branchId ?? '',
    presets: db.settings.chargePresets,
  });
  db.bills.push(...plan.bills);
  db.billItems.push(...plan.items);

  const billViews: BillView[] = db.bills.map((b) =>
    computeBillView(b, db.billItems, db.payments, { graceDays: db.settings.billing.graceDays })
  );

  const billsByTenant = new Map<ID, BillView[]>();
  for (const v of billViews) {
    const list = billsByTenant.get(v.tenantId) ?? [];
    list.push(v);
    billsByTenant.set(v.tenantId, list);
  }
  const balanceByTenant = new Map<ID, number>();
  for (const [id, list] of billsByTenant) balanceByTenant.set(id, sumBalance(list));

  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const openStayByBed = new Map(db.stays.filter((s) => !s.toDate).map((s) => [s.bedId, s]));
  const bedViews: BedView[] = db.beds.map((bed) => {
    const room = roomById.get(bed.roomId)!;
    const stay = openStayByBed.get(bed.id) ?? null;
    const tenant = stay ? tenantById.get(stay.tenantId) ?? null : null;
    const bills = tenant ? billsByTenant.get(tenant.id) ?? [] : [];
    return {
      bed,
      room,
      rent: bed.rent ?? room.defaultRent,
      stay,
      tenant,
      status: tenant ? worstStatus(bills) : ('vacant' as const),
      balance: tenant ? sumBalance(bills) : 0,
    };
  });

  return { db, billViews, bedViews, balanceByTenant };
}

describe('Excel workbook', () => {
  const input = prepare();
  const spec = buildWorkbookSpec(input);
  const sheet = (name: string) => spec.sheets.find((s) => s.name === name)!;

  it('splits the register into a tab per subject, plus one per branch', () => {
    const names = spec.sheets.map((s) => s.name);
    expect(names.slice(0, 5)).toEqual(['Summary', 'Girls', 'Rooms & Beds', 'Rent bills', 'Payments']);
    for (const branch of input.db.branches) expect(names).toContain(branch.name);
  });

  it('keeps every tab name legal for Excel', () => {
    for (const s of spec.sheets) {
      expect(s.name.length).toBeLessThanOrEqual(31);
      expect(s.name).not.toMatch(/[[\]:*?/\\]/);
    }
  });

  it('gives every row a value for every declared column', () => {
    for (const s of spec.sheets) {
      const keys = new Set(s.columns.map((c) => c.key));
      for (const row of s.rows) {
        for (const key of Object.keys(row)) expect(keys.has(key)).toBe(true);
      }
    }
  });

  it('lists every girl with her room, guardian and pending amount', () => {
    const girls = sheet('Girls');
    expect(girls.rows).toHaveLength(input.db.tenants.length);
    const headers = girls.columns.map((c) => c.header);
    expect(headers).toContain('Guardian phone');
    expect(headers).toContain('Company / college');
    expect(headers).toContain('Pending amount');
    expect(girls.rows[0].name).toBeTruthy();
  });

  it('lists every bed, occupied or not', () => {
    expect(sheet('Rooms & Beds').rows).toHaveLength(input.db.beds.length);
  });

  it('breaks each bill out into one column per kind of charge', () => {
    const bills = sheet('Rent bills');
    const headers = bills.columns.map((c) => c.header);
    for (const h of ['Rent', 'Mess / food', 'Laundry', 'Electricity', 'AC', 'Late fee', 'Damage', 'Other']) {
      expect(headers).toContain(h);
    }
    // Rent, extras and the total agree row by row.
    for (const row of bills.rows) {
      const parts =
        (row.rent as number) +
        (row.food as number) +
        (row.laundry as number) +
        (row.electricity as number) +
        (row.ac as number) +
        (row.late_fee as number) +
        (row.damage as number) +
        (row.other as number);
      expect((row.total as number) + (row.waived as number)).toBe(parts);
    }
  });

  it('totals the money columns', () => {
    const bills = sheet('Rent bills');
    expect(bills.totals!.total).toBe(bills.rows.reduce((s, r) => s + (r.total as number), 0));
    const summary = sheet('Summary');
    expect(summary.totals!.beds).toBe(input.db.beds.length);
  });

  it('marks money, date and percent columns so Excel formats them', () => {
    const girls = sheet('Girls');
    expect(girls.columns.find((c) => c.key === 'rent')!.format).toBe('money');
    expect(girls.columns.find((c) => c.key === 'joinDate')!.format).toBe('date');
    expect(sheet('Summary').columns.find((c) => c.key === 'occupancy')!.format).toBe('percent');
  });

  it('names the file with the date it was taken', () => {
    expect(spec.fileName).toMatch(/^Sri Bharathi register \d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
