import { useMemo, useState } from 'react';
import type { Nav } from '@/app/App';
import { useDb } from '@/data/store';
import type { BillView, ID } from '@/data/types';
import { humanDate, monthKey, monthLabel, periodLabel, today as todayStr } from '@/domain/dates';
import { money } from '@/ui/format';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Modal,
  Segmented,
  StatTile,
  StatusChip,
  cx,
  useToast,
} from '@/ui/primitives';
import { useIsMobile } from '@/ui/useMediaQuery';
import { IconCheck, IconRupee, IconWhatsApp } from '@/ui/icons';
import { PaymentDialog } from './PaymentDialog';
import { TenantSheet } from '../tenants/TenantSheet';
import { fillTemplate, openWhatsApp } from '../messaging';

type Filter = 'pending' | 'overdue' | 'settled' | 'all';

export function DuesScreen({ nav }: { nav: Nav }) {
  const db = useDb();
  const toast = useToast();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<Filter>('pending');
  const [payFor, setPayFor] = useState<{ tenantId: ID; billId?: ID } | null>(null);
  const [sheetTenantId, setSheetTenantId] = useState<ID | null>(null);
  const [remindersOpen, setRemindersOpen] = useState(false);

  const thisMonth = monthKey(todayStr());

  const scoped = useMemo(
    () => db.billViews.filter((b) => nav.branchId === 'all' || b.branchId === nav.branchId),
    [db.billViews, nav.branchId]
  );

  const monthBills = useMemo(
    () => scoped.filter((b) => monthKey(b.periodStart) === thisMonth),
    [scoped, thisMonth]
  );

  const expected = monthBills.reduce((s, b) => s + b.total, 0);
  const collected = monthBills.reduce((s, b) => s + b.paid, 0);

  // Everything still unpaid, whichever month it belongs to.
  const allPending = useMemo(
    () => scoped.filter((b) => b.balance > 0).sort((a, b) => b.daysOverdue - a.daysOverdue || a.periodStart.localeCompare(b.periodStart)),
    [scoped]
  );
  const outstanding = allPending.reduce((s, b) => s + b.balance, 0);
  const overdueOnly = allPending.filter((b) => b.status === 'overdue');

  const rows = useMemo(() => {
    if (filter === 'pending') return allPending;
    if (filter === 'overdue') return overdueOnly;
    if (filter === 'settled') return scoped.filter((b) => b.balance <= 0).sort((a, b) => b.periodStart.localeCompare(a.periodStart));
    return [...scoped].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  }, [filter, allPending, overdueOnly, scoped]);

  const counts = {
    pending: allPending.length,
    overdue: overdueOnly.length,
    settled: scoped.length - allPending.length,
    all: scoped.length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
            Rent & Dues
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">Who has paid, who hasn't, and how late they are.</p>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1 lg:flex-none"
            onClick={() => {
              const n = db.runBillGeneration();
              toast(n ? `${n} new rent month(s) added` : 'Everything is already up to date', n ? 'good' : 'info');
            }}
          >
            <span className="hidden sm:inline">Generate this month's bills</span>
            <span className="sm:hidden">Generate bills</span>
          </Button>
          <Button
            variant="primary"
            className="flex-1 lg:flex-none"
            disabled={!overdueOnly.length}
            onClick={() => setRemindersOpen(true)}
          >
            <IconWhatsApp size={15} /> <span className="hidden sm:inline">Send reminders</span>
            <span className="sm:hidden">Remind</span>
            {overdueOnly.length > 0 && <span className="tnum">({overdueOnly.length})</span>}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label={`Expected · ${monthLabel(thisMonth)}`}
          value={money(expected)}
          sub={`${monthBills.length} rent months raised`}
          icon={<IconRupee size={13} />}
        />
        <StatTile
          label="Collected this month"
          value={money(collected)}
          tone="good"
          sub={expected > 0 ? `${Math.round((collected / expected) * 100)}% of what was expected` : '—'}
          icon={<IconCheck size={13} />}
        />
        <StatTile
          label="Outstanding (all months)"
          value={money(outstanding)}
          tone={outstanding > 0 ? 'bad' : 'good'}
          sub={`${allPending.length} unpaid ${allPending.length === 1 ? 'bill' : 'bills'}`}
        />
      </div>

      <div className="scroll-x -mx-1 px-1">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
          { value: 'pending', label: 'Pending', count: counts.pending },
          { value: 'overdue', label: 'Overdue', count: counts.overdue },
          { value: 'settled', label: 'Settled', count: counts.settled },
          { value: 'all', label: 'All', count: counts.all },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconCheck size={30} />}
          title={filter === 'pending' ? 'Nothing pending — everyone has paid' : 'Nothing to show here'}
          message={
            filter === 'pending'
              ? 'New rent months appear here automatically as they begin.'
              : undefined
          }
        />
      ) : isMobile ? (
        /* Name, what she owes and how late — the three things worth knowing,
           with the payment button under the thumb. */
        <div className="space-y-2">
          {rows.map((bill) => (
            <MobileDueCard
              key={bill.id}
              bill={bill}
              onOpen={() => setSheetTenantId(bill.tenantId)}
              onPay={() => setPayFor({ tenantId: bill.tenantId, billId: bill.id })}
            />
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line bg-cream-2/40 text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 text-left font-semibold">Girl</th>
                <th className="px-3 py-2.5 text-left font-semibold">Period</th>
                <th className="px-3 py-2.5 text-left font-semibold">Due</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total</th>
                <th className="px-3 py-2.5 text-right font-semibold">Paid</th>
                <th className="px-3 py-2.5 text-right font-semibold">Balance</th>
                <th className="px-4 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((bill) => (
                <DueRow
                  key={bill.id}
                  bill={bill}
                  onOpen={() => setSheetTenantId(bill.tenantId)}
                  onPay={() => setPayFor({ tenantId: bill.tenantId, billId: bill.id })}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <RemindersModal open={remindersOpen} onClose={() => setRemindersOpen(false)} bills={overdueOnly} />

      <PaymentDialog
        open={!!payFor}
        tenantId={payFor?.tenantId ?? null}
        billId={payFor?.billId}
        onClose={() => setPayFor(null)}
      />
      <TenantSheet
        tenantId={sheetTenantId}
        onClose={() => setSheetTenantId(null)}
        onRecordPayment={(tenantId, billId) => setPayFor({ tenantId, billId })}
      />
    </div>
  );
}

function MobileDueCard({
  bill,
  onOpen,
  onPay,
}: {
  bill: BillView;
  onOpen: () => void;
  onPay: () => void;
}) {
  const db = useDb();
  const tenant = db.db.tenants.find((t) => t.id === bill.tenantId);
  const stay = db.db.stays.find((s) => s.id === bill.stayId);
  const bed = stay ? db.db.beds.find((b) => b.id === stay.bedId) : null;
  const room = bed ? db.db.rooms.find((r) => r.id === bed.roomId) : null;
  if (!tenant) return null;

  return (
    <div className="card px-3.5 py-3">
      <button onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        <Avatar name={tenant.fullName} size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold">{tenant.fullName}</div>
          <div className="truncate text-[12px] text-muted">
            {room ? `Room ${room.roomNo} · Bed ${bed?.label}` : '—'} ·{' '}
            {periodLabel(bill.periodStart, bill.periodEnd)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={cx(
              'tnum text-[16px] font-semibold',
              bill.balance > 0 ? 'text-terracotta-dk' : 'text-sage-dk'
            )}
          >
            {bill.balance > 0 ? money(bill.balance) : money(bill.total)}
          </div>
          <div className="text-[11px] text-muted">
            {bill.balance > 0 ? `of ${money(bill.total)}` : 'settled'}
          </div>
        </div>
      </button>
      <div className="mt-2.5 flex items-center gap-2">
        <StatusChip status={bill.status} />
        {bill.daysOverdue > 0 && (
          <span className="text-[11.5px] font-semibold text-terracotta-dk">
            {bill.daysOverdue} days late
          </span>
        )}
        {bill.daysOverdue === 0 && bill.balance > 0 && (
          <span className="text-[11.5px] text-muted">due {humanDate(bill.dueDate)}</span>
        )}
        {bill.balance > 0 && (
          <Button size="sm" variant="primary" className="ml-auto" onClick={onPay}>
            Record payment
          </Button>
        )}
      </div>
    </div>
  );
}

function DueRow({ bill, onOpen, onPay }: { bill: BillView; onOpen: () => void; onPay: () => void }) {
  const db = useDb();
  const tenant = db.db.tenants.find((t) => t.id === bill.tenantId);
  const stay = db.db.stays.find((s) => s.id === bill.stayId);
  const bed = stay ? db.db.beds.find((b) => b.id === stay.bedId) : null;
  const room = bed ? db.db.rooms.find((r) => r.id === bed.roomId) : null;
  if (!tenant) return null;

  return (
    <tr className="border-b border-[#f4ecdf] transition last:border-0 hover:bg-cream-2/40">
      <td className="cursor-pointer px-4 py-2.5" onClick={onOpen}>
        <div className="flex items-center gap-2.5">
          <Avatar name={tenant.fullName} size={30} />
          <div>
            <div className="font-semibold">{tenant.fullName}</div>
            <div className="text-[11.5px] text-muted">{room ? `Room ${room.roomNo} · Bed ${bed?.label}` : '—'}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-muted">{periodLabel(bill.periodStart, bill.periodEnd)}</td>
      <td className="px-3 py-2.5">
        <div className="text-muted">{humanDate(bill.dueDate)}</div>
        {bill.daysOverdue > 0 && (
          <div className="text-[11.5px] font-semibold text-terracotta-dk">{bill.daysOverdue} days late</div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tnum">{money(bill.total)}</td>
      <td className="px-3 py-2.5 text-right tnum text-sage-dk">{bill.paid > 0 ? money(bill.paid) : '—'}</td>
      <td className={cx('px-3 py-2.5 text-right tnum font-semibold', bill.balance > 0 ? 'text-terracotta-dk' : 'text-muted')}>
        {bill.balance > 0 ? money(bill.balance) : '—'}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {bill.balance > 0 ? (
            <Button size="sm" variant="primary" onClick={onPay}>
              Record
            </Button>
          ) : (
            <StatusChip status={bill.status} />
          )}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------- reminders */

function RemindersModal({
  open,
  onClose,
  bills,
}: {
  open: boolean;
  onClose: () => void;
  bills: BillView[];
}) {
  const db = useDb();
  const [sent, setSent] = useState<Set<string>>(new Set());

  const s = db.db.settings;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send rent reminders"
      subtitle="Each one opens WhatsApp with the message ready — you press send"
      width="md"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="space-y-2">
        {bills.map((bill) => {
          const tenant = db.db.tenants.find((t) => t.id === bill.tenantId);
          if (!tenant) return null;
          const message = fillTemplate(s.whatsapp.overdueReminder, {
            name: tenant.fullName.split(' ')[0],
            amount: bill.balance,
            period: periodLabel(bill.periodStart, bill.periodEnd),
            due: humanDate(bill.dueDate),
            daysOverdue: bill.daysOverdue,
            hostel: s.hostelName,
          });
          const isSent = sent.has(bill.id);
          return (
            <div key={bill.id} className="card px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={tenant.fullName} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold">{tenant.fullName}</div>
                  <div className="tnum text-[12px] text-muted">
                    {money(bill.balance)} · {bill.daysOverdue} days late · {tenant.phone || 'no phone'}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={isSent ? 'secondary' : 'primary'}
                  disabled={!tenant.phone}
                  onClick={() => {
                    openWhatsApp(tenant.phone, message);
                    setSent((prev) => new Set(prev).add(bill.id));
                  }}
                >
                  {isSent ? <><IconCheck size={14} /> Opened</> : <><IconWhatsApp size={14} /> Send</>}
                </Button>
              </div>
              <p className="mt-2 rounded-[10px] bg-cream-2/60 px-3 py-2 text-[12px] leading-relaxed text-brown">
                {message}
              </p>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
