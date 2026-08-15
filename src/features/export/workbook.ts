import type { BedView, BillView, ChargeType, Database, ID } from '@/data/types';
import { humanDate, monthKey, monthLabel, periodLabel, today as todayStr } from '@/domain/dates';
import { isCurrentStay } from '@/domain/stays';

/**
 * Turns the register into a workbook description — sheets, columns, rows.
 *
 * Deliberately plain data: the main process turns this into a real .xlsx, and
 * this file stays pure so the contents can be unit-tested without Excel.
 */

export type CellFormat = 'text' | 'money' | 'date' | 'number' | 'percent';

export interface ColumnSpec {
  header: string;
  key: string;
  width?: number;
  format?: CellFormat;
}

export interface SheetSpec {
  name: string;
  columns: ColumnSpec[];
  rows: Record<string, string | number | null>[];
  /** rendered as a bold row at the bottom, keyed by column */
  totals?: Record<string, number>;
}

export interface WorkbookSpec {
  fileName: string;
  title: string;
  generatedAt: string;
  sheets: SheetSpec[];
}

export interface WorkbookInput {
  db: Database;
  billViews: BillView[];
  bedViews: BedView[];
  balanceByTenant: Map<ID, number>;
}

/**
 * Excel forbids these characters in a tab name, caps it at 31 characters, and
 * refuses two tabs with the same name — which two branches named alike, or a
 * branch called "Summary", would otherwise cause. Names are made unique here.
 */
