/**
 * Shape of everything the app stores.
 *
 * Two rules kept throughout:
 *  - Dates are plain 'YYYY-MM-DD' strings (no timezone can shift a due date).
 *  - Money is a whole number of rupees.
 *
 * The collections mirror the Postgres tables in supabase/schema.sql one-for-one,
 * so the local file and the cloud never drift apart.
 */

export type ID = string;
/** 'YYYY-MM-DD' */
export type DateStr = string;
/** ISO 8601 timestamp */
export type Timestamp = string;

export interface Branch {
  id: ID;
  name: string;
  shortName: string;
  address: string;
  phone: string;
  sortOrder: number;
  archived?: boolean;
}

export interface Room {
  id: ID;
  branchId: ID;
  roomNo: string;
  floor: string;
  sharing: number;
  hasAc: boolean;
  attachedBath: boolean;
  defaultRent: number;
  notes?: string;
  archived?: boolean;
}

export interface Bed {
  id: ID;
  roomId: ID;
  label: string;
  /** null = use the room's default rent */
  rent: number | null;
  /** taken out of service (repairs, storage) without deleting history */
  outOfService?: boolean;
  archived?: boolean;
}

export type TenantStatus = 'active' | 'notice' | 'vacated';
export type OccupationType = 'work' | 'college' | 'other';

export interface Tenant {
  id: ID;
  branchId: ID;
  fullName: string;
  phone: string;
  altPhone?: string;
  guardianName?: string;
  guardianRelation?: string;
  guardianPhone?: string;
  emergencyContact?: string;
  occupationType: OccupationType;
  orgName?: string;
  expectedStay?: string;
  joinDate: DateStr;
  status: TenantStatus;
  noticeDate?: DateStr;
  vacateDate?: DateStr;
  notes?: string;
  createdAt: Timestamp;
}

export type BillingCycle = 'anniversary' | 'fixed_date' | 'short_stay';

export interface Stay {
  id: ID;
  tenantId: ID;
  bedId: ID;
  fromDate: DateStr;
  /** null while she is still in this bed */
  toDate: DateStr | null;
  agreedRent: number;
  cycle: BillingCycle;
  /** for 'fixed_date': the day of the month rent falls due (1–28) */
  anchorDay?: number;
  /** for 'short_stay': per-day rate */
  dailyRate?: number;
  /** charge the first partial month day-by-day instead of in full */
  prorateFirst: boolean;
  endedReason?: 'vacated' | 'moved' | 'corrected';
  createdAt: Timestamp;
}

export type ChargeType =
  | 'rent'
  | 'food'
  | 'laundry'
  | 'electricity'
  | 'ac'
  | 'late_fee'
  | 'damage'
  | 'other';

export interface BillItem {
  id: ID;
  billId: ID;
  type: ChargeType;
  label: string;
  amount: number;
}

export interface Bill {
  id: ID;
  stayId: ID;
  tenantId: ID;
  branchId: ID;
  periodStart: DateStr;
  periodEnd: DateStr;
  dueDate: DateStr;
  /** set when the owner writes off the balance */
  waivedAmount?: number;
  note?: string;
  createdAt: Timestamp;
}

export type PaymentMethod = 'cash' | 'upi' | 'bank' | 'other';

export interface Payment {
  id: ID;
  /** null = an on-account payment not tied to one month */
  billId: ID | null;
  tenantId: ID;
  branchId: ID;
  amount: number;
  paidOn: DateStr;
  method: PaymentMethod;
  reference?: string;
  note?: string;
  receiptNo: string;
  recordedBy?: string;
  createdAt: Timestamp;
}

export interface ChargePreset {
  id: ID;
  label: string;
  type: ChargeType;
  amount: number;
  /** add automatically to every new bill */
  auto: boolean;
}

export interface Settings {
  hostelName: string;
  tagline: string;
  phones: string[];
  receiptPrefix: string;
  receiptFooter: string;
  chargePresets: ChargePreset[];
  whatsapp: {
    dueReminder: string;
    overdueReminder: string;
    receiptShare: string;
  };
  billing: {
    autoGenerate: boolean;
    graceDays: number;
    defaultCycle: BillingCycle;
    defaultAnchorDay: number;
  };
  /** The Excel copy kept in step with the register. */
  excel: {
    auto: boolean;
    folder: string;
    lastSavedAt?: string;
  };
  lastReceiptSeq: number;
}

export interface AuditEntry {
  id: ID;
  at: Timestamp;
  actor: string;
  action: string;
  entity: string;
  entityId: ID;
  detail?: string;
}

export interface Database {
  version: number;
  branches: Branch[];
  rooms: Room[];
  beds: Bed[];
  tenants: Tenant[];
  stays: Stay[];
  bills: Bill[];
  billItems: BillItem[];
  payments: Payment[];
  settings: Settings;
  auditLog: AuditEntry[];
  updatedAt: Timestamp;
}

/* ------------------------------------------------------------------ views */
/* Derived shapes the UI works with. Never stored. */

export type BillStatus = 'paid' | 'partial' | 'due' | 'overdue' | 'waived';

export interface BillView extends Bill {
  items: BillItem[];
  total: number;
  paid: number;
  balance: number;
  status: BillStatus;
  daysOverdue: number;
}

export interface BedView {
  bed: Bed;
  room: Room;
  rent: number;
  stay: Stay | null;
  tenant: Tenant | null;
  /** worst status across this tenant's open bills */
  status: BillStatus | 'vacant';
  balance: number;
}
