// @vitest-environment jsdom
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { DbProvider, useDb } from './store';
import { ToastHost } from '@/ui/primitives';
import { addDays, today } from '@/domain/dates';

/**
 * The awkward cases: money that does not divide neatly, someone leaving and
 * coming back, corrections after the fact.
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

async function run(fn: () => void) {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

async function hostelWithOneGirl(rent = 6000) {
  const branchId = ctx.db.branches[0].id;
  await run(() =>
    ctx.addRoom(
      { branchId, roomNo: '101', floor: 'Ground floor', sharing: 2, hasAc: false, attachedBath: true, defaultRent: rent },
      2
    )
  );
  const beds = ctx.bedViews.filter((v) => v.room.branchId === branchId);
  let tenantId = '';
  await run(() => {
    tenantId = ctx.admitTenant(
      {
        branchId,
        fullName: 'Test Resident',
        phone: '9876543210',
        occupationType: 'work',
        joinDate: addDays(today(), -40),
        status: 'active',
      },
      {
        bedId: beds[0].bed.id,
        fromDate: addDays(today(), -40),
        toDate: null,
        agreedRent: rent,
        cycle: 'anniversary',
        prorateFirst: true,
      }
    ).id;
  });
  return { tenantId, branchId, beds };
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('corrections', () => {
  it('puts the money back when a payment is deleted', async () => {
    await boot();
    const { tenantId } = await hostelWithOneGirl();
    const bill = ctx.billsByTenant.get(tenantId)![0];
    const owed = ctx.balanceByTenant.get(tenantId)!;

    let payId = '';
    await run(() => {
      payId = ctx.recordPayment({ billId: bill.id, tenantId, amount: 2000, paidOn: today(), method: 'cash' }).id;
    });
    expect(ctx.balanceByTenant.get(tenantId)).toBe(owed - 2000);

    await run(() => ctx.deletePayment(payId));
    expect(ctx.balanceByTenant.get(tenantId)).toBe(owed);
    expect(ctx.db.payments).toHaveLength(0);
  });

  it('records who did what in the audit log', async () => {
    await boot();
    const { tenantId } = await hostelWithOneGirl();
    const bill = ctx.billsByTenant.get(tenantId)![0];
    await run(() => {
      ctx.recordPayment({ billId: bill.id, tenantId, amount: 500, paidOn: today(), method: 'cash' });
    });
    const entry = ctx.db.auditLog.find((e) => e.action === 'received payment');
    expect(entry).toBeTruthy();
    expect(entry!.detail).toContain('500');
  });
});

describe('writing off a balance', () => {
  it('clears what is owed without inventing a payment', async () => {
    await boot();
    const { tenantId } = await hostelWithOneGirl();
    const bill = ctx.billsByTenant.get(tenantId)![0];

    await run(() => ctx.waiveBill(bill.id, bill.balance, 'Goodwill'));

    expect(ctx.billViewsById.get(bill.id)!.balance).toBe(0);
    expect(ctx.db.payments).toHaveLength(0);
  });

  it('handles a write-off on top of a part payment', async () => {
    await boot();
    const { tenantId } = await hostelWithOneGirl();
    const bill = ctx.billsByTenant.get(tenantId)![0];
    await run(() => {
      ctx.recordPayment({ billId: bill.id, tenantId, amount: 1000, paidOn: today(), method: 'cash' });
    });
    const left = ctx.billViewsById.get(bill.id)!.balance;
    await run(() => ctx.waiveBill(bill.id, left, 'Rest written off'));

    const view = ctx.billViewsById.get(bill.id)!;
    expect(view.balance).toBe(0);
    expect(view.paid).toBe(1000);
    expect(view.status).toBe('paid');
  });
});

describe('overpayment', () => {
  it('does not leave a negative balance on the bill', async () => {
    await boot();
    const { tenantId } = await hostelWithOneGirl();
    const bill = ctx.billsByTenant.get(tenantId)![0];

    await run(() => {
      ctx.recordPayment({ billId: bill.id, tenantId, amount: bill.total + 5000, paidOn: today(), method: 'cash' });
    });

    const view = ctx.billViewsById.get(bill.id)!;
    expect(view.status).toBe('paid');
    // What she owes overall must never read as a negative amount owed.
    expect(ctx.balanceByTenant.get(tenantId)!).toBeGreaterThanOrEqual(0);
  });
});

describe('leaving and coming back', () => {
  it('frees the bed and lets someone else take it', async () => {
    await boot();
    const { tenantId, branchId, beds } = await hostelWithOneGirl();
    await run(() => ctx.vacateTenant(tenantId, addDays(today(), -1)));
    expect(ctx.bedViews.find((v) => v.bed.id === beds[0].bed.id)!.tenant).toBe(null);

    let secondId = '';
    await run(() => {
      secondId = ctx.admitTenant(
        { branchId, fullName: 'Next Resident', phone: '9', occupationType: 'work', joinDate: today(), status: 'active' },
        { bedId: beds[0].bed.id, fromDate: today(), toDate: null, agreedRent: 6000, cycle: 'anniversary', prorateFirst: true }
      ).id;
    });

    const view = ctx.bedViews.find((v) => v.bed.id === beds[0].bed.id)!;
    expect(view.tenant!.id).toBe(secondId);
    // The first resident's history survives her leaving.
    expect(ctx.db.tenants.find((t) => t.id === tenantId)).toBeTruthy();
    expect(ctx.billsByTenant.get(tenantId)!.length).toBeGreaterThan(0);
  });

  it('does not keep billing her after she has gone', async () => {
    await boot();
    const { tenantId } = await hostelWithOneGirl();
    await run(() => ctx.vacateTenant(tenantId, addDays(today(), -1)));
    const billsAfterLeaving = ctx.billsByTenant.get(tenantId)!.length;

    await run(() => ctx.runBillGeneration());
    expect(ctx.billsByTenant.get(tenantId)!.length).toBe(billsAfterLeaving);
  });
});

describe('generation is safe to repeat', () => {
  it('adds nothing when run again', async () => {
    await boot();
    await hostelWithOneGirl();
    const before = ctx.db.bills.length;
    await run(() => ctx.runBillGeneration());
    await run(() => ctx.runBillGeneration());
    expect(ctx.db.bills.length).toBe(before);
  });
});

describe('rooms and beds', () => {
  it('refuses to remove a bed that is occupied, and allows it once free', async () => {
    await boot();
    const { tenantId, beds } = await hostelWithOneGirl();
    expect(ctx.deleteBed(beds[0].bed.id).ok).toBe(false);
    await run(() => ctx.vacateTenant(tenantId, addDays(today(), -1)));
    expect(ctx.deleteBed(beds[0].bed.id).ok).toBe(true);
  });

  it('keeps her agreed rent when the room default later changes', async () => {
    await boot();
    const { tenantId, beds } = await hostelWithOneGirl(6000);
    await run(() => ctx.updateRoom(beds[0].room.id, { defaultRent: 9000 }));
    expect(ctx.currentStayOf(tenantId)!.agreedRent).toBe(6000);
  });
});
