import { useCallback, useEffect, useRef } from 'react';
import { bridge } from '@/data/adapter';
import { useDb } from '@/data/store';
import { useToast } from '@/ui/primitives';
import { buildWorkbookSpec } from './workbook';

/** How long the app waits after the last change before rewriting the Excel copy. */
const AUTO_DELAY_MS = 8000;

/**
 * The Excel side of the register.
 *
 * `exportNow` asks where to save and opens the file. When the automatic copy is
 * switched on, the same workbook is rewritten into the chosen folder a few
 * seconds after things settle down — batched, so entering ten payments writes
 * the file once rather than ten times.
 */
export function useExcelExport() {
  const db = useDb();
  const toast = useToast();
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const lastWarned = useRef<string>('');

  const buildSpec = useCallback(
    () =>
      buildWorkbookSpec({
        db: db.db,
        billViews: db.billViews,
        bedViews: db.bedViews,
        balanceByTenant: db.balanceByTenant,
      }),
    [db.db, db.billViews, db.bedViews, db.balanceByTenant]
  );

  const exportNow = useCallback(async () => {
    const api = bridge();
    if (!api) {
      toast('Excel export works in the installed app', 'info');
      return;
    }
    const res = await api.excel.save(buildSpec());
    if (res.ok) toast('Excel sheet saved and opened');
    else if (res.error) toast(res.error, 'bad');
  }, [buildSpec, toast]);

  const chooseFolder = useCallback(async () => {
    const api = bridge();
    if (!api) return;
    const res = await api.excel.chooseFolder();
    if (!res.ok || !res.folder) return;
    db.updateSettings({ excel: { ...db.db.settings.excel, folder: res.folder, auto: true } });
    toast('Excel copy will be kept in this folder');
  }, [db, toast]);

  const { auto, folder } = db.db.settings.excel;
  const stamp = db.db.updatedAt;

  useEffect(() => {
    const api = bridge();
    if (!api || !auto || !folder) return;

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await api.excel.autoSave(buildSpec(), folder);
        if (!res.ok && res.error && res.error !== lastWarned.current) {
          // Only complain once per distinct problem — usually the file being
          // open in Excel, which fixes itself the moment it is closed.
          lastWarned.current = res.error;
          toast(res.error, 'bad');
        }
        if (res.ok) lastWarned.current = '';
      } finally {
        inFlight.current = false;
      }
    }, AUTO_DELAY_MS);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [auto, folder, stamp, buildSpec, toast]);

  return { exportNow, chooseFolder, auto, folder };
}
