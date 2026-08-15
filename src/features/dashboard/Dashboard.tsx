import { useMemo, useState } from 'react';
import type { Nav } from '@/app/App';
import { useDb } from '@/data/store';
import type { ID } from '@/data/types';
import { addDays, humanDate, monthKey, monthLabel, periodLabel, today as todayStr } from '@/domain/dates';
import { money, pluralize } from '@/ui/format';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ProgressBar,
  SectionTitle,
  StatTile,
  StatusChip,
  cx,
} from '@/ui/primitives';
import { IconBed, IconPlus, IconRupee, IconUsers } from '@/ui/icons';
import { AdmitDialog } from '../tenants/AdmitDialog';
import { TenantSheet } from '../tenants/TenantSheet';
import { PaymentDialog } from '../billing/PaymentDialog';

export function Dashboard({ nav }: { nav: Nav }) {
  const db = useDb();
  const [admitOpen, setAdmitOpen] = useState(false);
  const [sheetTenantId, setSheetTenantId] = useState<ID | null>(null);
  const [payFor, setPayFor] = useState<{ tenantId: ID; billId?: ID } | null>(null);

  const today = todayStr();
  const thisMonth = monthKey(today);
  const inScope = <T extends { branchId: string }>(x: T) => nav.branchId === 'all' || x.branchId === nav.branchId;

  const beds = useMemo(
    () => db.bedViews.filter((v) => nav.branchId === 'all' || v.room.branchId === nav.branchId),
    [db.bedViews, nav.branchId]
  );
  const filled = beds.filter((b) => b.tenant).length;

  const bills = useMemo(() => db.billViews.filter(inScope), [db.billViews, nav.branchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthBills = bills.filter((b) => monthKey(b.periodStart) === thisMonth);
  const collected = monthBills.reduce((s, b) => s + b.paid, 0);
  const expected = monthBills.reduce((s, b) => s + b.total, 0);
  const pending = bills.filter((b) => b.balance > 0);
  const outstanding = pending.reduce((s, b) => s + b.balance, 0);
  const overdue = pending.filter((b) => b.status === 'overdue').sort((a, b) => b.daysOverdue - a.daysOverdue);

  const soon = useMemo(() => {
    const limit = addDays(today, 7);
    return pending
      .filter((b) => b.status !== 'overdue' && b.dueDate >= today && b.dueDate <= limit)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [pending, today]);

  // Someone serving out her notice is still living here, so she counts.
  const activeGirls = db.db.tenants.filter((t) => t.status !== 'vacated' && inScope(t)).length;
  const branches = [...db.db.branches].sort((a, b) => a.sortOrder - b.sortOrder);

  const empty = db.db.rooms.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
            {greeting()}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            {monthLabel(thisMonth)} · here's where the hostel stands today.
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1 sm:flex-none" onClick={() => setAdmitOpen(true)}>
            <IconPlus size={15} /> Add a girl
          </Button>
          <Button variant="primary" className="flex-1 sm:flex-none" onClick={() => nav.go('dues')}>
            <IconRupee size={15} /> Record payment
          </Button>
        </div>
      </div>

      {empty ? (
        <EmptyState
          icon={<IconBed size={30} />}
          title="Let's set up your hostel"
          message="Start by adding the rooms in each branch and the beds inside them. Then add the girls staying in each bed."
          action={
            <Button variant="primary" onClick={() => nav.go('beds')}>
              Set up rooms & beds
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Beds filled"
              value={`${filled}/${beds.length}`}
              sub={
                <span className="block">
                  <ProgressBar value={filled} max={beds.length} tone={filled === beds.length ? 'sage' : 'terracotta'} />
                  <span className="mt-1 block">{beds.length - filled} free</span>
                </span>
              }
              icon={<IconBed size={13} />}
              onClick={() => nav.go('beds')}
            />
            <StatTile
              label="Collected this month"
              value={money(collected)}
              tone="good"
              sub={expected > 0 ? `of ${money(expected)} expected` : 'no bills yet'}
              icon={<IconRupee size={13} />}
              onClick={() => nav.go('dues')}
            />
            <StatTile
              label="Outstanding"
              value={money(outstanding)}
              tone={outstanding > 0 ? 'bad' : 'good'}
              sub={pluralize(pending.length, 'unpaid bill')}
              onClick={() => nav.go('dues')}
            />
            <StatTile
              label="Girls staying"
              value={activeGirls}
              sub={`${db.db.rooms.filter((r) => inScope(r)).length} rooms`}
              icon={<IconUsers size={13} />}
              onClick={() => nav.go('tenants')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* overdue */}
            <section>
              <SectionTitle
                title="Needs chasing"
                hint={overdue.length ? `${pluralize(overdue.length, 'girl')} past the due date` : 'Nothing overdue'}
                action={
                  overdue.length > 0 && (
                    <Button size="sm" onClick={() => nav.go('dues')}>
                      See all
                    </Button>
                  )
                }
              />
              {overdue.length === 0 ? (
                <Card className="px-4 py-8 text-center text-[13px] text-muted">
                  Everyone is up to date. 🌿
                </Card>
              ) : (
                <Card className="divide-y divide-[#f4ecdf]">
                  {overdue.slice(0, 6).map((bill) => {
                    const tenant = db.db.tenants.find((t) => t.id === bill.tenantId);
                    if (!tenant) return null;
                    return (
                      <button
                        key={bill.id}
                        onClick={() => setSheetTenantId(tenant.id)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-cream-2/40"
                      >
                        <Avatar name={tenant.fullName} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold">{tenant.fullName}</div>
                          <div className="text-[11.5px] text-muted">
                            {periodLabel(bill.periodStart, bill.periodEnd)} · {bill.daysOverdue} days late
                          </div>
                        </div>
                        <span className="tnum text-[13.5px] font-semibold text-terracotta-dk">
                          {money(bill.balance)}
                        </span>
                      </button>
                    );
                  })}
                </Card>
              )}
            </section>

            {/* due soon */}
            <section>
              <SectionTitle
                title="Due in the next 7 days"
                hint={soon.length ? `${pluralize(soon.length, 'payment')} coming up` : 'Nothing due this week'}
              />
              {soon.length === 0 ? (
                <Card className="px-4 py-8 text-center text-[13px] text-muted">
                  No rent falls due in the next week.
                </Card>
              ) : (
                <Card className="divide-y divide-[#f4ecdf]">
                  {soon.slice(0, 6).map((bill) => {
                    const tenant = db.db.tenants.find((t) => t.id === bill.tenantId);
                    if (!tenant) return null;
                    return (
                      <button
                        key={bill.id}
                        onClick={() => setPayFor({ tenantId: tenant.id, billId: bill.id })}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-cream-2/40"
                      >
                        <Avatar name={tenant.fullName} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold">{tenant.fullName}</div>
                          <div className="text-[11.5px] text-muted">due {humanDate(bill.dueDate)}</div>
                        </div>
                        <span className="tnum text-[13.5px] font-semibold">{money(bill.balance)}</span>
                        <StatusChip status={bill.status} />
                      </button>
                    );
                  })}
                </Card>
              )}
            </section>
          </div>

          {/* branches */}
          <section>
            <SectionTitle title="Branches" hint="Occupancy and dues, branch by branch" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {branches.map((branch) => {
                const bBeds = db.bedViewsByBranch.get(branch.id) ?? [];
                const bFilled = bBeds.filter((x) => x.tenant).length;
                const bDue = db.billViews
                  .filter((x) => x.branchId === branch.id && x.balance > 0)
                  .reduce((s, x) => s + x.balance, 0);
                return (
                  <Card key={branch.id} className="px-4 py-3.5">
                    <button className="w-full text-left" onClick={() => nav.go('beds', { branchId: branch.id })}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-[var(--font-display)] text-[14.5px] font-semibold">{branch.name}</span>
                        <span className="tnum text-[12.5px] text-muted">
                          {bFilled}/{bBeds.length}
                        </span>
                      </div>
                      <div className="mt-2">
                        <ProgressBar
                          value={bFilled}
                          max={bBeds.length}
                          tone={bBeds.length > 0 && bFilled === bBeds.length ? 'sage' : 'terracotta'}
                        />
                      </div>
                      <div className="mt-2.5 flex items-baseline justify-between text-[12px]">
                        <span className="text-muted">
                          {bBeds.length - bFilled === 0 ? 'Full' : `${bBeds.length - bFilled} beds free`}
                        </span>
                        <span className={cx('tnum font-semibold', bDue > 0 ? 'text-terracotta-dk' : 'text-sage-dk')}>
                          {bDue > 0 ? `${money(bDue)} due` : 'all clear'}
                        </span>
                      </div>
                    </button>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}

      <AdmitDialog
        open={admitOpen}
        onClose={() => setAdmitOpen(false)}
        presetBranchId={nav.branchId === 'all' ? null : nav.branchId}
      />
      <TenantSheet
        tenantId={sheetTenantId}
        onClose={() => setSheetTenantId(null)}
        onRecordPayment={(tenantId, billId) => setPayFor({ tenantId, billId })}
      />
      <PaymentDialog
        open={!!payFor}
        tenantId={payFor?.tenantId ?? null}
        billId={payFor?.billId}
        onClose={() => setPayFor(null)}
      />
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
