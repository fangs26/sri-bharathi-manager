import { useEffect, useMemo, useState } from 'react';
import { useDb } from '@/data/store';
import type { BillingCycle, ID, OccupationType } from '@/data/types';
import { today as todayStr } from '@/domain/dates';
import { money } from '@/ui/format';
import { Button, Field, Input, Modal, MoneyInput, Segmented, Select, Textarea, useToast } from '@/ui/primitives';

const CYCLES: { value: BillingCycle; label: string }[] = [
  { value: 'anniversary', label: 'From her join date' },
  { value: 'fixed_date', label: 'Fixed date each month' },
  { value: 'short_stay', label: 'Short stay (per day)' },
];

/**
 * Admitting a girl and giving her a bed is one action, never two — a tenant
 * without a bed is not a state the hostel can be in.
 */
export function AdmitDialog({
  open,
  onClose,
  presetBedId,
  presetBranchId,
}: {
  open: boolean;
  onClose: () => void;
  presetBedId?: ID | null;
  presetBranchId?: ID | null;
}) {
  const db = useDb();
  const toast = useToast();
  const s = db.db.settings;

  const [branchId, setBranchId] = useState('');
  const [bedId, setBedId] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelation, setGuardianRelation] = useState('Father');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [occupationType, setOccupationType] = useState<OccupationType>('work');
  const [orgName, setOrgName] = useState('');
  const [expectedStay, setExpectedStay] = useState('');
  const [joinDate, setJoinDate] = useState(todayStr());
  const [rent, setRent] = useState(0);
  const [cycle, setCycle] = useState<BillingCycle>(s.billing.defaultCycle);
  const [anchorDay, setAnchorDay] = useState(s.billing.defaultAnchorDay);
  const [dailyRate, setDailyRate] = useState(0);
  const [prorateFirst, setProrateFirst] = useState(true);
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);

  const vacantBeds = useMemo(
    () => db.bedViews.filter((v) => !v.tenant && !v.bed.outOfService),
    [db.bedViews]
  );

  useEffect(() => {
    if (!open) return;
    const preset = presetBedId ? db.bedViews.find((v) => v.bed.id === presetBedId) : null;
    setBranchId(preset?.room.branchId ?? presetBranchId ?? db.db.branches[0]?.id ?? '');
    setBedId(presetBedId ?? '');
    setRent(preset?.rent ?? 0);
    setFullName('');
    setPhone('');
    setAltPhone('');
    setGuardianName('');
    setGuardianRelation('Father');
    setGuardianPhone('');
    setOccupationType('work');
    setOrgName('');
    setExpectedStay('');
    setJoinDate(todayStr());
    setCycle(s.billing.defaultCycle);
    setAnchorDay(s.billing.defaultAnchorDay);
    setDailyRate(0);
    setProrateFirst(true);
    setNotes('');
    setTouched(false);
  }, [open, presetBedId, presetBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const bedsForBranch = vacantBeds.filter((v) => !branchId || v.room.branchId === branchId);
  const chosen = db.bedViews.find((v) => v.bed.id === bedId) ?? null;

  const nameError = touched && !fullName.trim() ? 'Her name is needed' : undefined;
  const bedError = touched && !bedId ? 'Choose a bed' : undefined;

  function submit() {
    setTouched(true);
    if (!fullName.trim() || !bedId) return;
    const tenant = db.admitTenant(
      {
        branchId: chosen?.room.branchId ?? branchId,
        fullName: fullName.trim(),
        phone: phone.trim(),
        altPhone: altPhone.trim() || undefined,
        guardianName: guardianName.trim() || undefined,
        guardianRelation: guardianRelation.trim() || undefined,
        guardianPhone: guardianPhone.trim() || undefined,
        occupationType,
        orgName: orgName.trim() || undefined,
        expectedStay: expectedStay.trim() || undefined,
        joinDate,
        status: 'active',
        notes: notes.trim() || undefined,
      },
      {
        bedId,
        fromDate: joinDate,
        toDate: null,
        agreedRent: rent || chosen?.rent || 0,
        cycle,
        anchorDay: cycle === 'fixed_date' ? anchorDay : undefined,
        dailyRate: cycle === 'short_stay' ? dailyRate : undefined,
        prorateFirst,
      }
    );
    toast(`${tenant.fullName} added to ${chosen ? `Room ${chosen.room.roomNo} · Bed ${chosen.bed.label}` : 'the hostel'}`);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a girl"
      subtitle="Her details and her bed, in one go"
      width="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>
            Add & assign bed
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Group title="Her details">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name" error={nameError} className="col-span-2">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Divya Sree" autoFocus />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile" inputMode="numeric" />
            </Field>
            <Field label="Alternate phone">
              <Input value={altPhone} onChange={(e) => setAltPhone(e.target.value)} placeholder="Optional" inputMode="numeric" />
            </Field>
          </div>
        </Group>

        <Group title="Guardian / emergency contact">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Name">
              <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} placeholder="Parent or guardian" />
            </Field>
            <Field label="Relationship">
              <Select value={guardianRelation} onChange={(e) => setGuardianRelation(e.target.value)}>
                {['Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Husband', 'Guardian'].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
            <Field label="Phone">
              <Input value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
        </Group>

        <Group title="Work or college">
          <div className="grid grid-cols-3 gap-3">
            <Field label="She is">
              <Select value={occupationType} onChange={(e) => setOccupationType(e.target.value as OccupationType)}>
                <option value="work">Working</option>
                <option value="college">Studying</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label={occupationType === 'college' ? 'College' : 'Company'}>
              <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Expected stay">
              <Input value={expectedStay} onChange={(e) => setExpectedStay(e.target.value)} placeholder="e.g. 1 year" />
            </Field>
          </div>
        </Group>

        <Group title="Bed & rent">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch">
              <Select
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setBedId('');
                }}
              >
                {db.db.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortName} · {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Bed" error={bedError} hint={`${bedsForBranch.length} free in this branch`}>
              <Select
                value={bedId}
                onChange={(e) => {
                  setBedId(e.target.value);
                  const v = db.bedViews.find((x) => x.bed.id === e.target.value);
                  if (v) setRent(v.rent);
                }}
              >
                <option value="">Choose a bed…</option>
                {bedsForBranch.map((v) => (
                  <option key={v.bed.id} value={v.bed.id}>
                    Room {v.room.roomNo} · Bed {v.bed.label} · {v.room.sharing}-sharing
                    {v.room.hasAc ? ' · AC' : ''} · {money(v.rent)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Join date">
              <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
            </Field>
            <Field label="Agreed rent per month" hint={chosen ? `Bed default is ${money(chosen.rent)}` : undefined}>
              <MoneyInput value={rent || ''} onValue={setRent} />
            </Field>
          </div>

          <Field label="How is her rent counted?" className="mt-3">
            <Segmented options={CYCLES} value={cycle} onChange={setCycle} className="w-full" />
          </Field>

          <div className="mt-3 grid grid-cols-2 gap-3">
            {cycle === 'fixed_date' && (
              <Field label="Due on day" hint="Same date every month">
                <Select value={anchorDay} onChange={(e) => setAnchorDay(Number(e.target.value))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {cycle === 'short_stay' && (
              <Field label="Rate per day">
                <MoneyInput value={dailyRate || ''} onValue={setDailyRate} />
              </Field>
            )}
            {cycle === 'fixed_date' && (
              <Field label="First month">
                <Select value={prorateFirst ? 'yes' : 'no'} onChange={(e) => setProrateFirst(e.target.value === 'yes')}>
                  <option value="yes">Charge only the days she stays</option>
                  <option value="no">Charge the full month</option>
                </Select>
              </Field>
            )}
          </div>
        </Group>

        <Field label="Notes">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" />
        </Field>
      </div>
    </Modal>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</h4>
      {children}
    </section>
  );
}
