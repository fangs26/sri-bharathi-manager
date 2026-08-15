import { useEffect, useMemo, useState } from 'react';
import { useDb } from '@/data/store';
import { humanDate, today } from '@/domain/dates';
import { Emblem } from './Brand';
import {
  IconBed,
  IconChart,
  IconHome,
  IconRupee,
  IconSettings,
  IconUsers,
} from '@/ui/icons';
import { cx } from '@/ui/primitives';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { BedMap } from '@/features/beds/BedMap';
import { TenantsScreen } from '@/features/tenants/TenantsScreen';
import { DuesScreen } from '@/features/billing/DuesScreen';
import { ReportsScreen } from '@/features/reports/ReportsScreen';
import { SettingsScreen } from '@/features/settings/SettingsScreen';
import { useExcelExport } from '@/features/export/useExcelExport';

export type View = 'dashboard' | 'beds' | 'tenants' | 'dues' | 'reports' | 'settings';

const NAV: { id: View; label: string; short: string; icon: typeof IconHome }[] = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: IconHome },
  { id: 'beds', label: 'Rooms & Beds', short: 'Beds', icon: IconBed },
  { id: 'tenants', label: 'Girls', short: 'Girls', icon: IconUsers },
  { id: 'dues', label: 'Rent & Dues', short: 'Rent', icon: IconRupee },
  { id: 'reports', label: 'Reports', short: 'Reports', icon: IconChart },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: IconSettings },
];

export interface Nav {
  go(view: View, opts?: { branchId?: string; tenantId?: string }): void;
  branchId: string | 'all';
  setBranchId(id: string | 'all'): void;
  focusTenantId: string | null;
  clearFocus(): void;
}

export function App() {
  const { db, ready, saving } = useDb();
  const [view, setView] = useState<View>('dashboard');
  const [branchId, setBranchId] = useState<string | 'all'>('all');
  const [focusTenantId, setFocusTenantId] = useState<string | null>(null);

  // Mounted here rather than inside Settings so the automatic Excel copy keeps
  // updating whichever screen is open.
  const excel = useExcelExport();

  const nav: Nav = useMemo(
    () => ({
      go(next, opts) {
        if (opts?.branchId) setBranchId(opts.branchId);
        if (opts?.tenantId) setFocusTenantId(opts.tenantId);
        setView(next);
      },
      branchId,
      setBranchId,
      focusTenantId,
      clearFocus: () => setFocusTenantId(null),
    }),
    [branchId, focusTenantId]
  );

  // Ctrl+1…6 jumps between screens — quick for daily use.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < NAV.length) {
        e.preventDefault();
        setView(NAV[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center bg-cream">
        <div className="flex flex-col items-center gap-3 opacity-70">
          <Emblem size={44} />
          <span className="text-[13px] text-muted">Opening your register…</span>
        </div>
      </div>
    );
  }

  const branches = [...db.branches].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex h-full flex-col bg-cream md:flex-row">
      {/* ------------------------------------------------------ sidebar */}
      <nav className="hidden w-[228px] shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-4">
          <Emblem size={34} />
          <div className="min-w-0">
            <div className="truncate font-[var(--font-display)] text-[14px] font-semibold leading-tight tracking-[-0.01em]">
              Sri Bharathi
            </div>
            <div className="truncate text-[11px] text-muted">PG for Women</div>
          </div>
        </div>

        <div className="flex-1 space-y-0.5 px-2.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition',
                  active ? 'bg-cream-2 font-semibold text-ink' : 'text-brown/80 hover:bg-cream-2/60 hover:text-ink'
                )}
              >
                <Icon size={17} className={active ? 'text-terracotta' : 'text-muted'} />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="px-4 pb-4 pt-3 text-[11px] leading-relaxed text-muted">
          <div className={cx('flex items-center gap-1.5', saving ? 'text-gold' : 'text-sage')}>
            <span className={cx('h-1.5 w-1.5 rounded-full', saving ? 'bg-gold' : 'bg-sage')} />
            {saving ? 'Saving…' : 'All changes saved'}
          </div>
          <div className="mt-1">
            {excel.auto && excel.folder ? 'Excel sheet kept up to date' : 'Data on this computer'}
          </div>
        </div>
      </nav>

      {/* --------------------------------------------------------- main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone title bar — the sidebar's identity, compressed. */}
        <div className="flex items-center gap-2.5 border-b border-line bg-white px-4 py-2.5 md:hidden">
          <Emblem size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-[var(--font-display)] text-[14px] font-semibold leading-tight">
              Sri Bharathi
            </div>
            <div className="truncate text-[11px] text-muted">{humanDate(today())}</div>
          </div>
          <span
            className={cx('h-2 w-2 shrink-0 rounded-full', saving ? 'bg-gold' : 'bg-sage')}
            title={saving ? 'Saving…' : 'All changes saved'}
          />
        </div>

        <header className="scroll-x flex shrink-0 items-center justify-between gap-4 border-b border-line bg-white/70 px-4 py-2 backdrop-blur md:h-14 md:px-6 md:py-0">
          <div className="flex items-center gap-1.5 md:gap-2">
            <BranchPill
              label="All branches"
              active={branchId === 'all'}
              onClick={() => setBranchId('all')}
            />
            {branches.map((b) => (
              <BranchPill
                key={b.id}
                label={b.name}
                active={branchId === b.id}
                onClick={() => setBranchId(b.id)}
              />
            ))}
          </div>
          <div className="hidden text-[12.5px] text-muted md:block">{humanDate(today())}</div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-4 py-4 pb-6 md:px-6 md:py-6">
            {view === 'dashboard' && <Dashboard nav={nav} />}
            {view === 'beds' && <BedMap nav={nav} />}
            {view === 'tenants' && <TenantsScreen nav={nav} />}
            {view === 'dues' && <DuesScreen nav={nav} />}
            {view === 'reports' && <ReportsScreen nav={nav} />}
            {view === 'settings' && <SettingsScreen />}
          </div>
        </main>

        {/* ------------------------------------------- phone bottom bar */}
        <nav
          className="flex shrink-0 items-stretch justify-around border-t border-line bg-white md:hidden"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-[54px] flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 pb-1 transition',
                  active ? 'text-terracotta-dk' : 'text-muted'
                )}
              >
                <Icon size={20} className={active ? 'text-terracotta' : 'text-muted'} />
                <span className={cx('text-[10.5px] leading-none', active && 'font-semibold')}>
                  {item.short}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function BranchPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition',
        active ? 'bg-ink text-cream' : 'text-muted hover:bg-cream-2 hover:text-ink'
      )}
    >
      {label}
    </button>
  );
}
