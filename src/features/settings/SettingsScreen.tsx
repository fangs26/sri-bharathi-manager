import { useEffect, useState } from 'react';
import { bridge } from '@/data/adapter';
import { useDb } from '@/data/store';
import type { ChargePreset, ChargeType } from '@/data/types';
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  MoneyInput,
  SectionTitle,
  Select,
  Textarea,
  useToast,
} from '@/ui/primitives';
import { IconCloud, IconDownload, IconPlus, IconSheet, IconTrash, IconUpload } from '@/ui/icons';
import { money } from '@/ui/format';
import { useExcelExport } from '../export/useExcelExport';

export function SettingsScreen() {
  const db = useDb();
  const toast = useToast();
  const s = db.db.settings;
  const [info, setInfo] = useState<{ version: string; dataPath: string; backupPath: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmSample, setConfirmSample] = useState(false);

  useEffect(() => {
    bridge()?.appInfo().then(setInfo);
  }, []);

  const setPresets = (presets: ChargePreset[]) => db.updateSettings({ chargePresets: presets });

  return (
    <div className="space-y-7 pb-10">
      <div>
        <h1 className="font-[var(--font-display)] text-[22px] font-semibold tracking-[-0.02em]">Settings</h1>
        <p className="mt-0.5 text-[13px] text-muted">Hostel details, charges, messages and your data.</p>
      </div>

      {/* -------------------------------------------------- hostel */}
      <section>
        <SectionTitle title="Hostel details" hint="Used on receipts and in WhatsApp messages" />
        <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Hostel name" className="col-span-2">
            <Input value={s.hostelName} onChange={(e) => db.updateSettings({ hostelName: e.target.value })} />
          </Field>
          <Field label="Phone numbers" hint="Separate with a comma" className="col-span-2">
            <Input
              value={s.phones.join(', ')}
              onChange={(e) => db.updateSettings({ phones: e.target.value.split(',').map((p) => p.trim()).filter(Boolean) })}
            />
          </Field>
          <Field label="Receipt number prefix" hint={`e.g. ${s.receiptPrefix}/2026-27/0001`}>
            <Input value={s.receiptPrefix} onChange={(e) => db.updateSettings({ receiptPrefix: e.target.value })} />
          </Field>
          <Field label="Receipts issued so far" hint="The next receipt continues from here">
            <Input
              type="number"
              className="tnum"
              value={s.lastReceiptSeq}
              onChange={(e) => db.updateSettings({ lastReceiptSeq: Math.max(0, Number(e.target.value)) })}
            />
          </Field>
          <Field label="Note at the bottom of every receipt" className="col-span-2">
            <Input value={s.receiptFooter} onChange={(e) => db.updateSettings({ receiptFooter: e.target.value })} />
          </Field>
        </Card>
      </section>

      {/* -------------------------------------------------- branches */}
      <section>
        <SectionTitle title="Branches" hint="Addresses shown on receipts" />
        <Card className="divide-y divide-[#f4ecdf]">
          {[...db.db.branches]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((b) => (
              <div key={b.id} className="grid grid-cols-1 gap-2 p-3.5 sm:grid-cols-[130px_1fr_150px] sm:items-center sm:gap-3">
                <Input value={b.name} onChange={(e) => db.updateBranch(b.id, { name: e.target.value })} />
                <Input value={b.address} onChange={(e) => db.updateBranch(b.id, { address: e.target.value })} />
                <Input value={b.phone} onChange={(e) => db.updateBranch(b.id, { phone: e.target.value })} />
              </div>
            ))}
        </Card>
      </section>

      {/* -------------------------------------------------- billing */}
      <section>
        <SectionTitle title="Rent rules" hint="Defaults applied when you add a new girl" />
        <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
          <Field label="Rent counted from" hint="Can be changed per girl">
            <Select
              value={s.billing.defaultCycle}
              onChange={(e) =>
                db.updateSettings({ billing: { ...s.billing, defaultCycle: e.target.value as 'anniversary' } })
              }
            >
              <option value="anniversary">Her own join date</option>
              <option value="fixed_date">A fixed date each month</option>
            </Select>
          </Field>
          <Field label="Common due date" hint="Used when rent is on a fixed date">
            <Select
              value={s.billing.defaultAnchorDay}
              onChange={(e) => db.updateSettings({ billing: { ...s.billing, defaultAnchorDay: Number(e.target.value) } })}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Grace days before it counts as overdue">
            <Input
              type="number"
              className="tnum"
              min={0}
              value={s.billing.graceDays}
              onChange={(e) => db.updateSettings({ billing: { ...s.billing, graceDays: Math.max(0, Number(e.target.value)) } })}
            />
          </Field>
          <Field label="Create each month's bills automatically">
            <Select
              value={s.billing.autoGenerate ? 'yes' : 'no'}
              onChange={(e) => db.updateSettings({ billing: { ...s.billing, autoGenerate: e.target.value === 'yes' } })}
            >
              <option value="yes">Yes — when the app opens</option>
              <option value="no">No — I'll press the button</option>
            </Select>
          </Field>
        </Card>
      </section>

      {/* -------------------------------------------------- charges */}
      <section>
        <SectionTitle
          title="Extra charges"
          hint="Quick buttons when adding a charge. Turn on “auto” to add it to every new bill."
          action={
            <Button
              size="sm"
              onClick={() =>
                setPresets([
                  ...s.chargePresets,
                  { id: `cp_${Date.now().toString(36)}`, label: 'New charge', type: 'other', amount: 0, auto: false },
                ])
              }
            >
              <IconPlus size={14} /> Add
            </Button>
          }
        />
        <Card className="divide-y divide-[#f4ecdf]">
          {s.chargePresets.map((p, i) => (
            <div key={p.id} className="grid grid-cols-2 items-center gap-2 p-3 sm:grid-cols-[1fr_140px_130px_120px_40px] sm:gap-3">
              <Input
                value={p.label}
                onChange={(e) =>
                  setPresets(s.chargePresets.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <Select
                value={p.type}
                onChange={(e) =>
                  setPresets(s.chargePresets.map((x, j) => (j === i ? { ...x, type: e.target.value as ChargeType } : x)))
                }
              >
                {['food', 'laundry', 'electricity', 'ac', 'late_fee', 'damage', 'other'].map((t) => (
                  <option key={t} value={t}>
                    {t.replace('_', ' ')}
                  </option>
                ))}
              </Select>
              <MoneyInput
                value={p.amount}
                onValue={(n) => setPresets(s.chargePresets.map((x, j) => (j === i ? { ...x, amount: n } : x)))}
              />
              <Select
                value={p.auto ? 'yes' : 'no'}
                onChange={(e) =>
                  setPresets(s.chargePresets.map((x, j) => (j === i ? { ...x, auto: e.target.value === 'yes' } : x)))
                }
              >
                <option value="no">On request</option>
                <option value="yes">Add to all</option>
              </Select>
              <IconButton label="Remove" onClick={() => setPresets(s.chargePresets.filter((_, j) => j !== i))}>
                <IconTrash size={15} />
              </IconButton>
            </div>
          ))}
        </Card>
      </section>

      {/* -------------------------------------------------- messages */}
      <section>
        <SectionTitle
          title="WhatsApp messages"
          hint="Use {name} {amount} {period} {due} {daysOverdue} {receiptNo} {paidOn} {hostel} — they get filled in automatically"
        />
        <Card className="space-y-3 p-4">
          <Field label="Gentle reminder (before the due date)">
            <Textarea
              rows={2}
              value={s.whatsapp.dueReminder}
              onChange={(e) => db.updateSettings({ whatsapp: { ...s.whatsapp, dueReminder: e.target.value } })}
            />
          </Field>
          <Field label="Overdue reminder">
            <Textarea
              rows={2}
              value={s.whatsapp.overdueReminder}
              onChange={(e) => db.updateSettings({ whatsapp: { ...s.whatsapp, overdueReminder: e.target.value } })}
            />
          </Field>
          <Field label="Sent with a receipt">
            <Textarea
              rows={2}
              value={s.whatsapp.receiptShare}
              onChange={(e) => db.updateSettings({ whatsapp: { ...s.whatsapp, receiptShare: e.target.value } })}
            />
          </Field>
        </Card>
      </section>

      {/* -------------------------------------------------- data */}
      <section>
        <SectionTitle title="Your data" hint="Everything is kept on this computer" />
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                const api = bridge();
                if (!api) {
                  downloadInBrowser(db.db);
                  toast('Backup downloaded');
                  return;
                }
                const res = await api.backup.export(db.db);
                if (res.ok) toast('Backup saved');
              }}
            >
              <IconDownload size={15} /> Save a backup
            </Button>
            <Button
              onClick={async () => {
                const api = bridge();
                if (!api) return;
                const res = await api.backup.import();
                if (res.ok && res.data) {
                  db.replaceDatabase(res.data);
                  toast('Backup restored');
                } else if (res.error) toast(res.error, 'bad');
              }}
            >
              <IconUpload size={15} /> Restore from a backup
            </Button>
            {bridge() && (
              <Button onClick={() => bridge()!.backup.reveal()}>Open the backups folder</Button>
            )}
          </div>

          <p className="text-[12.5px] leading-relaxed text-muted">
            A copy is saved automatically once a day, and the last 30 days are kept.
            {info && (
              <>
                {' '}
                Your register lives at <code className="rounded bg-cream-2 px-1 py-0.5 text-[11.5px]">{info.dataPath}</code>.
              </>
            )}
          </p>

          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button onClick={() => setConfirmSample(true)}>Load sample data</Button>
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              <IconTrash size={15} /> Erase everything
            </Button>
          </div>
        </Card>
      </section>

      {/* -------------------------------------------------- excel */}
      <ExcelSection />

      {/* -------------------------------------------------- PIN */}
      <PinSection />

      {/* -------------------------------------------------- cloud */}
      <section>
        <SectionTitle title="Sharing between two computers" hint="Coming in the next step of the build" />
        <Card className="flex items-start gap-3 p-4">
          <span className="mt-0.5 text-muted">
            <IconCloud size={20} />
          </span>
          <p className="text-[13px] leading-relaxed text-brown">
            Right now this app keeps its register on this computer. To have Amma's and Appa's laptops show the same
            live data, a free cloud database gets connected here — you'll paste two values from your Supabase project
            and both computers will stay in step automatically. Until then, use <b>Save a backup</b> and{' '}
            <b>Restore from a backup</b> to move data across.
          </p>
        </Card>
      </section>

      {info && (
        <p className="text-center text-[11.5px] text-muted">Sri Bharathi Manager v{info.version}</p>
      )}

      <ConfirmDialog
        open={confirmSample}
        onClose={() => setConfirmSample(false)}
        onConfirm={() => {
          db.loadSampleData();
          toast('Sample rooms and girls loaded');
        }}
        title="Load sample data?"
        message="This replaces everything currently in the app with a made-up set of rooms and girls, so you can try it out. Save a backup first if you have entered real details."
        confirmLabel="Load sample data"
      />

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        danger
        onConfirm={() => {
          db.resetAll();
          toast('Everything erased', 'info');
        }}
        title="Erase everything?"
        message="Every room, girl, bill and receipt is deleted and the app goes back to empty. This cannot be undone — save a backup first."
        confirmLabel="Erase everything"
      />
    </div>
  );
}