function makeSheetNamer() {
  const used = new Set<string>();
  return (name: string): string => {
    const base = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    for (let n = 2; n < 100; n++) {
      const suffix = ` (${n})`;
      const candidate = base.slice(0, 31 - suffix.length) + suffix;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    return base;
  };
}

const CHARGE_COLUMNS: { type: ChargeType; header: string; key: string }[] = [
  { type: 'rent', header: 'Rent', key: 'rent' },
  { type: 'food', header: 'Mess / food', key: 'food' },
  { type: 'laundry', header: 'Laundry', key: 'laundry' },
  { type: 'electricity', header: 'Electricity', key: 'electricity' },
  { type: 'ac', header: 'AC', key: 'ac' },
  { type: 'late_fee', header: 'Late fee', key: 'late_fee' },
  { type: 'damage', header: 'Damage', key: 'damage' },
  { type: 'other', header: 'Other', key: 'other' },
];

const STATUS_WORD: Record<string, string> = {
  paid: 'Paid',
  partial: 'Part paid',
  due: 'Due',
  overdue: 'Overdue',
  waived: 'Waived',
  vacant: 'Vacant',
};

const CYCLE_WORD: Record<string, string> = {
  anniversary: 'From her join date',
  fixed_date: 'Fixed date each month',
  short_stay: 'Short stay (per day)',
};

export function buildWorkbookSpec(input: WorkbookInput): WorkbookSpec {
  const { db, billViews, bedViews, balanceByTenant } = input;
  const today = todayStr();
  const thisMonth = monthKey(today);

  const branchById = new Map(db.branches.map((b) => [b.id, b]));
  const roomById = new Map(db.rooms.map((r) => [r.id, r]));
  const bedById = new Map(db.beds.map((b) => [b.id, b]));
  const stayById = new Map(db.stays.map((s) => [s.id, s]));
  const tenantById = new Map(db.tenants.map((t) => [t.id, t]));

  const branchName = (id: ID) => branchById.get(id)?.name ?? '—';
  const sheetName = makeSheetNamer();

  /** Where a girl sits right now. */
  function placeOf(tenantId: ID) {
    const stay = db.stays.find((s) => s.tenantId === tenantId && isCurrentStay(s));
    const bed = stay ? bedById.get(stay.bedId) : undefined;
    const room = bed ? roomById.get(bed.roomId) : undefined;
    return { stay, bed, room };
  }

  /** Where a bill's stay was, which may not be where she is today. */
  function placeOfStay(stayId: ID) {
    const stay = stayById.get(stayId);
    const bed = stay ? bedById.get(stay.bedId) : undefined;
    const room = bed ? roomById.get(bed.roomId) : undefined;
    return { stay, bed, room };
  }

  const sheets: SheetSpec[] = [];

  /* ------------------------------------------------------------ summary */

  const summaryRows = [...db.branches]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((branch) => {
      const beds = bedViews.filter((v) => v.room.branchId === branch.id);
      const filled = beds.filter((v) => v.tenant).length;
      const monthBills = billViews.filter(
        (b) => b.branchId === branch.id && monthKey(b.periodStart) === thisMonth
      );
      const expected = monthBills.reduce((s, b) => s + b.total, 0);
      const collected = monthBills.reduce((s, b) => s + b.paid, 0);
      const outstanding = billViews
        .filter((b) => b.branchId === branch.id)
        .reduce((s, b) => s + Math.max(0, b.balance), 0);
      return {
        branch: branch.name,
        address: branch.address,
        beds: beds.length,
        filled,
        vacant: beds.length - filled,
        occupancy: beds.length ? filled / beds.length : 0,
        expected,
        collected,
        outstanding,
      };
    });

  sheets.push({
    name: sheetName('Summary'),
    columns: [
      { header: 'Branch', key: 'branch', width: 22 },
      { header: 'Address', key: 'address', width: 46 },
      { header: 'Total beds', key: 'beds', width: 11, format: 'number' },
      { header: 'Filled', key: 'filled', width: 9, format: 'number' },
      { header: 'Vacant', key: 'vacant', width: 9, format: 'number' },
      { header: 'Occupancy', key: 'occupancy', width: 11, format: 'percent' },
      { header: `Expected · ${monthLabel(thisMonth)}`, key: 'expected', width: 18, format: 'money' },
      { header: 'Collected this month', key: 'collected', width: 19, format: 'money' },
      { header: 'Outstanding (all months)', key: 'outstanding', width: 22, format: 'money' },
    ],
    rows: summaryRows,
    totals: {
      beds: summaryRows.reduce((s, r) => s + r.beds, 0),
      filled: summaryRows.reduce((s, r) => s + r.filled, 0),
      vacant: summaryRows.reduce((s, r) => s + r.vacant, 0),
      expected: summaryRows.reduce((s, r) => s + r.expected, 0),
      collected: summaryRows.reduce((s, r) => s + r.collected, 0),
      outstanding: summaryRows.reduce((s, r) => s + r.outstanding, 0),
    },
  });

  /* -------------------------------------------------------------- girls */

  const girlRows = [...db.tenants]
    .sort(
      (a, b) =>
        branchName(a.branchId).localeCompare(branchName(b.branchId)) ||
        a.fullName.localeCompare(b.fullName)
    )
    .map((t) => {
      const { stay, bed, room } = placeOf(t.id);
      return {
        branch: branchName(t.branchId),
        room: room?.roomNo ?? '—',
        bed: bed?.label ?? '—',
        name: t.fullName,
        phone: t.phone || '',
        altPhone: t.altPhone ?? '',
        guardian: t.guardianName ?? '',
        relation: t.guardianRelation ?? '',
        guardianPhone: t.guardianPhone ?? '',
        occupation: t.occupationType === 'college' ? 'Studying' : t.occupationType === 'work' ? 'Working' : 'Other',
        org: t.orgName ?? '',
        expectedStay: t.expectedStay ?? '',
        joinDate: t.joinDate,
        rent: stay?.agreedRent ?? 0,
        cycle: stay ? CYCLE_WORD[stay.cycle] : '',
        status: t.status === 'active' ? 'Staying' : t.status === 'notice' ? 'On notice' : 'Left',
        vacateDate: t.vacateDate ?? '',
        pending: Math.max(0, balanceByTenant.get(t.id) ?? 0),
        notes: t.notes ?? '',
      };
    });

  sheets.push({
    name: sheetName('Girls'),
    columns: [
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Room', key: 'room', width: 8 },
      { header: 'Bed', key: 'bed', width: 6 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Phone', key: 'phone', width: 14 },
      { header: 'Alternate phone', key: 'altPhone', width: 15 },
      { header: 'Guardian', key: 'guardian', width: 20 },
      { header: 'Relationship', key: 'relation', width: 13 },
      { header: 'Guardian phone', key: 'guardianPhone', width: 15 },
      { header: 'Working / studying', key: 'occupation', width: 16 },
      { header: 'Company / college', key: 'org', width: 26 },
      { header: 'Expected stay', key: 'expectedStay', width: 14 },
      { header: 'Joined on', key: 'joinDate', width: 12, format: 'date' },
      { header: 'Rent per month', key: 'rent', width: 15, format: 'money' },
      { header: 'Rent counted', key: 'cycle', width: 22 },
      { header: 'Status', key: 'status', width: 11 },
      { header: 'Left on', key: 'vacateDate', width: 12, format: 'date' },
      { header: 'Pending amount', key: 'pending', width: 15, format: 'money' },
      { header: 'Notes', key: 'notes', width: 34 },
    ],
    rows: girlRows,
    totals: {
      rent: girlRows.reduce((s, r) => s + r.rent, 0),
      pending: girlRows.reduce((s, r) => s + r.pending, 0),
    },
  });

  /* ------------------------------------------------------- rooms & beds */

  const bedRows = bedViews.map((v) => ({
    branch: branchName(v.room.branchId),
    floor: v.room.floor,
    room: v.room.roomNo,
    sharing: v.room.sharing,
    ac: v.room.hasAc ? 'AC' : 'Non-AC',
    bathroom: v.room.attachedBath ? 'Attached' : 'Common',
    bed: v.bed.label,
    rent: v.rent,
    occupant: v.tenant?.fullName ?? '',
    occupantPhone: v.tenant?.phone ?? '',
    since: v.stay?.fromDate ?? '',
    status: v.bed.outOfService ? 'Out of service' : STATUS_WORD[v.status] ?? '',
    pending: v.balance > 0 ? v.balance : 0,
  }));

  sheets.push({
    name: sheetName('Rooms & Beds'),
    columns: [
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Floor', key: 'floor', width: 14 },
      { header: 'Room', key: 'room', width: 8 },
      { header: 'Sharing', key: 'sharing', width: 9, format: 'number' },
      { header: 'AC', key: 'ac', width: 9 },
      { header: 'Bathroom', key: 'bathroom', width: 11 },
      { header: 'Bed', key: 'bed', width: 6 },
      { header: 'Rent', key: 'rent', width: 12, format: 'money' },
      { header: 'Occupied by', key: 'occupant', width: 24 },
      { header: 'Her phone', key: 'occupantPhone', width: 14 },
      { header: 'Staying since', key: 'since', width: 13, format: 'date' },
      { header: 'Payment status', key: 'status', width: 15 },
      { header: 'Pending', key: 'pending', width: 12, format: 'money' },
    ],
    rows: bedRows,
    totals: { rent: bedRows.reduce((s, r) => s + r.rent, 0), pending: bedRows.reduce((s, r) => s + r.pending, 0) },
  });

  /* --------------------------------------------------------- rent bills */

  const billRows = [...billViews]
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.branchId.localeCompare(b.branchId))
    .map((bill) => {
      const tenant = tenantById.get(bill.tenantId);
      const { room, bed } = placeOfStay(bill.stayId);
      const byType: Record<string, number> = {};
      for (const item of bill.items) byType[item.type] = (byType[item.type] ?? 0) + item.amount;
      return {
        month: monthLabel(monthKey(bill.periodStart)),
        branch: branchName(bill.branchId),
        room: room?.roomNo ?? '—',
        bed: bed?.label ?? '—',
        name: tenant?.fullName ?? '—',
        periodFrom: bill.periodStart,
        periodTo: bill.periodEnd,
        dueDate: bill.dueDate,
        ...Object.fromEntries(CHARGE_COLUMNS.map((c) => [c.key, byType[c.type] ?? 0])),
        waived: bill.waivedAmount ?? 0,
        total: bill.total,
        paid: bill.paid,
        balance: bill.balance,
        status: STATUS_WORD[bill.status] ?? bill.status,
        daysOverdue: bill.daysOverdue,
      };
    });

  sheets.push({
    name: sheetName('Rent bills'),
    columns: [
      { header: 'Month', key: 'month', width: 15 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Room', key: 'room', width: 8 },
      { header: 'Bed', key: 'bed', width: 6 },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Period from', key: 'periodFrom', width: 13, format: 'date' },
      { header: 'Period to', key: 'periodTo', width: 13, format: 'date' },
      { header: 'Due date', key: 'dueDate', width: 13, format: 'date' },
      ...CHARGE_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 13, format: 'money' as const })),
      { header: 'Waived', key: 'waived', width: 12, format: 'money' },
      { header: 'Total', key: 'total', width: 13, format: 'money' },
      { header: 'Paid', key: 'paid', width: 13, format: 'money' },
      { header: 'Balance', key: 'balance', width: 13, format: 'money' },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Days late', key: 'daysOverdue', width: 10, format: 'number' },
    ],
    rows: billRows,
    totals: {
      ...Object.fromEntries(
        CHARGE_COLUMNS.map((c) => [c.key, billRows.reduce((s, r) => s + ((r as never)[c.key] as number), 0)])
      ),
      total: billRows.reduce((s, r) => s + r.total, 0),
      paid: billRows.reduce((s, r) => s + r.paid, 0),
      balance: billRows.reduce((s, r) => s + r.balance, 0),
    },
  });

  /* ----------------------------------------------------------- payments */

  const paymentRows = [...db.payments]
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
    .map((p) => {
      const tenant = tenantById.get(p.tenantId);
      const bill = p.billId ? billViews.find((b) => b.id === p.billId) : undefined;
      const { room, bed } = tenant ? placeOf(tenant.id) : { room: undefined, bed: undefined };
      return {
        receiptNo: p.receiptNo,
        paidOn: p.paidOn,
        name: tenant?.fullName ?? '—',
        branch: branchName(p.branchId),
        room: room?.roomNo ?? '—',
        bed: bed?.label ?? '—',
        amount: p.amount,
        method: p.method === 'upi' ? 'UPI' : p.method.charAt(0).toUpperCase() + p.method.slice(1),
        reference: p.reference ?? '',
        forPeriod: bill ? periodLabel(bill.periodStart, bill.periodEnd) : 'On account',
        note: p.note ?? '',
        recordedBy: p.recordedBy ?? '',
      };
    });

  sheets.push({
    name: sheetName('Payments'),
    columns: [
      { header: 'Receipt no.', key: 'receiptNo', width: 20 },
      { header: 'Paid on', key: 'paidOn', width: 13, format: 'date' },
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Branch', key: 'branch', width: 20 },
      { header: 'Room', key: 'room', width: 8 },
      { header: 'Bed', key: 'bed', width: 6 },
      { header: 'Amount', key: 'amount', width: 14, format: 'money' },
      { header: 'Paid by', key: 'method', width: 11 },
      { header: 'Reference', key: 'reference', width: 18 },
      { header: 'For period', key: 'forPeriod', width: 20 },
      { header: 'Note', key: 'note', width: 26 },
      { header: 'Recorded by', key: 'recordedBy', width: 13 },
    ],
    rows: paymentRows,
    totals: { amount: paymentRows.reduce((s, r) => s + r.amount, 0) },
  });

  /* ----------------------------------------- one sheet per branch */

  for (const branch of [...db.branches].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const rows = bedViews
      .filter((v) => v.room.branchId === branch.id)
      .map((v) => ({
        floor: v.room.floor,
        room: v.room.roomNo,
        bed: v.bed.label,
        name: v.tenant?.fullName ?? '— vacant —',
        phone: v.tenant?.phone ?? '',
        since: v.stay?.fromDate ?? '',
        rent: v.stay?.agreedRent ?? v.rent,
        status: v.tenant ? STATUS_WORD[v.status] ?? '' : 'Vacant',
        pending: v.balance > 0 ? v.balance : 0,
      }));

    sheets.push({
      name: sheetName(branch.name),
      columns: [
        { header: 'Floor', key: 'floor', width: 14 },
        { header: 'Room', key: 'room', width: 8 },
        { header: 'Bed', key: 'bed', width: 6 },
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Phone', key: 'phone', width: 14 },
        { header: 'Staying since', key: 'since', width: 13, format: 'date' },
        { header: 'Rent', key: 'rent', width: 12, format: 'money' },
        { header: 'Payment status', key: 'status', width: 15 },
        { header: 'Pending', key: 'pending', width: 12, format: 'money' },
      ],
      rows,
      totals: {
        rent: rows.reduce((s, r) => s + r.rent, 0),
        pending: rows.reduce((s, r) => s + r.pending, 0),
      },
    });
  }

  return {
    fileName: `Sri Bharathi register ${today}.xlsx`,
    title: `${db.settings.hostelName} — register as on ${humanDate(today)}`,
    generatedAt: new Date().toISOString(),
    sheets,
  };
}
