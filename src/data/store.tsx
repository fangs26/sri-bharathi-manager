import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  Bed,
  Bill,
  BillItem,
  BillView,
  BedView,
  Branch,
  ChargeType,
  Database,
  DateStr,
  ID,
  Payment,
  PaymentMethod,
  Room,
  Settings,
  Stay,
  Tenant,
} from './types';
import { LocalAdapter, type StorageAdapter } from './adapter';
import { addSamplePayments, emptyDatabase, sampleData } from './seed';
import { computeBillView, planBills, sumBalance, worstStatus } from '@/domain/billing';
import { financialYear, today as todayStr } from '@/domain/dates';
import { isCurrentStay } from '@/domain/stays';

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/* ------------------------------------------------------------- context */

interface DbContext {
  db: Database;
  ready: boolean;
  actor: string;
  saving: boolean;

  /* rooms & beds */
  addRoom(input: Omit<Room, 'id'>, bedCount: number): Room;
  updateRoom(id: ID, patch: Partial<Room>): void;
  deleteRoom(id: ID): { ok: boolean; error?: string };
  addBeds(roomId: ID, count: number): void;
  updateBed(id: ID, patch: Partial<Bed>): void;
  deleteBed(id: ID): { ok: boolean; error?: string };
  updateBranch(id: ID, patch: Partial<Branch>): void;

  /* tenants */
  admitTenant(tenant: Omit<Tenant, 'id' | 'createdAt'>, stay: Omit<Stay, 'id' | 'tenantId' | 'createdAt'>): Tenant;
  updateTenant(id: ID, patch: Partial<Tenant>): void;
  moveTenant(tenantId: ID, toBedId: ID, from: DateStr, newRent?: number): void;
  vacateTenant(tenantId: ID, on: DateStr): void;
  deleteTenant(id: ID): void;

  /* billing */
  runBillGeneration(): number;
  addCharge(billId: ID, type: ChargeType, label: string, amount: number): void;
  removeCharge(itemId: ID): void;
  waiveBill(billId: ID, amount: number, note?: string): void;
  recordPayment(input: {
    billId: ID | null;
    tenantId: ID;
    amount: number;
    paidOn: DateStr;
    method: PaymentMethod;
    reference?: string;
    note?: string;
  }): Payment;
  deletePayment(id: ID): void;

  /* settings & data */
  updateSettings(patch: Partial<Settings>): void;
  replaceDatabase(next: Database): void;
  loadSampleData(): void;
  resetAll(): void;

  /* derived */
  billViews: BillView[];
  billViewsById: Map<ID, BillView>;
  billsByTenant: Map<ID, BillView[]>;
  balanceByTenant: Map<ID, number>;
  bedViews: BedView[];
  bedViewsByBranch: Map<ID, BedView[]>;
  currentStayOf(tenantId: ID): Stay | null;
  tenantOfBed(bedId: ID): Tenant | null;
}

const Ctx = createContext<DbContext | null>(null);

/** One shared instance — a fresh adapter per render would re-trigger the load effect forever. */
const defaultAdapter = new LocalAdapter();

export function useDb(): DbContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDb must be used inside <DbProvider>');
  return ctx;
}

/* ------------------------------------------------------------ provider */

