import { useMemo, useState } from 'react';
import type { Nav } from '@/app/App';
import { useDb } from '@/data/store';
import type { BedView, ID, Room } from '@/data/types';
import { money } from '@/ui/format';
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  IconButton,
  Input,
  Modal,
  MoneyInput,
  ProgressBar,
  Select,
  cx,
  useToast,
  STATUS_LABEL,
} from '@/ui/primitives';
import { IconBed, IconDoor, IconEdit, IconPlus, IconTrash } from '@/ui/icons';
import { AdmitDialog } from '../tenants/AdmitDialog';
import { TenantSheet } from '../tenants/TenantSheet';
import { PaymentDialog } from '../billing/PaymentDialog';

export function BedMap({ nav }: { nav: Nav }) {
  const db = useDb();
  const [addRoomFor, setAddRoomFor] = useState<ID | null>(null);
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [admitBedId, setAdmitBedId] = useState<ID | null>(null);
  const [sheetTenantId, setSheetTenantId] = useState<ID | null>(null);
  const [payFor, setPayFor] = useState<{ tenantId: ID; billId?: ID } | null>(null);

  const branches = useMemo(
    () =>
      [...db.db.branches]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .filter((b) => nav.branchId === 'all' || b.id === nav.branchId),
    [db.db.branches, nav.branchId]
  );

  const hasRooms = db.db.rooms.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h1 className="font-[var(--font-display)] text-[20px] font-semibold tracking-[-0.02em] md:text-[22px]">
            Rooms & Beds
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Every bed in the hostel, and who is in it. Tap a bed to admit someone or open her profile.
          </p>
        </div>
        <Legend />
      </div>

      {branches.map((branch) => {
        const beds = db.bedViewsByBranch.get(branch.id) ?? [];
        const rooms = db.db.rooms.filter((r) => r.branchId === branch.id);
        const filled = beds.filter((b) => b.tenant).length;

        const byFloor = new Map<string, typeof rooms>();
        for (const r of rooms.sort((a, b) => a.roomNo.localeCompare(b.roomNo, undefined, { numeric: true }))) {
          const list = byFloor.get(r.floor || 'Rooms') ?? [];
          list.push(r);
          byFloor.set(r.floor || 'Rooms', list);
        }

        return (
          <section key={branch.id}>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-[var(--font-display)] text-[16px] font-semibold tracking-[-0.01em]">
                  {branch.name}
                  <span className="ml-2 text-[12.5px] font-normal text-muted">{branch.shortName}</span>
                </h2>
                <div className="mt-1 flex items-center gap-3">
                  <span className="tnum text-[12.5px] text-muted">
                    {filled} of {beds.length} beds filled
                  </span>
                  <div className="w-28">
                    <ProgressBar value={filled} max={beds.length} tone={filled === beds.length ? 'sage' : 'terracotta'} />
                  </div>
                </div>
              </div>
              <Button size="sm" onClick={() => setAddRoomFor(branch.id)}>
                <IconPlus size={14} /> Add room
              </Button>
            </div>

            {rooms.length === 0 ? (
              <Card className="flex flex-col items-center px-6 py-10 text-center">
                <IconDoor size={26} className="mb-2 text-[#c9b89c]" />
                <p className="text-[13.5px] font-semibold">No rooms here yet</p>
                <p className="mt-1 max-w-xs text-[12.5px] text-muted">
                  Add the rooms in this branch and how many beds each one has.
                </p>
                <Button size="sm" variant="primary" className="mt-4" onClick={() => setAddRoomFor(branch.id)}>
                  <IconPlus size={14} /> Add the first room
                </Button>
              </Card>
            ) : (
              [...byFloor.entries()].map(([floor, floorRooms]) => (
                <div key={floor} className="mb-5">
                  <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.07em] text-muted">{floor}</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(268px,1fr))]">
                    {floorRooms.map((room) => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        beds={beds.filter((b) => b.room.id === room.id)}
                        onEdit={() => setEditRoom(room)}
                        onBedClick={(v) => (v.tenant ? setSheetTenantId(v.tenant.id) : setAdmitBedId(v.bed.id))}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </section>
        );
      })}

      {!hasRooms && (
        <p className="text-center text-[12.5px] text-muted">
          Tip: you can load a full set of sample rooms and girls from Settings to try the app first.
        </p>
      )}

      <AddRoomDialog branchId={addRoomFor} onClose={() => setAddRoomFor(null)} />
      <EditRoomDialog room={editRoom} onClose={() => setEditRoom(null)} />
      <AdmitDialog open={!!admitBedId} presetBedId={admitBedId} onClose={() => setAdmitBedId(null)} />
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

/* ------------------------------------------------------------- room card */

function RoomCard({
  room,
  beds,
  onEdit,
  onBedClick,
}: {
  room: Room;
  beds: BedView[];
  onEdit: () => void;
  onBedClick: (bed: BedView) => void;
}) {
  const filled = beds.filter((b) => b.tenant).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-cream-2/40 px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-[var(--font-display)] text-[14.5px] font-semibold">Room {room.roomNo}</span>
            {room.hasAc && (
              <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-sage-dk">AC</span>
            )}
          </div>
          <div className="text-[11.5px] text-muted">
            {room.sharing}-sharing · {money(room.defaultRent)}
            {room.attachedBath ? ' · attached bath' : ''}
          </div>
        </div>
        <span className={cx('tnum text-[12px] font-semibold', filled === beds.length ? 'text-sage-dk' : 'text-muted')}>
          {filled}/{beds.length}
        </span>
        <IconButton label="Edit room" onClick={onEdit}>
          <IconEdit size={15} />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 gap-2 p-2.5">
        {beds.map((v) => (
          <BedTile key={v.bed.id} view={v} onClick={() => onBedClick(v)} />
        ))}
      </div>
    </Card>
  );
}

const TILE_TONE: Record<string, string> = {
  paid: 'border-[#cfdcc2] bg-sage-soft/70 hover:border-sage',
  partial: 'border-[#eddcb2] bg-gold-soft/70 hover:border-gold',
  due: 'border-line bg-white hover:border-[#d9c9ae]',
  overdue: 'border-[#e9cbbf] bg-terracotta-soft/70 hover:border-terracotta',
  waived: 'border-line bg-white hover:border-[#d9c9ae]',
  vacant: 'border-dashed border-[#dccbb0] bg-transparent hover:border-terracotta hover:bg-white',
};

function BedTile({ view, onClick }: { view: BedView; onClick: () => void }) {
  const { bed, tenant, status, balance } = view;
  // For an occupied bed show what *she* pays, which can differ from the bed's
  // default; for an empty one show what the bed goes for.
  const rent = view.stay?.agreedRent ?? view.rent;

  if (bed.outOfService) {
    return (
      <div className="flex min-h-[62px] flex-col justify-center rounded-[11px] border border-dashed border-[#dccbb0] bg-cream-2/40 px-2.5 py-2 text-center opacity-70">
        <span className="text-[11px] font-semibold text-muted">Bed {bed.label}</span>
        <span className="text-[10.5px] text-muted">Out of service</span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      title={tenant ? `${tenant.fullName} · ${STATUS_LABEL[status]}` : `Bed ${bed.label} is free`}
      className={cx(
        'flex min-h-[62px] flex-col justify-between rounded-[11px] border px-2.5 py-2 text-left transition',
        TILE_TONE[status]
      )}
    >
      {tenant ? (
        <>
          <div className="flex items-start justify-between gap-1">
            <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight">{tenant.fullName}</span>
            <span
              className={cx(
                'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                status === 'paid' ? 'bg-sage' : status === 'partial' ? 'bg-gold' : status === 'overdue' ? 'bg-terracotta' : 'bg-[#cbbba2]'
              )}
            />
          </div>
          <div className="tnum flex items-baseline justify-between text-[11px]">
            <span className="text-muted">Bed {bed.label}</span>
            <span className={cx('font-semibold', balance > 0 ? 'text-terracotta-dk' : 'text-sage-dk')}>
              {balance > 0 ? money(balance) : money(rent)}
            </span>
          </div>
        </>
      ) : (
        <>
          <span className="text-[12.5px] font-semibold text-muted">Bed {bed.label}</span>
          <span className="flex items-center justify-between text-[11px] text-muted">
            <span className="flex items-center gap-1 font-semibold text-terracotta">
              <IconPlus size={12} /> Add girl
            </span>
            <span className="tnum">{money(rent)}</span>
          </span>
        </>
      )}
    </button>
  );
}

function Legend() {
  const items: [string, string][] = [
    ['bg-sage', 'Paid'],
    ['bg-gold', 'Part paid'],
    ['bg-terracotta', 'Overdue'],
    ['bg-[#cbbba2]', 'Due'],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
      {items.map(([dot, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={cx('h-2 w-2 rounded-full', dot)} />
          {label}
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- room dialogs */

function AddRoomDialog({ branchId, onClose }: { branchId: ID | null; onClose: () => void }) {
  const db = useDb();
  const toast = useToast();
  const [roomNo, setRoomNo] = useState('');
  const [floor, setFloor] = useState('Ground floor');
  const [sharing, setSharing] = useState(4);
  const [hasAc, setHasAc] = useState(false);
  const [attachedBath, setAttachedBath] = useState(true);
  const [rent, setRent] = useState(6000);

  function submit() {
    if (!branchId || !roomNo.trim()) return;
    db.addRoom(
      {
        branchId,
        roomNo: roomNo.trim(),
        floor,
        sharing,
        hasAc,
        attachedBath,
        defaultRent: rent,
      },
      sharing
    );
    toast(`Room ${roomNo} added with ${sharing} beds`);
    setRoomNo('');
    onClose();
  }

  return (
    <Modal
      open={!!branchId}
      onClose={onClose}
      title="Add a room"
      subtitle="Beds are created automatically from the sharing count"
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!roomNo.trim()}>
            Add room
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Room number">
          <Input value={roomNo} onChange={(e) => setRoomNo(e.target.value)} placeholder="e.g. 101" autoFocus />
        </Field>
        <Field label="Floor">
          <Select value={floor} onChange={(e) => setFloor(e.target.value)}>
            {['Ground floor', 'First floor', 'Second floor', 'Third floor'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
        <Field label="Beds in this room">
          <Select value={sharing} onChange={(e) => setSharing(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'bed (single)' : `beds (${n}-sharing)`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rent per bed" hint="Can be changed per girl later">
          <MoneyInput value={rent} onValue={setRent} />
        </Field>
        <Field label="Air conditioning">
          <Select value={hasAc ? 'yes' : 'no'} onChange={(e) => setHasAc(e.target.value === 'yes')}>
            <option value="no">Non-AC</option>
            <option value="yes">AC</option>
          </Select>
        </Field>
        <Field label="Bathroom">
          <Select value={attachedBath ? 'yes' : 'no'} onChange={(e) => setAttachedBath(e.target.value === 'yes')}>
            <option value="yes">Attached</option>
            <option value="no">Common</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function EditRoomDialog({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const db = useDb();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [extraBeds, setExtraBeds] = useState(1);

  if (!room) return null;
  const beds = db.db.beds.filter((b) => b.roomId === room.id);

  return (
    <>
      <Modal
        open={!!room}
        onClose={onClose}
        title={`Room ${room.roomNo}`}
        subtitle={`${beds.length} beds`}
        width="sm"
        footer={
          <>
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <IconTrash size={14} /> Delete room
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Room number">
            <Input value={room.roomNo} onChange={(e) => db.updateRoom(room.id, { roomNo: e.target.value })} />
          </Field>
          <Field label="Floor">
            <Select value={room.floor} onChange={(e) => db.updateRoom(room.id, { floor: e.target.value })}>
              {['Ground floor', 'First floor', 'Second floor', 'Third floor'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Rent per bed">
            <MoneyInput value={room.defaultRent} onValue={(n) => db.updateRoom(room.id, { defaultRent: n })} />
          </Field>
          <Field label="Air conditioning">
            <Select value={room.hasAc ? 'yes' : 'no'} onChange={(e) => db.updateRoom(room.id, { hasAc: e.target.value === 'yes' })}>
              <option value="no">Non-AC</option>
              <option value="yes">AC</option>
            </Select>
          </Field>
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Beds</h4>
          <div className="space-y-1.5">
            {beds.map((b) => {
              const occupied = db.tenantOfBed(b.id);
              return (
                <div key={b.id} className="flex items-center gap-2 rounded-[10px] border border-line bg-white px-3 py-2">
                  <IconBed size={15} className="text-muted" />
                  <span className="text-[13px] font-semibold">Bed {b.label}</span>
                  <span className="flex-1 truncate text-[12.5px] text-muted">
                    {occupied ? occupied.fullName : 'Free'}
                  </span>
                  <span className="tnum text-[12.5px] text-muted">{money(b.rent ?? room.defaultRent)}</span>
                  <IconButton
                    label="Remove bed"
                    onClick={() => {
                      const res = db.deleteBed(b.id);
                      if (!res.ok) toast(res.error!, 'bad');
                    }}
                  >
                    <IconTrash size={14} />
                  </IconButton>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Select value={extraBeds} onChange={(e) => setExtraBeds(Number(e.target.value))} className="w-20">
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              onClick={() => {
                db.addBeds(room.id, extraBeds);
                toast(`${extraBeds} bed(s) added`);
              }}
            >
              <IconPlus size={14} /> Add beds
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        danger
        confirmLabel="Delete room"
        title={`Delete room ${room.roomNo}?`}
        message="The room and its beds are removed. This is only possible when nobody is staying in it."
        onConfirm={() => {
          const res = db.deleteRoom(room.id);
          if (!res.ok) toast(res.error!, 'bad');
          else {
            toast('Room deleted', 'info');
            onClose();
          }
        }}
      />
    </>
  );
}