/** The Excel copy: export on demand, or keep a folder copy in step by itself. */
function ExcelSection() {
  const db = useDb();
  const excel = useExcelExport();
  const s = db.db.settings.excel;

  return (
    <section>
      <SectionTitle
        title="Excel sheet"
        hint="One workbook with a tab for each thing: summary, girls, rooms & beds, rent bills, payments, and one per branch"
      />
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={excel.exportNow}>
            <IconSheet size={15} /> Export to Excel now
          </Button>
          <Button onClick={excel.chooseFolder}>
            {s.folder ? 'Change folder' : 'Keep a copy updated automatically'}
          </Button>
          {s.folder && (
            <Select
              className="w-44"
              value={s.auto ? 'on' : 'off'}
              onChange={(e) => db.updateSettings({ excel: { ...s, auto: e.target.value === 'on' } })}
            >
              <option value="on">Updating automatically</option>
              <option value="off">Paused</option>
            </Select>
          )}
        </div>

        {s.folder ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            {s.auto ? (
              <>
                A file called <b>Sri Bharathi register.xlsx</b> is rewritten in{' '}
                <code className="rounded bg-cream-2 px-1 py-0.5 text-[11.5px]">{s.folder}</code> a few seconds after
                anything changes. Keep it closed while you work — Excel locks the file while it is open, and the app
                will tell you if it could not write.
              </>
            ) : (
              <>
                The automatic copy is paused. Turn it back on and the sheet in{' '}
                <code className="rounded bg-cream-2 px-1 py-0.5 text-[11.5px]">{s.folder}</code> starts updating again.
              </>
            )}
          </p>
        ) : (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Every number in the app can be exported to Excel — each thing on its own tab, with proper columns, rupee
            formatting and filter arrows on every heading. Choose a folder and the sheet will keep itself up to date
            without you pressing anything.
          </p>
        )}
      </Card>
    </section>
  );
}

