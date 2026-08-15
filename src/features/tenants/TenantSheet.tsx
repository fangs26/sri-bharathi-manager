import { useMemo, useState } from 'react';
import { useDb } from '@/data/store';
import type { BillView, ChargeType, ID } from '@/data/types';
import { humanDate, periodLabel, today as todayStr } from '@/domain/dates';
import { money, prettyPhone } from '@/ui/format';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Modal,
  MoneyInput,
  Segmented,
  Select,
  SideSheet,
  StatusChip,
  Textarea,
  cx,
  useToast,
} from '@/ui/primitives';
import {
  IconChevronDown,
  IconPhone,
  IconPlus,
  IconPrint,
  IconRupee,
  IconSwap,
  IconTrash,
  IconWhatsApp,
} from '@/ui/icons';
import { fillTemplate, callPhone, openWhatsApp } from '../messaging';
import { buildReceiptHtml, printReceipt } from '../receipt';

export function TenantSheet({
  tenantId,
  onClose,
  onRecordPayment,
}: {
  tenantId: ID | null;
  onClose: () => void;
  onRecordPayment: (tenantId: ID, billId?: ID) => void;
}) {
  const db = useDb();
  const toast = useToast();
  const [tab, setTab] = useState<'overview' | 'ledger'>('overview');
  const [editing, setEditing] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [vacateOpen, setVacateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chargeFor, setChargeFor] = useState<BillView | null>(null);

  const tenant = db.db.tenants.find((t) => t.id === tenantId) ?? null;
  const bills = useMemo(() => (tenantId ? db.billsByTenant.get(tenantId) ?? [] : []), [db.billsByTenant, tenantId]);
  const balance = tenantId ? db.balanceByTenant.get(tenantId) ?? 0 : 0;

  if (!tenant) return null;

  const stay = db.currentStayOf(tenant.id);
  const bed = stay ? db.db.beds.find((b) => b.id === stay.bedId) : null;
  const room = bed ? db.db.rooms.find((r) => r.id === bed.roomId) : null;
  const branch = db.db.branches.find((b) => b.id === tenant.branchId);
  const oldestOpen = [...bills].reverse().find((b) => b.balance > 0) ?? null;

  return (
    <>
      <SideSheet
        open={!!tenantId}
        onClose={onClose}
        title={
          <span className="flex items-center gap-2.5">
            <Avatar name={tenant.fullName} size={32} />
            {tenant.fullName}
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2">
            {room && bed ? `Room ${room.roomNo} · Bed ${bed.label}` : 'No bed assigned'}
            {branch && <span className="text-muted/70">· {branch.name}</span>}
            {tenant.status !== 'active' && (
              <span className="rounded-full bg-cream-2 px-2 py-0.5 text-[11px] font-semibold">
                {tenant.status === 'vacated' ? `Vacated ${humanDate(tenant.vacateDate)}` : 'On notice'}
              </span>
            )}
          </span>
        }
        footer={
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" onClick={() => onRecordPayment(tenant.id, oldestOpen?.id)}>
              <IconRupee size={15} /> Record payment
            </Button>
            <Button onClick={() => callPhone(tenant.phone)} title="Call">
              <IconPhone size={15} />
            </Button>
            <Button
              onClick={() =>
                openWhatsApp(
                  tenant.phone,
                  balance > 0 && oldestOpen
                    ? fillTemplate(db.db.settings.whatsapp.dueReminder, {
                        name: tenant.fullName.split(' ')[0],
                        amount: balance,
                        period: periodLabel(oldestOpen.periodStart, oldestOpen.periodEnd),
                        due: humanDate(oldestOpen.dueDate),
                        hostel: db.db.settings.hostelName,
                      })
                    : `Dear ${tenant.fullName.split(' ')[0]}, `
                )
              }
            >
              <IconWhatsApp size={15} />
            </Button>
          </div>
        }
      >
        {/* balance headline */}
        <div
          className={cx(
            'mb-4 flex items-center justify-between rounded-[14px] border px-4 py-3.5',
            balance > 0 ? 'border-[#e9cbbf] bg-terracotta-soft' : 'border-[#cfdcc2] bg-sage-soft'
          )}
        >
          <div>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">
              {balance > 0 ? 'Pending amount' : 'Account status'}
            </div>
            <div
              className={cx(
                'tnum mt-0.5 font-[var(--font-display)] text-[26px] font-semibold leading-none tracking-[-0.02em]',
                balance > 0 ? 'text-terracotta-dk' : 'text-sage-dk'
              )}
            >
              {balance > 0 ? money(balance) : 'All clear'}
            </div>
          </div>
          {oldestOpen && balance > 0 && (
            <div className="text-right text-[12px] text-brown">
              <div>oldest unpaid</div>
              <div className="font-semibold">{periodLabel(oldestOpen.periodStart, oldestOpen.periodEnd)}</div>
              {oldestOpen.daysOverdue > 0 && (
                <div className="text-terracotta-dk">{oldestOpen.daysOverdue} days overdue</div>
              )}
            </div>
          )}
        </div>

        <Segmented
          className="mb-4"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Overview' },
            { value: 'ledger', label: 'Rent ledger', count: bills.length },
          ]}
        />

        {tab === 'overview' ? (
          <Overview tenant={tenant} editing={editing} setEditing={setEditing} />
        ) : (
          <Ledger bills={bills} onAddCharge={setChargeFor} onPay={(billId) => onRecordPayment(tenant.id, billId)} />
        )}

        {tab === 'overview' && (
          <div className="mt-6 space-y-2 border-t border-line pt-4">
            <h4 className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Manage</h4>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setMoveOpen(true)} disabled={!stay}>
                <IconSwap size={14} /> Move to another bed
              </Button>
              <Button size="sm" onClick={() => setVacateOpen(true)} disabled={tenant.status === 'vacated'}>
                Mark as vacated
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>
                <IconTrash size={14} /> Delete
              </Button>
            </div>
          </div>
        )}
      </SideSheet>

      <MoveDialog open={moveOpen} onClose={() => setMoveOpen(false)} tenantId={tenant.id} />

      <VacateDialog open={vacateOpen} onClose={() => setVacateOpen(false)} tenantId={tenant.id} />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          db.deleteTenant(tenant.id);
          toast(`${tenant.fullName} removed`, 'info');
          onClose();
        }}
        danger
        confirmLabel="Delete everything"
        title={`Delete ${tenant.fullName}?`}
        message="Her details, rent history and every payment receipt will be permanently removed. If she has simply moved out, use “Mark as vacated” instead so the records stay."
      />

      <AddChargeDialog bill={chargeFor} onClose={() => setChargeFor(null)} />
    </>
  );
}