export function DbProvider({
  children,
  adapter = defaultAdapter,
  actor = 'Owner',
}: {
  children: ReactNode;
  adapter?: StorageAdapter;
  actor?: string;
}) {
  const [db, setDb] = useState<Database>(() => emptyDatabase());
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const receiptSeq = useRef(0);
  const latest = useRef(db);
  latest.current = db;

  // Load once, then top up any bills that came due while the app was closed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = (await adapter.load()) ?? emptyDatabase();
      if (cancelled) return;
      setDb(loaded.settings.billing.autoGenerate ? withGeneratedBills(loaded) : loaded);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  // Debounced persist — typing in a form shouldn't hit the disk on every key.
  const persist = useCallback(
    (next: Database) => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      setSaving(true);
      saveTimer.current = window.setTimeout(async () => {
        await adapter.save(next);
        setSaving(false);
      }, 250);
    },
    [adapter]
  );

  const mutate = useCallback(
    (fn: (draft: Database) => void) => {
      setDb((prev) => {
        const next: Database = structuredClone(prev);
        fn(next);
        next.updatedAt = new Date().toISOString();
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const log = (draft: Database, action: string, entity: string, entityId: ID, detail?: string) => {
    draft.auditLog.unshift({
      id: uid('log'),
      at: new Date().toISOString(),
      actor,
      action,
      entity,
      entityId,
      detail,
    });
    if (draft.auditLog.length > 2000) draft.auditLog.length = 2000;
  };

  /* ----------------------------------------------------- rooms & beds */

  const addRoom = useCallback<DbContext['addRoom']>(
    (input, bedCount) => {
      const room: Room = { ...input, id: uid('room') };
      mutate((d) => {
        d.rooms.push(room);
        for (let i = 0; i < bedCount; i++) {
          d.beds.push({ id: uid('bed'), roomId: room.id, label: String.fromCharCode(65 + i), rent: null });
        }
        log(d, 'created', 'room', room.id, `Room ${room.roomNo} with ${bedCount} beds`);
      });
      return room;
    },
    [mutate]
  );

  const updateRoom = useCallback<DbContext['updateRoom']>(
    (id, patch) =>
      mutate((d) => {
        const r = d.rooms.find((x) => x.id === id);
        if (r) Object.assign(r, patch);
      }),
    [mutate]
  );

  const deleteRoom = useCallback<DbContext['deleteRoom']>(
    (id) => {
      const bedIds = latest.current.beds.filter((b) => b.roomId === id).map((b) => b.id);
      const occupied = latest.current.stays.some((s) => isCurrentStay(s) && bedIds.includes(s.bedId));
      if (occupied) return { ok: false, error: 'Someone is still staying in this room. Move or vacate her first.' };
      mutate((d) => {
        d.rooms = d.rooms.filter((r) => r.id !== id);
        d.beds = d.beds.filter((b) => b.roomId !== id);
        log(d, 'deleted', 'room', id);
      });
      return { ok: true };
    },
    [mutate]
  );

  const addBeds = useCallback<DbContext['addBeds']>(
    (roomId, count) =>
      mutate((d) => {
        const existing = d.beds.filter((b) => b.roomId === roomId).length;
        for (let i = 0; i < count; i++) {
          d.beds.push({
            id: uid('bed'),
            roomId,
            label: String.fromCharCode(65 + existing + i),
            rent: null,
          });
        }
        log(d, 'added beds', 'room', roomId, `${count} bed(s)`);
      }),
    [mutate]
  );

  const updateBed = useCallback<DbContext['updateBed']>(
    (id, patch) =>
      mutate((d) => {
        const b = d.beds.find((x) => x.id === id);
        if (b) Object.assign(b, patch);
      }),
    [mutate]
  );

  const deleteBed = useCallback<DbContext['deleteBed']>(
    (id) => {
      if (latest.current.stays.some((s) => isCurrentStay(s) && s.bedId === id))
        return { ok: false, error: 'This bed is occupied.' };
      mutate((d) => {
        d.beds = d.beds.filter((b) => b.id !== id);
        log(d, 'deleted', 'bed', id);
      });
      return { ok: true };
    },
    [mutate]
  );

  const updateBranch = useCallback<DbContext['updateBranch']>(
    (id, patch) =>
      mutate((d) => {
        const b = d.branches.find((x) => x.id === id);
        if (b) Object.assign(b, patch);
      }),
    [mutate]
  );

  /* ---------------------------------------------------------- tenants */

  const admitTenant = useCallback<DbContext['admitTenant']>(
    (tenant, stay) => {
      const t: Tenant = { ...tenant, id: uid('tenant'), createdAt: new Date().toISOString() };
      mutate((d) => {
        d.tenants.push(t);
        d.stays.push({ ...stay, id: uid('stay'), tenantId: t.id, createdAt: new Date().toISOString() });
        log(d, 'admitted', 'tenant', t.id, t.fullName);
        regenerate(d);
      });
      return t;
    },
    [mutate]
  );

  const updateTenant = useCallback<DbContext['updateTenant']>(
    (id, patch) =>
      mutate((d) => {
        const t = d.tenants.find((x) => x.id === id);
        if (t) Object.assign(t, patch);
      }),
    [mutate]
  );

  const moveTenant = useCallback<DbContext['moveTenant']>(
    (tenantId, toBedId, from, newRent) =>
      mutate((d) => {
        const current = d.stays.find((s) => s.tenantId === tenantId && isCurrentStay(s));
        if (!current) return;
        // Close the old stay the day before the move so nothing double-bills.
        // Moving on her very first day would otherwise end the stay before it
        // began, so it is clamped to a same-day stay instead.
        const previousEnd = shiftBack(from);
        current.toDate = previousEnd < current.fromDate ? current.fromDate : previousEnd;
        current.endedReason = 'moved';

        // Follow the bed across branches, or she stays filed under the old one.
        const newRoom = d.rooms.find((r) => r.id === d.beds.find((b) => b.id === toBedId)?.roomId);
        const tenant = d.tenants.find((t) => t.id === tenantId);
        if (newRoom && tenant) tenant.branchId = newRoom.branchId;

        d.stays.push({
          id: uid('stay'),
          tenantId,
          bedId: toBedId,
          fromDate: from,
          toDate: null,
          agreedRent: newRent ?? current.agreedRent,
          cycle: current.cycle,
          anchorDay: current.anchorDay,
          dailyRate: current.dailyRate,
          prorateFirst: true,
          createdAt: new Date().toISOString(),
        });
        log(d, 'moved room', 'tenant', tenantId);
        regenerate(d);
      }),
    [mutate]
  );

  const vacateTenant = useCallback<DbContext['vacateTenant']>(
    (tenantId, on) =>
      mutate((d) => {
        const stay = d.stays.find((s) => s.tenantId === tenantId && isCurrentStay(s));
        if (stay) {
          stay.toDate = on;
          stay.endedReason = 'vacated';
        }
        const t = d.tenants.find((x) => x.id === tenantId);
        if (t) {
          t.vacateDate = on;
          // She is only "left" once her last day is behind us — on the day
          // itself she is still here, and the bed is still hers. This matches
          // when the bed actually frees up, so the two can never disagree.
          t.status = on < todayStr() ? 'vacated' : 'notice';
          if (t.status === 'notice') t.noticeDate = todayStr();
        }
        log(d, 'vacated', 'tenant', tenantId, on);
        regenerate(d);
      }),
    [mutate]
  );

  const deleteTenant = useCallback<DbContext['deleteTenant']>(
    (id) =>
      mutate((d) => {
        const stayIds = d.stays.filter((s) => s.tenantId === id).map((s) => s.id);
        const billIds = d.bills.filter((b) => stayIds.includes(b.stayId)).map((b) => b.id);
        d.billItems = d.billItems.filter((i) => !billIds.includes(i.billId));
        d.bills = d.bills.filter((b) => !billIds.includes(b.id));
        d.payments = d.payments.filter((p) => p.tenantId !== id);
        d.stays = d.stays.filter((s) => s.tenantId !== id);
        d.tenants = d.tenants.filter((t) => t.id !== id);
        log(d, 'deleted', 'tenant', id);
      }),
    [mutate]
  );

  /* ---------------------------------------------------------- billing */

  const runBillGeneration = useCallback<DbContext['runBillGeneration']>(() => {
    let created = 0;
    mutate((d) => {
      created = regenerate(d);
      if (created) log(d, 'generated bills', 'billing', 'all', `${created} bill(s)`);
    });
    return created;
  }, [mutate]);

  const addCharge = useCallback<DbContext['addCharge']>(
    (billId, type, label, amount) =>
      mutate((d) => {
        d.billItems.push({ id: uid('item'), billId, type, label, amount });
        log(d, 'added charge', 'bill', billId, `${label} ₹${amount}`);
      }),
    [mutate]
  );

  const removeCharge = useCallback<DbContext['removeCharge']>(
    (itemId) =>
      mutate((d) => {
        const item = d.billItems.find((i) => i.id === itemId);
        d.billItems = d.billItems.filter((i) => i.id !== itemId);
        if (item) log(d, 'removed charge', 'bill', item.billId, item.label);
      }),
    [mutate]
  );

  const waiveBill = useCallback<DbContext['waiveBill']>(
    (billId, amount, note) =>
      mutate((d) => {
        const b = d.bills.find((x) => x.id === billId);
        if (!b) return;
        b.waivedAmount = amount;
        if (note) b.note = note;
        log(d, 'waived', 'bill', billId, `₹${amount}`);
      }),
    [mutate]
  );

  const recordPayment = useCallback<DbContext['recordPayment']>(
    (input) => {
      const d0 = latest.current;
      const branchId =
        d0.tenants.find((t) => t.id === input.tenantId)?.branchId ?? d0.branches[0]?.id ?? '';

      // The counter is bumped through a ref as well as through state. Rendered
      // state lags a moment behind, so two payments entered back to back would
      // otherwise both read the same number and print the same receipt.
      const seq = Math.max(d0.settings.lastReceiptSeq, receiptSeq.current) + 1;
      receiptSeq.current = seq;

      const receiptNo = `${d0.settings.receiptPrefix}/${financialYear(input.paidOn)}/${String(seq).padStart(4, '0')}`;
      const payment: Payment = {
        id: uid('pay'),
        billId: input.billId,
        tenantId: input.tenantId,
        branchId,
        amount: input.amount,
        paidOn: input.paidOn,
        method: input.method,
        reference: input.reference,
        note: input.note,
        receiptNo,
        recordedBy: actor,
        createdAt: new Date().toISOString(),
      };
      mutate((d) => {
        // Guard against a duplicate insert if this ever runs twice.
        if (d.payments.some((p) => p.id === payment.id)) return;
        d.payments.push(payment);
        d.settings.lastReceiptSeq = Math.max(d.settings.lastReceiptSeq, seq);
        log(d, 'received payment', 'tenant', input.tenantId, `₹${input.amount} · ${receiptNo}`);
      });
      return payment;
    },
    [mutate, actor]
  );

  const deletePayment = useCallback<DbContext['deletePayment']>(
    (id) =>
      mutate((d) => {
        const p = d.payments.find((x) => x.id === id);
        d.payments = d.payments.filter((x) => x.id !== id);
        if (p) log(d, 'deleted payment', 'tenant', p.tenantId, `₹${p.amount} · ${p.receiptNo}`);
      }),
    [mutate]
  );

  /* --------------------------------------------------- settings & data */

  const updateSettings = useCallback<DbContext['updateSettings']>(
    (patch) => {
      // Setting the counter by hand in Settings must actually take effect, so
      // the in-session guard follows it rather than holding the old high mark.
      if (patch.lastReceiptSeq !== undefined) receiptSeq.current = patch.lastReceiptSeq;
      mutate((d) => {
        d.settings = { ...d.settings, ...patch };
      });
    },
    [mutate]
  );

  const replaceDatabase = useCallback<DbContext['replaceDatabase']>(
    (next) => {
      const prepared = next.settings.billing.autoGenerate ? withGeneratedBills(next) : next;
      // A restored backup brings its own receipt counter with it.
      receiptSeq.current = prepared.settings.lastReceiptSeq;
      setDb(prepared);
      persist(prepared);
    },
    [persist]
  );

  // Bills have to exist before they can be paid, so generation runs first and
  // the sample payments are laid on top.
  const loadSampleData = useCallback(
    () => replaceDatabase(addSamplePayments(withGeneratedBills(sampleData()))),
    [replaceDatabase]
  );
  const resetAll = useCallback(() => replaceDatabase(emptyDatabase()), [replaceDatabase]);

  /* --------------------------------------------------------- derived */

  const today = todayStr();
  const grace = db.settings.billing.graceDays;

  const billViews = useMemo(
    () => db.bills.map((b) => computeBillView(b, db.billItems, db.payments, { today, graceDays: grace })),
    [db.bills, db.billItems, db.payments, today, grace]
  );

  const billViewsById = useMemo(() => new Map(billViews.map((v) => [v.id, v])), [billViews]);

  const billsByTenant = useMemo(() => {
    const m = new Map<ID, BillView[]>();
    for (const v of billViews) {
      const list = m.get(v.tenantId) ?? [];
      list.push(v);
      m.set(v.tenantId, list);
    }
    for (const list of m.values()) list.sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    return m;
  }, [billViews]);

  const balanceByTenant = useMemo(() => {
    const m = new Map<ID, number>();
    for (const [tenantId, list] of billsByTenant) m.set(tenantId, sumBalance(list));
    // Money paid without a bill attached reduces what she owes overall.
    for (const p of db.payments) {
      if (p.billId) continue;
      m.set(p.tenantId, (m.get(p.tenantId) ?? 0) - p.amount);
    }
    return m;
  }, [billsByTenant, db.payments]);

  const bedViews = useMemo<BedView[]>(() => {
    const roomById = new Map(db.rooms.map((r) => [r.id, r]));
    const openStayByBed = new Map<ID, Stay>();
    for (const s of db.stays) if (isCurrentStay(s, today)) openStayByBed.set(s.bedId, s);
    const tenantById = new Map(db.tenants.map((t) => [t.id, t]));

    return db.beds
      .map((bed) => {
        const room = roomById.get(bed.roomId);
        if (!room) return null;
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
        } satisfies BedView;
      })
      .filter((x): x is BedView => x !== null)
      .sort(
        (a, b) =>
          a.room.floor.localeCompare(b.room.floor) ||
          a.room.roomNo.localeCompare(b.room.roomNo, undefined, { numeric: true }) ||
          a.bed.label.localeCompare(b.bed.label)
      );
  }, [db.beds, db.rooms, db.stays, db.tenants, billsByTenant]);

  const bedViewsByBranch = useMemo(() => {
    const m = new Map<ID, BedView[]>();
    for (const v of bedViews) {
      const list = m.get(v.room.branchId) ?? [];
      list.push(v);
      m.set(v.room.branchId, list);
    }
    return m;
  }, [bedViews]);

  const currentStayOf = useCallback(
    (tenantId: ID) => db.stays.find((s) => s.tenantId === tenantId && isCurrentStay(s)) ?? null,
    [db.stays]
  );

  const tenantOfBed = useCallback(
    (bedId: ID) => {
      const stay = db.stays.find((s) => s.bedId === bedId && isCurrentStay(s));
      return stay ? db.tenants.find((t) => t.id === stay.tenantId) ?? null : null;
    },
    [db.stays, db.tenants]
  );

  const value: DbContext = {
    db,
    ready,
    actor,
    saving,
    addRoom,
    updateRoom,
    deleteRoom,
    addBeds,
    updateBed,
    deleteBed,
    updateBranch,
    admitTenant,
    updateTenant,
    moveTenant,
    vacateTenant,
    deleteTenant,
    runBillGeneration,
    addCharge,
    removeCharge,
    waiveBill,
    recordPayment,
    deletePayment,
    updateSettings,
    replaceDatabase,
    loadSampleData,
    resetAll,
    billViews,
    billViewsById,
    billsByTenant,
    balanceByTenant,
    bedViews,
    bedViewsByBranch,
    currentStayOf,
    tenantOfBed,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------ helpers */

function shiftBack(d: DateStr): DateStr {
  const dt = new Date(`${d}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * Someone whose leaving date has arrived becomes 'vacated' on her own, so the
 * list is right even if the app was closed on the day.
 */
function reconcileStatuses(d: Database): void {
  const today = todayStr();
  for (const t of d.tenants) {
    if (t.status === 'vacated' || !t.vacateDate) continue;
    if (t.vacateDate < today) t.status = 'vacated';
  }
}

/** Applies the billing plan to a draft in place; returns how many bills were new. */
function regenerate(d: Database): number {
  const tenantById = new Map(d.tenants.map((t) => [t.id, t]));
  const plan = planBills({
    stays: d.stays,
    existingBills: d.bills,
    existingItems: d.billItems,
    payments: d.payments,
    branchOf: (s) => tenantById.get(s.tenantId)?.branchId ?? '',
    presets: d.settings.chargePresets,
  });
  d.bills.push(...plan.bills);
  d.billItems.push(...plan.items);
  for (const upd of plan.updatedItems) {
    const item = d.billItems.find((i) => i.id === upd.id);
    if (item) item.amount = upd.amount;
  }
  return plan.bills.length;
}

function withGeneratedBills(db: Database): Database {
  const next = structuredClone(db);
  reconcileStatuses(next);
  const created = regenerate(next);
  if (created) next.updatedAt = new Date().toISOString();
  return next;
}

export type { Bill, BillItem };
