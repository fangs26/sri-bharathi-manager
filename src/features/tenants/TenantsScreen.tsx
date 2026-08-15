import { useEffect, useMemo, useState } from 'react';
import type { Nav } from '@/app/App';
import { useDb } from '@/data/store';
import type { ID, TenantStatus } from '@/data/types';
import { humanDate } from '@/domain/dates';
import { worstStatus } from '@/domain/billing';
import { money, prettyPhone } from '@/ui/format';
import { Avatar, Button, Card, EmptyState, Input, Segmented, StatusChip, cx } from '@/ui/primitives';
import { useIsMobile } from '@/ui/useMediaQuery';
import { IconPlus, IconSearch, IconUsers } from '@/ui/icons';
import { AdmitDialog } from './AdmitDialog';
import { TenantSheet } from './TenantSheet';
import { PaymentDialog } from '../billing/PaymentDialog';

type Filter = TenantStatus | 'all';

export function TenantsScreen({ nav }: { nav: Nav }) {
  const db = useDb();
  const isMobile = useIsMobile();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [admitOpen, setAdmitOpen] = useState(false);
  const [sheetTenantId, setSheetTenantId] = useState<ID | null>(null);
  const [payFor, setPayFor] = useState<{ tenantId: ID; billId?: ID } | null>(null);

  // Opening a girl straight from another screen.
  useEffect(() => {
    if (nav.focusTenantId) {
      setSheetTenantId(nav.focusTenantId);
      nav.clearFocus();
    }
  }, [nav]);

  const scoped = useMemo(
    () => db.db.tenants.filter((t) => nav.branchId === 'all' || t.branchId === nav.branchId),
    [db.db.tenants, nav.branchId]
  );

  const counts = useMemo(
    () => ({
      active: scoped.filter((t) => t.status === 'active').length,
      notice: scoped.filter((t) => t.status === 'notice').length,
      vacated: scoped.filter((t) => t.status === 'vacated').length,
      all: scoped.length,
    }),
    [scoped]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scoped
      .filter((t) => filter === 'all' || t.status === filter)
      .filter((t) => {
        if (!needle) return true;
        const stay = db.currentStayOf(t.id);
        const bed = stay ? db.db.beds.find((b) => b.id === stay.bedId) : null;
        const room = bed ? db.db.rooms.find((r) => r.id === bed.roomId) : null;
        return (
          t.fullName.toLowerCase().includes(needle) ||
          (t.phone ?? '').includes(needle) ||
          (t.orgName ?? '').toLowerCase().includes(needle) ||
          (room ? `room ${room.roomNo}`.includes(needle) || room.roomNo.includes(needle) : false)
        );
      })
      .map((t) => {
        const stay = db.currentStayOf(t.id);
        const bed = stay ? db.db.beds.find((b) => b.id === stay.bedId) : null;
        const room = bed ? db.db.rooms.find((r) => r.id === bed.roomId) : null;
        const bills = db.billsByTenant.get(t.id) ?? [];
        return {
          tenant: t,
          room,
          bed,
          rent: stay?.agreedRent ?? 0,
          balance: db.balanceByTenant.get(t.id) ?? 0,
          // Shared with the bed map, so the two views can never rank the same
          // resident differently.
          status: worstStatus(bills),
        };
      })
      .sort((a, b) => b.balance - a.balance || a.tenant.fullName.localeCompare(b.tenant.fullName));
  }, [scoped, filter, q, db]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
            Girls
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">Everyone staying with us, and what they owe.</p>
        </div>
        <Button variant="primary" onClick={() => setAdmitOpen(true)}>
          <IconPlus size={15} /> <span className="hidden sm:inline">Add a girl</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="scroll-x -mx-1 px-1">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Staying', count: counts.active },
              { value: 'notice', label: 'On notice', count: counts.notice },
              { value: 'vacated', label: 'Left', count: counts.vacated },
              { value: 'all', label: 'All', count: counts.all },
            ]}
          />
        </div>
        <div className="relative w-full sm:w-64">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, room…"
            className="pl-9"
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<IconUsers size={30} />}
          title={q ? 'Nobody matches that search' : 'No girls here yet'}
          message={q ? 'Try a different name, phone number or room.' : 'Add the first girl and give her a bed.'}
          action={
            !q && (
              <Button variant="primary" onClick={() => setAdmitOpen(true)}>
                <IconPlus size={15} /> Add a girl
              </Button>
            )
          }
        />
      ) : isMobile ? (
        /* One tappable card per girl — a seven-column table is unreadable on a
           phone, and side-scrolling to find the amount due is worse. */
        <div className="space-y-2">
          {rows.map(({ tenant, room, bed, rent, balance, status }) => (
            <button
              key={tenant.id}
              onClick={() => setSheetTenantId(tenant.id)}
              className="card flex w-full items-center gap-3 px-3.5 py-3 text-left"
            >
              <Avatar name={tenant.fullName} size={38} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{tenant.fullName}</div>
                <div className="truncate text-[12px] text-muted">
                  {room ? `Room ${room.roomNo} · Bed ${bed?.label}` : 'No bed'}
                  {tenant.phone && ` · ${prettyPhone(tenant.phone)}`}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {tenant.status === 'vacated' ? (
                    <span className="text-[11.5px] text-muted">Left {humanDate(tenant.vacateDate)}</span>
                  ) : (
                    <StatusChip status={status} />
                  )}
                  <span className="tnum text-[11.5px] text-muted">{rent ? `${money(rent)}/mo` : ''}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {balance > 0 ? (
                  <>
                    <div className="tnum text-[15px] font-semibold text-terracotta-dk">{money(balance)}</div>
                    <div className="text-[11px] text-muted">pending</div>
                  </>
                ) : (
                  <div className="text-[12px] text-sage-dk">clear</div>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-line bg-cream-2/40 text-[11px] uppercase tracking-[0.06em] text-muted">
                <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                <th className="px-3 py-2.5 text-left font-semibold">Room</th>
                <th className="px-3 py-2.5 text-left font-semibold">Phone</th>
                <th className="px-3 py-2.5 text-left font-semibold">Joined</th>
                <th className="px-3 py-2.5 text-right font-semibold">Rent</th>
                <th className="px-3 py-2.5 text-right font-semibold">Pending</th>
                <th className="px-4 py-2.5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tenant, room, bed, rent, balance, status }) => (
                <tr
                  key={tenant.id}
                  onClick={() => setSheetTenantId(tenant.id)}
                  className="cursor-pointer border-b border-[#f4ecdf] transition last:border-0 hover:bg-cream-2/40"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={tenant.fullName} size={30} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{tenant.fullName}</div>
                        {tenant.orgName && <div className="truncate text-[11.5px] text-muted">{tenant.orgName}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {room ? `${room.roomNo} · ${bed?.label}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 tnum text-muted">{tenant.phone ? prettyPhone(tenant.phone) : '—'}</td>
                  <td className="px-3 py-2.5 text-muted">{humanDate(tenant.joinDate)}</td>
                  <td className="px-3 py-2.5 text-right tnum">{rent ? money(rent) : '—'}</td>
                  <td
                    className={cx(
                      'px-3 py-2.5 text-right tnum font-semibold',
                      balance > 0 ? 'text-terracotta-dk' : 'text-muted'
                    )}
                  >
                    {balance > 0 ? money(balance) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {tenant.status === 'vacated' ? (
                      <span className="text-[12px] text-muted">Left {humanDate(tenant.vacateDate)}</span>
                    ) : (
                      <StatusChip status={status} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
