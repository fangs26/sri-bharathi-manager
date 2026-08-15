import { describe, expect, it } from 'vitest';
import { buildWorkbookSpec } from './workbook';
import { emptyDatabase } from '@/data/seed';
import type { BedView, BillView, Database, ID } from '@/data/types';

/**
 * The export runs over whatever state the hostel happens to be in — including
 * the awkward ones. These pin the edges that a happy-path test would miss.
 */

const bare = (over: Partial<Parameters<typeof buildWorkbookSpec>[0]> = {}) => ({
  db: emptyDatabase(),
  billViews: [] as BillView[],
  bedViews: [] as BedView[],
  balanceByTenant: new Map<ID, number>(),
  ...over,
});

describe('exporting an empty hostel', () => {
  const spec = buildWorkbookSpec(bare());

  it('still produces every tab rather than throwing', () => {
    expect(spec.sheets.length).toBeGreaterThanOrEqual(5);
    expect(spec.sheets.every((s) => s.columns.length > 0)).toBe(true);
  });

  it('leaves the tabs empty instead of inventing rows', () => {
    for (const s of spec.sheets) {
      if (s.name === 'Summary') continue; // the three branches always exist
      expect(s.rows).toHaveLength(0);
    }
  });
});

describe('branches with awkward names', () => {
  it('never emits two tabs with the same name', () => {
    const db: Database = emptyDatabase();
    db.branches = [
      { id: 'a', name: 'Summary', shortName: 'B1', address: '', phone: '', sortOrder: 1 },
      { id: 'b', name: 'Summary', shortName: 'B2', address: '', phone: '', sortOrder: 2 },
      { id: 'c', name: 'Payments', shortName: 'B3', address: '', phone: '', sortOrder: 3 },
    ];
    const names = buildWorkbookSpec(bare({ db })).sheets.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('strips characters Excel refuses and caps the length', () => {
    const db: Database = emptyDatabase();
    db.branches = [
      {
        id: 'a',
        name: 'Wing [A] / B: the very longest branch name anyone has ever typed',
        shortName: 'B1',
        address: '',
        phone: '',
        sortOrder: 1,
      },
    ];
    for (const s of buildWorkbookSpec(bare({ db })).sheets) {
      expect(s.name.length).toBeLessThanOrEqual(31);
      expect(s.name).not.toMatch(/[[\]:*?/\\]/);
      expect(s.name.length).toBeGreaterThan(0);
    }
  });
});

describe('a resident who has left', () => {
  it('is still listed, with her leaving date', () => {
    const db: Database = emptyDatabase();
    db.tenants.push({
      id: 't1',
      branchId: db.branches[0].id,
      fullName: 'Vacated Girl',
      phone: '9876543210',
      occupationType: 'work',
      joinDate: '2026-01-01',
      status: 'vacated',
      vacateDate: '2026-06-30',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const girls = buildWorkbookSpec(bare({ db })).sheets.find((s) => s.name === 'Girls')!;
    expect(girls.rows).toHaveLength(1);
    expect(girls.rows[0].status).toBe('Left');
    expect(girls.rows[0].vacateDate).toBe('2026-06-30');
    // No current bed, and that must not read as a missing value.
    expect(girls.rows[0].room).toBe('—');
    expect(girls.rows[0].rent).toBe(0);
  });
});

describe('missing optional details', () => {
  it('writes an empty string rather than "undefined"', () => {
    const db: Database = emptyDatabase();
    db.tenants.push({
      id: 't1',
      branchId: db.branches[0].id,
      fullName: 'Bare Minimum',
      phone: '',
      occupationType: 'other',
      joinDate: '2026-01-01',
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const girls = buildWorkbookSpec(bare({ db })).sheets.find((s) => s.name === 'Girls')!;
    const row = girls.rows[0];
    for (const [key, value] of Object.entries(row)) {
      expect(String(value), `column ${key}`).not.toMatch(/undefined|null|NaN/);
    }
  });
});

describe('totals', () => {
  it('never reports NaN for a money column', () => {
    const spec = buildWorkbookSpec(bare());
    for (const s of spec.sheets) {
      for (const [key, value] of Object.entries(s.totals ?? {})) {
        expect(Number.isFinite(value), `${s.name}.${key}`).toBe(true);
      }
    }
  });
});