/** Set, change or remove the PIN asked for when the app opens. */
function PinSection() {
  const toast = useToast();
  const api = bridge();
  const [status, setStatus] = useState<{ set: boolean; supported: boolean } | null>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    api?.pin.status().then(setStatus);
  }, [api]);

  if (!api || !status?.supported) return null;

  async function save() {
    if (pin.length < 4) {
      toast('Use at least 4 digits', 'bad');
      return;
    }
    if (pin !== confirm) {
      toast('The two PINs do not match', 'bad');
      return;
    }
    await api!.pin.set(pin);
    setPin('');
    setConfirm('');
    setStatus({ set: true, supported: true });
    toast('PIN saved — it will be asked for the next time the app opens');
  }

  return (
    <section>
      <SectionTitle
        title="PIN lock"
        hint={status.set ? 'A PIN is asked for each time the app opens' : 'No PIN is set — the app opens straight away'}
      />
      <Card className="p-4">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label={status.set ? 'New PIN' : 'PIN'}>
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="tnum tracking-[0.3em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="4–6 digits"
            />
          </Field>
          <Field label="Type it again">
            <Input
              type="password"
              inputMode="numeric"
              maxLength={6}
              className="tnum tracking-[0.3em]"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
          </Field>
          <Button variant="primary" onClick={save}>
            {status.set ? 'Change PIN' : 'Set PIN'}
          </Button>
        </div>
        {status.set && (
          <Button
            variant="quiet"
            size="sm"
            className="mt-3"
            onClick={async () => {
              await api.pin.clear();
              setStatus({ set: false, supported: true });
              toast('PIN removed', 'info');
            }}
          >
            Remove the PIN
          </Button>
        )}
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          The PIN is scrambled before it is stored and is kept separately from your records — forgetting it never
          costs you data.
        </p>
      </Card>
    </section>
  );
}

function downloadInBrowser(data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sri-bharathi-backup-${new Date().toISOString().slice(0, 10)}.sbh`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export { money };
