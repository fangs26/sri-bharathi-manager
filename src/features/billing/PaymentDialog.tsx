import { useEffect, useMemo, useState } from 'react';
import { useDb } from '@/data/store';
import type { BillView, ID, Payment, PaymentMethod } from '@/data/types';
import { humanDate, periodLabel, today as todayStr } from '@/domain/dates';
import { money } from '@/ui/format';
import {
  Button,
  Field,
  Input,
  Modal,
  MoneyInput,
  Segmented,
  Select,
  StatusChip,
  useToast,
} from '@/ui/primitives';
import { IconAlert, IconCheck, IconPrint, IconWhatsApp } from '@/ui/icons';
import { buildReceiptHtml, printReceipt, saveReceiptPdf } from '../receipt';
import { fillTemplate, openWhatsApp } from '../messaging';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

export function PaymentDialog({
  open,
  onClose,
  tenantId,
  billId,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: ID | null;
  billId?: ID | null;
}) {
  const db = useDb();
  const toast = useToast();

  const tenant = db.db.tenants.find((t) => t.id === tenantId) ?? null;
  const bills = useMemo(
    () => (tenantId ? db.billsByTenant.get(tenantId) ?? [] : []),
    [db.billsByTenant, tenantId]
  );
  const openBills = useMemo(() => bills.filter((b) => b.balance > 0), [bills]);

  const [selectedBillId, setSelectedBillId] = useState<string>('');
  const [amount, setAmount] = useState(0);
  const [paidOn, setPaidOn] = useState(todayStr());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ payment: Payment; bill: BillView | null } | null>(null);

  // Open on the oldest unpaid month — that's the one that matters.
  useEffect(() => {
    if (!open) return;
    const target = billId ?? openBills[openBills.length - 1]?.id ?? '';
    setSelectedBillId(target);
    const bill = bills.find((b) => b.id === target);
    setAmount(bill ? Math.max(0, bill.balance) : 0);
    setPaidOn(todayStr());
    setMethod('cash');
    setReference('');
    setNote('');
    setDone(null);
  }, [open, billId, tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedBill = bills.find((b) => b.id === selectedBillId) ?? null;
  const totalOutstanding = openBills.reduce((s, b) => s + b.balance, 0);

  if (!tenant) return null;

  const stay = db.currentStayOf(tenant.id);
  const bed = stay ? db.db.beds.find((b) => b.id === stay.bedId) ?? null : null;
  const room = bed ? db.db.rooms.find((r) => r.id === bed.roomId) ?? null : null;
  const branch = db.db.branches.find((b) => b.id === tenant.branchId);

  function save() {
    if (amount <= 0) {
      toast('Enter an amount first', 'bad');
      return;
    }
    const payment = db.recordPayment({
      billId: selectedBillId || null,
      tenantId: tenant!.id,
      amount,
      paidOn,
      method,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
    setDone({ payment, bill: selectedBill });
    toast(`${money(amount)} recorded · ${payment.receiptNo}`);
  }

  function receiptHtml(payment: Payment, bill: BillView | null) {
    return buildReceiptHtml({
      settings: db.db.settings,
      branch,
      tenant: tenant!,
      payment,
      bill,
      room,
      bed,
      balanceAfter: bill ? Math.max(0, bill.balance - payment.amount) : 0,
    });
  }

  /* ------------------------------------------------- after saving */
  if (done) {
    const { payment, bill } = done;
    const balanceAfter = bill ? Math.max(0, bill.balance - payment.amount) : 0;
    return (
      <Modal open={open} onClose={onClose} title="Payment recorded" width="sm">
        <div className="flex flex-col items-center py-2 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage-soft text-sage-dk">
            <IconCheck size={24} />
          </span>
          <div className="tnum font-[var(--font-display)] text-[30px] font-semibold tracking-[-0.02em]">
            {money(payment.amount)}
          </div>
          <div className="mt-1 text-[13px] text-muted">
            from {tenant.fullName} · {humanDate(payment.paidOn)}
          </div>
          <div className="mt-3 rounded-full bg-cream-2 px-3 py-1 text-[12px] font-semibold text-brown">
            Receipt {payment.receiptNo}
          </div>
          {balanceAfter > 0 && (
            <div className="mt-3 text-[13px] text-terracotta-dk">
              {money(balanceAfter)} still pending for this period
            </div>
          )}

          <div className="mt-6 grid w-full grid-cols-3 gap-2">
            <Button onClick={() => printReceipt(receiptHtml(payment, bill))}>
              <IconPrint size={15} /> Print
            </Button>
            <Button onClick={() => saveReceiptPdf(receiptHtml(payment, bill), payment.receiptNo)}>
              PDF
            </Button>
            <Button
              onClick={() =>
                openWhatsApp(
                  tenant.phone,
                  fillTemplate(db.db.settings.whatsapp.receiptShare, {
                    name: tenant.fullName.split(' ')[0],
                    amount: payment.amount,
                    paidOn: humanDate(payment.paidOn),
                    period: bill ? periodLabel(bill.periodStart, bill.periodEnd) : 'your stay',
                    receiptNo: payment.receiptNo,
                    hostel: db.db.settings.hostelName,
                  })
                )
              }
            >
              <IconWhatsApp size={15} /> Send
            </Button>
          </div>
          <Button variant="primary" className="mt-2 w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  /* ------------------------------------------------------ the form */
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record payment"
      subtitle={`${tenant.fullName}${room ? ` · Room ${room.roomNo}` : ''}`}
      width="md"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {totalOutstanding > 0 && (
          <div className="flex items-center justify-between rounded-[12px] border border-line bg-cream-2/60 px-4 py-3">
            <span className="text-[13px] text-brown">Total pending across all months</span>
            <span className="tnum text-[16px] font-semibold text-terracotta-dk">
              {money(totalOutstanding)}
            </span>
          </div>
        )}

        <Field label="Paying for">
          <Select value={selectedBillId} onChange={(e) => {
            const id = e.target.value;
            setSelectedBillId(id);
            const b = bills.find((x) => x.id === id);
            setAmount(b ? Math.max(0, b.balance) : 0);
          }}>
            <option value="">Not for a specific month (advance / on account)</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {periodLabel(b.periodStart, b.periodEnd)} — {money(b.total)}
                {b.balance > 0 ? ` · ${money(b.balance)} pending` : ' · settled'}
              </option>
            ))}
          </Select>
        </Field>

        {selectedBill && (
          <div className="rounded-[12px] border border-line bg-white px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-brown">
                {periodLabel(selectedBill.periodStart, selectedBill.periodEnd)}
              </span>
              <StatusChip status={selectedBill.status} />
            </div>
            <div className="space-y-1 text-[12.5px]">
              {selectedBill.items.map((it) => (
                <div key={it.id} className="flex justify-between text-muted">
                  <span>{it.label}</span>
                  <span className="tnum">{money(it.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold text-ink">
                <span>Total</span>
                <span className="tnum">{money(selectedBill.total)}</span>
              </div>
              {selectedBill.paid > 0 && (
                <div className="flex justify-between text-sage-dk">
                  <span>Already paid</span>
                  <span className="tnum">− {money(selectedBill.paid)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-terracotta-dk">
                <span>Balance</span>
                <span className="tnum">{money(selectedBill.balance)}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount received">
            <MoneyInput value={amount || ''} onValue={setAmount} autoFocus />
          </Field>
          <Field label="Paid on">
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
        </div>

        {/* Paying more than the month costs is almost always a typo. If it is
            deliberate, it belongs on the account rather than buried in one
            month, where the surplus would not show up as credit anywhere. */}
        {selectedBill && amount > selectedBill.balance && selectedBill.balance > 0 && (
          <div className="flex items-start gap-2 rounded-[12px] border border-[#eddcb2] bg-gold-soft px-3.5 py-2.5">
            <span className="mt-0.5 shrink-0 text-[#8a6410]">
              <IconAlert size={15} />
            </span>
            <p className="text-[12.5px] leading-relaxed text-[#7a5a0e]">
              That is {money(amount - selectedBill.balance)} more than this period needs. The extra will not be
              carried over to her next month — record it as{' '}
              <button
                className="font-semibold underline underline-offset-2"
                onClick={() => {
                  setSelectedBillId('');
                  setAmount(amount);
                }}
              >
                a payment on account
              </button>{' '}
              instead, or reduce the amount.
            </p>
          </div>
        )}

        {selectedBill && selectedBill.balance > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <QuickAmount label={`Full ${money(selectedBill.balance)}`} onClick={() => setAmount(selectedBill.balance)} />
            <QuickAmount label={`Half ${money(Math.round(selectedBill.balance / 2))}`} onClick={() => setAmount(Math.round(selectedBill.balance / 2))} />
            {totalOutstanding > selectedBill.balance && (
              <QuickAmount label={`Everything ${money(totalOutstanding)}`} onClick={() => setAmount(totalOutstanding)} />
            )}
          </div>
        )}

        <Field label="Paid by">
          <Segmented options={METHODS} value={method} onChange={setMethod} className="w-full" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reference" hint="UPI ref. or cheque no. — optional">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Note">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function QuickAmount({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="tnum rounded-full border border-line bg-white px-3 py-1 text-[12.5px] font-semibold text-brown transition hover:border-terracotta hover:text-terracotta-dk"
    >
      {label}
    </button>
  );
}