/* ---------------------------------------------------------------- overview */

function Overview({
  tenant,
  editing,
  setEditing,
}: {
  tenant: NonNullable<ReturnType<typeof useDb>['db']['tenants'][number]>;
  editing: boolean;
  setEditing: (v: boolean) => void;
}) {
  const db = useDb();
  const stay = db.currentStayOf(tenant.id);

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" className="col-span-2">
            <Input value={tenant.fullName} onChange={(e) => db.updateTenant(tenant.id, { fullName: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={tenant.phone} onChange={(e) => db.updateTenant(tenant.id, { phone: e.target.value })} />
          </Field>
          <Field label="Alternate phone">
            <Input value={tenant.altPhone ?? ''} onChange={(e) => db.updateTenant(tenant.id, { altPhone: e.target.value })} />
          </Field>
          <Field label="Guardian name">
            <Input value={tenant.guardianName ?? ''} onChange={(e) => db.updateTenant(tenant.id, { guardianName: e.target.value })} />
          </Field>
          <Field label="Guardian phone">
            <Input value={tenant.guardianPhone ?? ''} onChange={(e) => db.updateTenant(tenant.id, { guardianPhone: e.target.value })} />
          </Field>
          <Field label="Relationship">
            <Input value={tenant.guardianRelation ?? ''} onChange={(e) => db.updateTenant(tenant.id, { guardianRelation: e.target.value })} />
          </Field>
          <Field label="Company / college">
            <Input value={tenant.orgName ?? ''} onChange={(e) => db.updateTenant(tenant.id, { orgName: e.target.value })} />
          </Field>
          <Field label="Expected stay">
            <Input value={tenant.expectedStay ?? ''} onChange={(e) => db.updateTenant(tenant.id, { expectedStay: e.target.value })} />
          </Field>
          <Field label="Join date">
            <Input type="date" value={tenant.joinDate} onChange={(e) => db.updateTenant(tenant.id, { joinDate: e.target.value })} />
          </Field>
          <Field label="Notes" className="col-span-2">
            <Textarea rows={2} value={tenant.notes ?? ''} onChange={(e) => db.updateTenant(tenant.id, { notes: e.target.value })} />
          </Field>
        </div>
        <Button variant="primary" onClick={() => setEditing(false)}>
          Done editing
        </Button>
      </div>
    );
  }

  const rows: [string, string][] = [
    ['Phone', tenant.phone ? prettyPhone(tenant.phone) : '—'],
    ['Alternate phone', tenant.altPhone ? prettyPhone(tenant.altPhone) : '—'],
    ['Guardian', tenant.guardianName ? `${tenant.guardianName}${tenant.guardianRelation ? ` (${tenant.guardianRelation})` : ''}` : '—'],
    ['Guardian phone', tenant.guardianPhone ? prettyPhone(tenant.guardianPhone) : '—'],
    [tenant.occupationType === 'college' ? 'College' : 'Company', tenant.orgName || '—'],
    ['Expected stay', tenant.expectedStay || '—'],
    ['Joined on', humanDate(tenant.joinDate)],
    ['Rent', stay ? `${money(stay.agreedRent)} / month` : '—'],
    [
      'Rent counted',
      stay
        ? stay.cycle === 'anniversary'
          ? 'From her join date each month'
          : stay.cycle === 'fixed_date'
            ? `On day ${stay.anchorDay} every month`
            : `Short stay · ${money(stay.dailyRate ?? 0)} per day`
        : '—',
    ],
  ];

  return (
    <div>
      <div className="card divide-y divide-[#f1e7d6]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
            <span className="text-[12.5px] text-muted">{k}</span>
            <span className="text-right text-[13.5px] font-medium">{v}</span>
          </div>
        ))}
      </div>
      {tenant.notes && (
        <p className="mt-3 rounded-[12px] bg-cream-2/70 px-4 py-3 text-[13px] leading-relaxed text-brown">{tenant.notes}</p>
      )}
      <Button size="sm" className="mt-3" onClick={() => setEditing(true)}>
        Edit details
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ ledger */

