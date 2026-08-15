import { useMemo, useState } from 'react';
import type { Nav } from '@/app/App';
import { useDb } from '@/data/store';
import type { BillView } from '@/data/types';
import { addMonthKey, monthKey, monthLabel, monthLabelShort, today as todayStr } from '@/domain/dates';
import { money, moneyShort } from '@/ui/format';
import { Button, Card, EmptyState, SectionTitle, StatTile, Segmented, cx } from '@/ui/primitives';
import { IconChart, IconPrint, IconSheet } from '@/ui/icons';
import { printReceipt } from '../receipt';
import { buildRegisterHtml } from './register';
import { useExcelExport } from '../export/useExcelExport';

export function ReportsScreen({ nav }: { nav: Nav }) {
  const db = useDb();
  const [range, setRange] = useState<'6' | '12'>('12');
  const months = Number(range);
  const excel = useExcelExport();
  const [hover, setHover] = useState<number | null>(null);

  const thisMonth = monthKey(todayStr());

  const scoped = useMemo(
    () => db.billViews.filter((b) => nav.branchId === 'all' || b.branchId === nav.branchId),
    [db.billViews, nav.branchId]
  );

  const series = useMemo(() => {
    const keys = Array.from({ length: months }, (_, i) => addMonthKey(thisMonth, i - (months - 1)));
    return keys.map((key) => {
      const bills = scoped.filter((b) => monthKey(b.periodStart) === key);
      const expected = bills.reduce((s, b) => s + b.total, 0);
      const collected = bills.reduce((s, b) => s + b.paid, 0);
      return { key, expected, collected, outstanding: Math.max(0, expected - collected), bills };
    });
  }, [scoped, months, thisMonth]);

  const current = series[series.length - 1];
  const totalCollected = series.reduce((s, m) => s + m.collected, 0);
  const totalExpected = series.reduce((s, m) => s + m.expected, 0);
  const rate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const hasData = totalExpected > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
            Reports
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            What was expected, what came in, and what is still outstanding.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: '6', label: '6 months' },
              { value: '12', label: '12 months' },
            ]}
          />
          <Button variant="primary" onClick={excel.exportNow}>
            <IconSheet size={15} /> Export to Excel
          </Button>
          <Button
            onClick={() =>
              printReceipt(
                buildRegisterHtml({
                  settings: db.db.settings,
                  monthKey: thisMonth,
                  branchName:
                    nav.branchId === 'all'
                      ? 'All branches'
                      : db.db.branches.find((b) => b.id === nav.branchId)?.name ?? '',
                  rows: (current?.bills ?? []).map((bill) => ({
                    bill,
                    tenantName: db.db.tenants.find((t) => t.id === bill.tenantId)?.fullName ?? '—',
                    room: roomLabel(db, bill),
                  })),
                })
              )
            }
          >
            <IconPrint size={15} /> Print rent register
          </Button>
        </div>
      </div>

      {!hasData ? (
        <EmptyState
          icon={<IconChart size={30} />}
          title="No rent history yet"
          message="Once girls are admitted and their rent months begin, collection figures build up here month by month."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label={`Expected · ${monthLabel(thisMonth)}`} value={money(current.expected)} />
            <StatTile label="Collected this month" value={money(current.collected)} tone="good" />
            <StatTile
              label="Outstanding this month"
              value={money(current.outstanding)}
              tone={current.outstanding > 0 ? 'bad' : 'good'}
            />
            <StatTile
              label={`Collection rate · ${months} months`}
              value={`${rate}%`}
              sub={`${money(totalCollected)} of ${money(totalExpected)}`}
            />
          </div>

          <section>
            <SectionTitle
              title="Rent collected each month"
              hint="Bars are what came in. The line above each bar is what was expected."
            />
            <Card className="px-3 py-4 md:px-5 md:py-5">
              <CollectionChart series={series} hover={hover} setHover={setHover} />
            </Card>
          </section>

          <section>
            <SectionTitle title="Branch by branch" hint={monthLabel(thisMonth)} />
            <Card className="scroll-x">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-cream-2/40 text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th className="px-4 py-2.5 text-left font-semibold">Branch</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Beds filled</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Expected</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Collected</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {[...db.db.branches]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((branch) => {
                      const bills = db.billViews.filter(
                        (b) => b.branchId === branch.id && monthKey(b.periodStart) === thisMonth
                      );
                      const expected = bills.reduce((s, b) => s + b.total, 0);
                      const collected = bills.reduce((s, b) => s + b.paid, 0);
                      const beds = db.bedViewsByBranch.get(branch.id) ?? [];
                      const filled = beds.filter((x) => x.tenant).length;
                      return (
                        <tr key={branch.id} className="border-b border-[#f4ecdf] last:border-0">
                          <td className="px-4 py-2.5 font-semibold">{branch.name}</td>
                          <td className="tnum px-3 py-2.5 text-right text-muted">
                            {filled}/{beds.length}
                          </td>
                          <td className="tnum px-3 py-2.5 text-right">{money(expected)}</td>
                          <td className="tnum px-3 py-2.5 text-right text-sage-dk">{money(collected)}</td>
                          <td
                            className={cx(
                              'tnum px-4 py-2.5 text-right font-semibold',
                              expected - collected > 0 ? 'text-terracotta-dk' : 'text-muted'
                            )}
                          >
                            {money(Math.max(0, expected - collected))}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </Card>
          </section>

          {/* The same numbers as the chart, readable without seeing colour. */}
          <section>
            <SectionTitle title="Month by month" hint="The figures behind the chart" />
            <Card className="scroll-x">
              <table className="w-full min-w-[560px] text-[13px]">
                <thead>
                  <tr className="border-b border-line bg-cream-2/40 text-[11px] uppercase tracking-[0.06em] text-muted">
                    <th className="px-4 py-2.5 text-left font-semibold">Month</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Expected</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Collected</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Outstanding</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((m) => (
                    <tr key={m.key} className="border-b border-[#f4ecdf] last:border-0">
                      <td className="px-4 py-2.5 font-medium">{monthLabel(m.key)}</td>
                      <td className="tnum px-3 py-2.5 text-right">{m.expected ? money(m.expected) : '—'}</td>
                      <td className="tnum px-3 py-2.5 text-right text-sage-dk">
                        {m.collected ? money(m.collected) : '—'}
                      </td>
                      <td
                        className={cx(
                          'tnum px-3 py-2.5 text-right',
                          m.outstanding > 0 ? 'font-semibold text-terracotta-dk' : 'text-muted'
                        )}
                      >
                        {m.outstanding ? money(m.outstanding) : '—'}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-muted">
                        {m.expected ? `${Math.round((m.collected / m.expected) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function roomLabel(db: ReturnType<typeof useDb>, bill: BillView): string {
  const stay = db.db.stays.find((s) => s.id === bill.stayId);
  const bed = stay ? db.db.beds.find((b) => b.id === stay.bedId) : null;
  const room = bed ? db.db.rooms.find((r) => r.id === bed.roomId) : null;
  return room ? `${room.roomNo} · ${bed?.label}` : '—';
}

/* --------------------------------------------------------------- chart */

interface MonthPoint {
  key: string;
  expected: number;
  collected: number;
  outstanding: number;
}

/**
 * One measure per column (rent collected) with a rule marking what was
 * expected. A single hue keeps it readable for every kind of colour vision;
 * the rule carries the second value without a competing colour.
 */
function CollectionChart({
  series,
  hover,
  setHover,
}: {
  series: MonthPoint[];
  hover: number | null;
  setHover: (i: number | null) => void;
}) {
  const W = 1000;
  const H = 260;
  const PAD = { top: 18, right: 12, bottom: 30, left: 58 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const peak = Math.max(1, ...series.map((m) => Math.max(m.expected, m.collected)));
  const niceMax = niceCeil(peak);
  const y = (v: number) => PAD.top + plotH - (v / niceMax) * plotH;

  const step = plotW / series.length;
  const barW = Math.min(46, step * 0.56);
  const ticks = [0, niceMax / 2, niceMax];

  const active = hover !== null ? series[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rent collected each month against what was expected">
        {/* gridlines, kept recessive */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#EFE4D2" strokeWidth={1} />
            <text x={PAD.left - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#7C6B5C">
              {t === 0 ? '0' : moneyShort(t)}
            </text>
          </g>
        ))}

        {series.map((m, i) => {
          const cx0 = PAD.left + step * i + step / 2;
          const barX = cx0 - barW / 2;
          const barY = y(m.collected);
          const barH = Math.max(m.collected > 0 ? 3 : 0, PAD.top + plotH - barY);
          const isHover = hover === i;
          const isLast = i === series.length - 1;
          return (
            <g key={m.key}>
              {/* full-height hit area — easier to hover than the bar itself */}
              <rect
                x={PAD.left + step * i}
                y={PAD.top}
                width={step}
                height={plotH}
                fill={isHover ? '#F6ECDB' : 'transparent'}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
              {m.collected > 0 && (
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx={4}
                  fill={isHover ? '#A44C2C' : '#C2643F'}
                  pointerEvents="none"
                />
              )}
              {/* what was expected */}
              {m.expected > 0 && (
                <line
                  x1={barX - 4}
                  x2={barX + barW + 4}
                  y1={y(m.expected)}
                  y2={y(m.expected)}
                  stroke="#3B2D24"
                  strokeWidth={2}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              )}
              <text
                x={cx0}
                y={H - 10}
                textAnchor="middle"
                fontSize={11}
                fill={isHover || isLast ? '#241B15' : '#7C6B5C'}
                fontWeight={isHover || isLast ? 600 : 400}
                pointerEvents="none"
              >
                {monthLabelShort(m.key).replace(' ', ' ')}
              </text>
              {/* label only the newest column, so numbers stay scarce */}
              {isLast && m.collected > 0 && !isHover && (
                <text x={cx0} y={barY - 7} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#241B15">
                  {moneyShort(m.collected)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* legend — always present, because there are two things to tell apart */}
      <div className="mt-1 flex items-center gap-4 pl-[58px] text-[12px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[2px] bg-terracotta" /> Collected
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-brown" /> Expected
        </span>
      </div>

      {active && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-[10px] border border-line bg-white px-3 py-2 text-[12px] shadow-[var(--shadow-lift)]">
          <div className="font-semibold">{monthLabel(active.key)}</div>
          <div className="tnum mt-0.5 text-muted">Expected {money(active.expected)}</div>
          <div className="tnum text-sage-dk">Collected {money(active.collected)}</div>
          {active.outstanding > 0 && (
            <div className="tnum text-terracotta-dk">Outstanding {money(active.outstanding)}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Rounds an axis maximum up to something a person would choose. */
function niceCeil(v: number): number {
  const mag = 10 ** Math.floor(Math.log10(v));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}
