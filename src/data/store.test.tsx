// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { DbProvider, useDb } from './store';
import { ToastHost } from '@/ui/primitives';
import { addDays, today } from '@/domain/dates';

/**
 * Drives the store directly, without going through screens — these cover the
 * rules that live in actions rather than in the billing engine.
 */

type Ctx = ReturnType<typeof useDb>;

let ctx: Ctx;

function Probe() {
  const db = useDb();
  useEffect(() => {
    ctx = db;
  });
  ctx = db;
  return null;
}

async function boot() {
  render(
    <ToastHost>
      <DbProvider>
        <Probe />
      </DbProvider>
    </ToastHost>
  );
  await act(async () => {
    await Promise.resolve();
  });
}

/** Runs an action and lets React commit the result. */
async function run(fn: () => void) {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

async function setUpHostel() {
  const branchA = ctx.db.branches[0].id;
  const branchB = ctx.db.branches[1].id;
  await run(() =>
    ctx.addRoom(
      { branchId: branchA, roomNo: '101', floor: 'Ground floor', sharing: 2, hasAc: false, attachedBath: true, defaultRent: 6000 },
      2
    )
  );
  await run(() =>
    ctx.addRoom(
      { branchId: branchB, roomNo: '201', floor: 'Ground floor', sharing: 2, hasAc: true, attachedBath: true, defaultRent: 8500 },
      2
    )
  );
  const bedsA = ctx.bedViews.filter((v) => v.room.branchId === branchA);
  const bedsB = ctx.bedViews.filter((v) => v.room.branchId === branchB);
  return { branchA, branchB, bedsA, bedsB };
}

async function admit(bedId: string, branchId: string, over: Partial<Parameters<Ctx['admitTenant']>[1]> = {}) {
  let id = '';
  await run(() => {
    id = ctx.admitTenant(
      {
        branchId,
        fullName: 'Divya Sree',
        phone: '9876543210',
        occupationType: 'work',
        joinDate: addDays(today(), -40),
        status: 'active',
      },
      {
        bedId,
        fromDate: addDays(today(), -40),
        toDate: null,
        agreedRent: 6000,
        cycle: 'anniversary',
        prorateFirst: true,
        ...over,
      }
    ).id;
  });
  return id;
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('adding rooms', () => {
  it('creates the beds along with the room', async () => {
    await boot();
    const { bedsA } = await setUpHostel();
    expect(bedsA).toHaveLength(2);
    expect(bedsA.map((b) => b.bed.label)).toEqual(['A', 'B']);
    expect(bedsA[0].rent).toBe(6000);
  });

  it('refuses to delete a room somebody is living in', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    await admit(bedsA[0].bed.id, branchA);
    const res = ctx.deleteRoom(bedsA[0].room.id);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/still staying/i);
  });
});

describe('vacating', () => {
  it('keeps the bed hers until the leaving date has passed', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);

    const leavingDay = addDays(today(), 7);
    await run(() => ctx.vacateTenant(tenantId, leavingDay));

    // Still in her bed, and shown as on notice rather than gone.
    const view = ctx.bedViews.find((v) => v.bed.id === bedsA[0].bed.id)!;
    expect(view.tenant?.id).toBe(tenantId);
    expect(ctx.db.tenants.find((t) => t.id === tenantId)!.status).toBe('notice');
    expect(ctx.deleteBed(bedsA[0].bed.id).ok).toBe(false);
  });

  it('leaves the bed hers on her final day', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);

    // She is charged for today and sleeps here tonight; the bed frees tomorrow.
    await run(() => ctx.vacateTenant(tenantId, today()));

    expect(ctx.bedViews.find((v) => v.bed.id === bedsA[0].bed.id)!.tenant?.id).toBe(tenantId);
    expect(ctx.db.tenants.find((t) => t.id === tenantId)!.status).toBe('notice');
  });

  it('frees the bed once her last day has passed', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);

    await run(() => ctx.vacateTenant(tenantId, addDays(today(), -1)));

    expect(ctx.bedViews.find((v) => v.bed.id === bedsA[0].bed.id)!.tenant).toBe(null);
    expect(ctx.db.tenants.find((t) => t.id === tenantId)!.status).toBe('vacated');
    expect(ctx.deleteBed(bedsA[0].bed.id).ok).toBe(true);
  });
});