function Ledger({
  bills,
  onAddCharge,
  onPay,
}: {
  bills: BillView[];
  onAddCharge: (bill: BillView) => void;
  onPay: (billId: ID) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(bills.find((b) => b.balance > 0)?.id ?? null);

  if (!bills.length) {
    return (
      <p className="rounded-[12px] border border-dashed border-[#dfd0b8] px-4 py-8 text-center text-[13px] text-muted">
        No rent months yet. They appear automatically as each month starts.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {bills.map((b) => (
        <BillRow
          key={b.id}
          bill={b}
          open={openId === b.id}
          onToggle={() => setOpenId(openId === b.id ? null : b.id)}
          onAddCharge={() => onAddCharge(b)}
          onPay={() => onPay(b.id)}
        />
      ))}
    </div>
  );
}

function BillRow({
  bill,
  open,
  onToggle,
  onAddCharge,
  onPay,
}: {
  bill: BillView;
  open: boolean;
  onToggle: () => void;
  onAddCharge: () => void;
  onPay: () => void;
}) {
  const db = useDb();
  const toast = useToast();
  const payments = db.db.payments.filter((p) => p.billId === bill.id);
  const tenant = db.db.tenants.find((t) => t.id === bill.tenantId);

  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cream-2/40">
        <IconChevronDown
          size={15}
          className={cx('shrink-0 text-muted transition-transform', !open && '-rotate-90')}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">{periodLabel(bill.periodStart, bill.periodEnd)}</div>
          <div className="text-[12px] text-muted">
            Due {humanDate(bill.dueDate)}
            {bill.daysOverdue > 0 && <span className="text-terracotta-dk"> · {bill.daysOverdue} days late</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="tnum text-[14px] font-semibold">{money(bill.total)}</div>
          {bill.balance > 0 ? (
            <div className="tnum text-[12px] text-terracotta-dk">{money(bill.balance)} due</div>
          ) : (
            <div className="text-[12px] text-sage-dk">settled</div>
          )}
        </div>
        <StatusChip status={bill.status} />
      </button>

      {open && (
        <div className="border-t border-line bg-cream/40 px-4 py-3">
          <div className="space-y-1.5 text-[12.5px]">
            {bill.items.map((it) => (
              <div key={it.id} className="group flex items-center justify-between">
                <span className="text-brown">{it.label}</span>
                <span className="flex items-center gap-1.5">
                  <span className="tnum">{money(it.amount)}</span>
                  {it.type !== 'rent' && (
                    <IconButton
                      label="Remove charge"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={() => {
                        db.removeCharge(it.id);
                        toast('Charge removed', 'info');
                      }}
                    >
                      <IconTrash size={13} />
                    </IconButton>
                  )}
                </span>
              </div>
            ))}
          </div>

          {payments.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-[12.5px]">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sage-dk">
                  <span>
                    {humanDate(p.paidOn)} · {p.method.toUpperCase()} · {p.receiptNo}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="tnum font-semibold">{money(p.amount)}</span>
                    <IconButton
                      label="Print receipt"
                      className="h-6 w-6"
                      onClick={() => {
                        if (!tenant) return;
                        const stay = db.currentStayOf(tenant.id);
                        const bed = stay ? db.db.beds.find((x) => x.id === stay.bedId) ?? null : null;
                        printReceipt(
                          buildReceiptHtml({
                            settings: db.db.settings,
                            branch: db.db.branches.find((x) => x.id === tenant.branchId),
                            tenant,
                            payment: p,
                            bill,
                            bed,
                            room: bed ? db.db.rooms.find((r) => r.id === bed.roomId) ?? null : null,
                            balanceAfter: bill.balance,
                          })
                        );
                      }}
                    >
                      <IconPrint size={13} />
                    </IconButton>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {bill.balance > 0 && (
              <Button size="sm" variant="primary" onClick={onPay}>
                Record payment
              </Button>
            )}
            <Button size="sm" onClick={onAddCharge}>
              <IconPlus size={13} /> Add charge
            </Button>
            {bill.balance > 0 && (
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  db.waiveBill(bill.id, (bill.waivedAmount ?? 0) + bill.balance, 'Written off');
                  toast(`${money(bill.balance)} written off`, 'info');
                }}
              >
                Write off balance
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- add charge */

const CHARGE_TYPES: { value: ChargeType; label: string }[] = [
  { value: 'food', label: 'Mess / food' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'ac', label: 'AC' },
  { value: 'late_fee', label: 'Late fee' },
  { value: 'damage', label: 'Damage' },
  { value: 'other', label: 'Other' },
];

function AddChargeDialog({ bill, onClose }: { bill: BillView | null; onClose: () => void }) {
  const db = useDb();
  const toast = useToast();
  const [type, setType] = useState<ChargeType>('food');
  const [label, setLabel] = useState('Mess / food');
  const [amount, setAmount] = useState(0);

  const presets = db.db.settings.chargePresets;

  return (
    <Modal
      open={!!bill}
      onClose={onClose}
      title="Add a charge"
      subtitle={bill ? periodLabel(bill.periodStart, bill.periodEnd) : undefined}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!bill || amount <= 0) return;
              db.addCharge(bill.id, type, label.trim() || 'Charge', amount);
              toast(`${label} added`);
              onClose();
            }}
          >
            Add {amount > 0 ? money(amount) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setType(p.type);
                  setLabel(p.label);
                  setAmount(p.amount);
                }}
                className="rounded-full border border-line bg-white px-3 py-1 text-[12.5px] font-medium text-brown transition hover:border-terracotta hover:text-terracotta-dk"
              >
                {p.label} · {money(p.amount)}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select
              value={type}
              onChange={(e) => {
                const t = e.target.value as ChargeType;
                setType(t);
                setLabel(CHARGE_TYPES.find((c) => c.value === t)?.label ?? '');
              }}
            >
              {CHARGE_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount">
            <MoneyInput value={amount || ''} onValue={setAmount} />
          </Field>
        </div>
        <Field label="Shown on the bill as">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ move/vacate */

function MoveDialog({ open, onClose, tenantId }: { open: boolean; onClose: () => void; tenantId: ID }) {
  const db = useDb();
  const toast = useToast();
  const [bedId, setBedId] = useState('');
  const [from, setFrom] = useState(todayStr());
  const [rent, setRent] = useState<number | ''>('');

  const vacant = db.bedViews.filter((v) => !v.tenant && !v.bed.outOfService);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move to another bed"
      subtitle="Her rent history stays with her"
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!bedId}
            onClick={() => {
              db.moveTenant(tenantId, bedId, from, rent === '' ? undefined : rent);
              toast('Moved. Rent for both rooms is split by the days stayed.');
              onClose();
            }}
          >
            Move
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="New bed">
          <Select
            value={bedId}
            onChange={(e) => {
              setBedId(e.target.value);
              const v = vacant.find((x) => x.bed.id === e.target.value);
              setRent(v ? v.rent : '');
            }}
          >
            <option value="">Choose a free bed…</option>
            {vacant.map((v) => (
              <option key={v.bed.id} value={v.bed.id}>
                Room {v.room.roomNo} · Bed {v.bed.label} · {money(v.rent)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Moving from">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="New rent">
            <MoneyInput value={rent} onValue={setRent} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function VacateDialog({ open, onClose, tenantId }: { open: boolean; onClose: () => void; tenantId: ID }) {
  const db = useDb();
  const toast = useToast();
  const [on, setOn] = useState(todayStr());

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark as vacated"
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              db.vacateTenant(tenantId, on);
              toast('Marked as vacated. Her last month is charged only for the days she stayed.');
              onClose();
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <Field label="Last day in the hostel">
        <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
      </Field>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        Her bed becomes free from the next day, and the final month's rent is recalculated for the days she
        actually stayed. Her records and receipts are kept.
      </p>
    </Modal>
  );
}
