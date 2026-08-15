import type { Database, Settings } from './types';
import { addDays, financialYear, today } from '@/domain/dates';

export const DB_VERSION = 1;

/**
 * Placeholder branches for a fresh install. The real names, addresses and
 * phone numbers are entered by the owner under Settings and live only in the
 * data file on their own machine — never in this repository.
 */
export const SEED_BRANCHES = [
  {
    id: 'br_one',
    name: 'Branch 1',
    shortName: 'Branch 1',
    address: '',
    phone: '',
    sortOrder: 1,
  },
  {
    id: 'br_two',
    name: 'Branch 2',
    shortName: 'Branch 2',
    address: '',
    phone: '',
    sortOrder: 2,
  },
  {
    id: 'br_three',
    name: 'Branch 3',
    shortName: 'Branch 3',
    address: '',
    phone: '',
    sortOrder: 3,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  hostelName: 'Sri Bharathi PG for Women',
  tagline: 'A safe, homely stay',
  // Filled in by the owner under Settings; never checked in.
  phones: [],
  receiptPrefix: 'SBH',
  receiptFooter: 'Thank you. Please keep this receipt for your records.',
  chargePresets: [
    { id: 'cp_food', label: 'Mess / food', type: 'food', amount: 2500, auto: false },
    { id: 'cp_laundry', label: 'Laundry', type: 'laundry', amount: 300, auto: false },
    { id: 'cp_eb', label: 'Electricity (EB)', type: 'electricity', amount: 500, auto: false },
    { id: 'cp_ac', label: 'AC charges', type: 'ac', amount: 1000, auto: false },
    { id: 'cp_late', label: 'Late fee', type: 'late_fee', amount: 200, auto: false },
  ],
  whatsapp: {
    dueReminder:
      'Dear {name}, this is a gentle reminder from {hostel}. Your rent of ₹{amount} for {period} is due on {due}. Kindly pay at your convenience. Thank you!',
    overdueReminder:
      'Dear {name}, your pending amount at {hostel} is ₹{amount} for {period} ({daysOverdue} days overdue). Kindly settle it at the earliest. Thank you!',
    receiptShare:
      'Dear {name}, we have received ₹{amount} on {paidOn} towards {period}. Receipt no: {receiptNo}. Thank you! — {hostel}',
  },
  billing: {
    autoGenerate: true,
    graceDays: 5,
    defaultCycle: 'anniversary',
    defaultAnchorDay: 5,
  },
  excel: {
    auto: false,
    folder: '',
  },
  lastReceiptSeq: 0,
};

export function emptyDatabase(): Database {
  return {
    version: DB_VERSION,
    branches: SEED_BRANCHES.map((b) => ({ ...b })),
    rooms: [],
    beds: [],
    tenants: [],
    stays: [],
    bills: [],
    billItems: [],
    payments: [],
    settings: structuredClone(DEFAULT_SETTINGS),
    auditLog: [],
    updatedAt: new Date().toISOString(),
  };
}

/** Fills in anything a file from an older version is missing. */
export function migrate(db: Database): Database {
  const base = emptyDatabase();
  const settings: Settings = {
    ...base.settings,
    ...db.settings,
    whatsapp: { ...base.settings.whatsapp, ...db.settings?.whatsapp },
    billing: { ...base.settings.billing, ...db.settings?.billing },
    excel: { ...base.settings.excel, ...db.settings?.excel },
    chargePresets: db.settings?.chargePresets ?? base.settings.chargePresets,
  };
  return {
    ...base,
    ...db,
    settings,
    version: DB_VERSION,
    branches: db.branches?.length ? db.branches : base.branches,
    rooms: db.rooms ?? [],
    beds: db.beds ?? [],
    tenants: db.tenants ?? [],
    stays: db.stays ?? [],
    bills: db.bills ?? [],
    billItems: db.billItems ?? [],
    payments: db.payments ?? [],
    auditLog: db.auditLog ?? [],
  };
}

/**
 * A realistic branch worth of data so the app can be tried out before any real
 * details are entered. Removable in one click from Settings.
 */
/**
 * Settles most of the sample hostel's history, so trying the app shows a
 * business that is being run properly — older months paid off, this month
 * partly collected, a handful still chasing — rather than a year of arrears.
 *
 * Runs after bill generation, since it needs the bills to pay.
 */
export function addSamplePayments(db: Database): Database {
  const t = today();
  const thisMonth = t.slice(0, 7);
  const methods = ['cash', 'upi', 'upi', 'bank', 'cash'] as const;
  let seq = 0;

  const totalOf = (billId: string) =>
    db.billItems.filter((i) => i.billId === billId).reduce((s, i) => s + i.amount, 0);

  const ordered = [...db.bills].sort((a, b) => a.periodStart.localeCompare(b.periodStart));

  ordered.forEach((bill, index) => {
    const total = totalOf(bill.id);
    if (total <= 0) return;
    const isCurrentMonth = bill.periodStart.slice(0, 7) === thisMonth;

    // Older months are settled; the current month is a work in progress.
    let amount = total;
    if (isCurrentMonth) {
      const roll = index % 5;
      if (roll === 0) return; // not paid yet
      if (roll === 1) amount = Math.round(total * 0.5); // part payment
    } else if (index % 17 === 0) {
      return; // one long-standing arrear, so the overdue view is not empty
    }

    seq += 1;
    // Paid a day or two after it fell due, the way people actually pay.
    const paidOn = bill.dueDate > t ? t : addDays(bill.dueDate, (index % 3) + 1);
    db.payments.push({
      id: `pay_sample_${seq}`,
      billId: bill.id,
      tenantId: bill.tenantId,
      branchId: bill.branchId,
      amount,
      paidOn: paidOn > t ? t : paidOn,
      method: methods[index % methods.length],
      receiptNo: `${db.settings.receiptPrefix}/${financialYear(paidOn)}/${String(seq).padStart(4, '0')}`,
      recordedBy: 'Owner',
      createdAt: new Date().toISOString(),
    });
  });

  db.settings.lastReceiptSeq = seq;
  return db;
}

export function sampleData(): Database {
  const db = emptyDatabase();
  const now = new Date().toISOString();
  const t = today();
  const thisYear = Number(t.slice(0, 4));

  const names = [
    'Divya Sree', 'Keerthana R', 'Anjali Menon', 'Priyadharshini S', 'Nandhini K',
    'Swetha Raj', 'Meenakshi B', 'Harini V', 'Lakshmi Priya', 'Aishwarya N',
    'Sneha Gowda', 'Ramya Devi', 'Bhavana S', 'Yamini R', 'Deepika M',
  ];
  const orgs = [
    ['work', 'TVS Motor Company'], ['work', 'Ashok Leyland'], ['college', 'Adhiyamaan College'],
    ['work', 'Titan Company'], ['college', 'Government Arts College'], ['work', 'Caterpillar India'],
  ] as const;

  let nameIdx = 0;
  let bedSeq = 0;

  db.branches.forEach((branch, bIdx) => {
    const roomCount = bIdx === 0 ? 6 : 4;
    for (let r = 0; r < roomCount; r++) {
      const sharing = [4, 3, 2, 4, 3, 2][r % 6];
      const hasAc = r % 3 === 0;
      const rent = sharing === 4 ? 6000 : sharing === 3 ? 7000 : 8500;
      const roomId = `room_${bIdx}_${r}`;
      db.rooms.push({
        id: roomId,
        branchId: branch.id,
        roomNo: `${r < 3 ? 1 : 2}0${(r % 3) + 1}`,
        floor: r < 3 ? 'Ground floor' : 'First floor',
        sharing,
        hasAc,
        attachedBath: r % 2 === 0,
        defaultRent: rent + (hasAc ? 500 : 0),
      });
      for (let s = 0; s < sharing; s++) {
        const bedId = `bed_${bIdx}_${r}_${s}`;
        db.beds.push({ id: bedId, roomId, label: String.fromCharCode(65 + s), rent: null });

        // Fill roughly three quarters of the beds.
        if (nameIdx >= names.length || (bedSeq++ % 4 === 3 && nameIdx > 3)) continue;
        const full = names[nameIdx % names.length];
        const [occ, org] = orgs[nameIdx % orgs.length];
        const tenantId = `tenant_${bIdx}_${r}_${s}`;
        const joinMonth = 1 + ((nameIdx * 3) % 7);
        const joinDay = 1 + ((nameIdx * 7) % 27);
        const joinDate = `${thisYear}-${String(joinMonth).padStart(2, '0')}-${String(joinDay).padStart(2, '0')}`;

        db.tenants.push({
          id: tenantId,
          branchId: branch.id,
          fullName: full,
          phone: `9${String(600000000 + nameIdx * 1234567).slice(0, 9)}`,
          guardianName: ['Rajesh Kumar', 'Sundaram P', 'Mohan Das', 'Venkatesh S'][nameIdx % 4],
          guardianRelation: 'Father',
          guardianPhone: `9${String(700000000 + nameIdx * 7654321).slice(0, 9)}`,
          occupationType: occ,
          orgName: org,
          expectedStay: nameIdx % 3 === 0 ? '1 year' : '6 months',
          joinDate,
          status: 'active',
          createdAt: now,
        });
        db.stays.push({
          id: `stay_${tenantId}`,
          tenantId,
          bedId,
          fromDate: joinDate,
          toDate: null,
          agreedRent: rent + (hasAc ? 500 : 0),
          cycle: nameIdx % 5 === 0 ? 'fixed_date' : 'anniversary',
          anchorDay: 5,
          prorateFirst: true,
          createdAt: now,
        });
        nameIdx++;
      }
    }
  });

  return db;
}