describe('moving rooms', () => {
  it('files her under the branch she moved to', async () => {
    await boot();
    const { branchA, branchB, bedsA, bedsB } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);

    await run(() => ctx.moveTenant(tenantId, bedsB[0].bed.id, today(), 8500));

    const tenant = ctx.db.tenants.find((t) => t.id === tenantId)!;
    expect(tenant.branchId).toBe(branchB);
    expect(ctx.bedViews.find((v) => v.bed.id === bedsA[0].bed.id)!.tenant).toBe(null);
    expect(ctx.bedViews.find((v) => v.bed.id === bedsB[0].bed.id)!.tenant?.id).toBe(tenantId);
    expect(ctx.currentStayOf(tenantId)!.agreedRent).toBe(8500);
  });

  it('never ends the old stay before it began', async () => {
    await boot();
    const { branchA, bedsA, bedsB } = await setUpHostel();
    const joinDay = today();
    let tenantId = '';
    await run(() => {
      tenantId = ctx.admitTenant(
        { branchId: branchA, fullName: 'Same Day Move', phone: '9', occupationType: 'work', joinDate: joinDay, status: 'active' },
        { bedId: bedsA[0].bed.id, fromDate: joinDay, toDate: null, agreedRent: 6000, cycle: 'anniversary', prorateFirst: true }
      ).id;
    });

    await run(() => ctx.moveTenant(tenantId, bedsB[0].bed.id, joinDay));

    const old = ctx.db.stays.find((s) => s.tenantId === tenantId && s.endedReason === 'moved')!;
    expect(old.toDate! >= old.fromDate).toBe(true);
  });
});

describe('receipts', () => {
  it('never issues the same receipt number twice, even back to back', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);

    const receipts: string[] = [];
    await run(() => {
      // Two payments inside one tick — the state from the first has not been
      // rendered yet when the second is taken.
      receipts.push(ctx.recordPayment({ billId: null, tenantId, amount: 1000, paidOn: today(), method: 'cash' }).receiptNo);
      receipts.push(ctx.recordPayment({ billId: null, tenantId, amount: 2000, paidOn: today(), method: 'upi' }).receiptNo);
    });

    expect(new Set(receipts).size).toBe(2);
    expect(ctx.db.payments).toHaveLength(2);
    expect(ctx.db.settings.lastReceiptSeq).toBe(2);
    expect(receipts[0]).toMatch(/^SBH\/\d{4}-\d{2}\/0001$/);
    expect(receipts[1]).toMatch(/^SBH\/\d{4}-\d{2}\/0002$/);
  });

  it('reduces what she owes when money comes in', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);

    const owedBefore = ctx.balanceByTenant.get(tenantId)!;
    expect(owedBefore).toBeGreaterThan(0);

    const bill = ctx.billsByTenant.get(tenantId)![0];
    await run(() => {
      ctx.recordPayment({ billId: bill.id, tenantId, amount: 1000, paidOn: today(), method: 'cash' });
    });

    const after = ctx.billViewsById.get(bill.id)!;
    expect(ctx.balanceByTenant.get(tenantId)).toBe(owedBefore - 1000);
    expect(after.paid).toBe(1000);
    expect(after.balance).toBe(after.total - 1000);
    // She joined weeks ago, so the more urgent 'overdue' wins over 'partial'.
    expect(after.status).toBe('overdue');
  });
});

describe('extra charges', () => {
  it('adds to the month and to what she owes', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);
    const bill = ctx.billsByTenant.get(tenantId)![0];
    const before = ctx.billViewsById.get(bill.id)!.total;

    await run(() => ctx.addCharge(bill.id, 'food', 'Mess / food', 2500));

    expect(ctx.billViewsById.get(bill.id)!.total).toBe(before + 2500);
  });
});

describe('branch details', () => {
  it('edits a branch without disturbing anything else', async () => {
    await boot();
    const { branchA, bedsA } = await setUpHostel();
    const tenantId = await admit(bedsA[0].bed.id, branchA);
    const billsBefore = ctx.db.bills.length;

    await run(() => ctx.updateBranch(branchA, { name: 'Branch 1 Main' }));

    expect(ctx.db.branches.find((b) => b.id === branchA)!.name).toBe('Branch 1 Main');
    expect(ctx.db.bills).toHaveLength(billsBefore);
    expect(ctx.db.tenants.find((t) => t.id === tenantId)).toBeTruthy();
  });
});
