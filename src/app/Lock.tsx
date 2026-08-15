import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bridge } from '@/data/adapter';
import { Button, cx } from '@/ui/primitives';
import { IconLock } from '@/ui/icons';
import { Emblem } from './Brand';

type Phase = 'checking' | 'setup' | 'locked' | 'open';

/**
 * Sits in front of the app on the desktop. The PIN is checked in the main
 * process — this screen never sees the stored value, only yes or no.
 * Outside Electron (browser development, tests) there is nothing to protect,
 * so it steps out of the way.
 */
export function Lock({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    const api = bridge();
    if (!api) {
      setPhase('open');
      return;
    }
    api.pin
      .status()
      .then(({ set, supported }) => setPhase(!supported ? 'open' : set ? 'locked' : 'setup'))
      .catch(() => setPhase('open'));
  }, []);

  if (phase === 'checking') {
    return (
      <div className="flex h-full items-center justify-center bg-cream">
        <Emblem size={44} />
      </div>
    );
  }
  if (phase === 'open') return <>{children}</>;
  if (phase === 'setup') return <SetupScreen onDone={() => setPhase('open')} />;
  return <UnlockScreen onUnlocked={() => setPhase('open')} />;
}

/* ---------------------------------------------------------------- shell */

function Shell({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center bg-cream">
      <div className="w-[340px] text-center">
        <div className="mb-4 flex justify-center">
          <Emblem size={52} />
        </div>
        <h1 className="font-[var(--font-display)] text-[19px] font-semibold tracking-[-0.02em]">{title}</h1>
        <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-relaxed text-muted">{hint}</p>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function PinInput({
  value,
  onChange,
  onEnter,
  shake,
  autoFocus,
  placeholder = '••••',
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  shake?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <input
      ref={ref}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      onKeyDown={(e) => e.key === 'Enter' && onEnter()}
      className={cx(
        'tnum w-full rounded-[12px] border bg-white py-3 text-center text-[22px] tracking-[0.5em] transition',
        shake ? 'animate-[sbh-shake_.35s] border-terracotta' : 'border-line focus:border-terracotta'
      )}
      style={{ outline: 'none' }}
    />
  );
}

/* --------------------------------------------------------------- setup */

function SetupScreen({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState('');

  async function submit() {
    if (step === 'enter') {
      if (pin.length < 4) {
        setError('Use at least 4 digits');
        return;
      }
      setError('');
      setStep('confirm');
      return;
    }
    if (confirm !== pin) {
      setError('Those did not match. Try again.');
      setConfirm('');
      return;
    }
    await bridge()?.pin.set(pin);
    onDone();
  }

  return (
    <Shell
      title="Set a PIN"
      hint="A short code so rent details and phone numbers stay private if someone else uses this computer."
    >
      {step === 'enter' ? (
        <PinInput key="a" value={pin} onChange={setPin} onEnter={submit} autoFocus placeholder="4–6 digits" />
      ) : (
        <PinInput key="b" value={confirm} onChange={setConfirm} onEnter={submit} autoFocus placeholder="Once more" />
      )}
      {error && <p className="mt-2 text-[12.5px] text-terracotta-dk">{error}</p>}
      <Button variant="primary" size="lg" className="mt-4 w-full" onClick={submit}>
        {step === 'enter' ? 'Continue' : 'Set PIN'}
      </Button>
      <button onClick={onDone} className="mt-3 text-[12.5px] text-muted underline-offset-2 hover:underline">
        Skip for now
      </button>
    </Shell>
  );
}

/* -------------------------------------------------------------- unlock */

function UnlockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  async function submit() {
    if (!pin) return;
    const ok = await bridge()?.pin.verify(pin);
    if (ok) {
      onUnlocked();
      return;
    }
    setShake(true);
    setError('That PIN is not right.');
    setPin('');
    window.setTimeout(() => setShake(false), 400);
  }

  // No auto-submit on digit count: the PIN may be 4 to 6 digits long and the
  // stored length is deliberately unknown here, so guessing when the entry is
  // "complete" would lock out anyone with a longer PIN. Enter or the button.
  return (
    <Shell title="Sri Bharathi Manager" hint="Enter your PIN and press Unlock.">
      <PinInput value={pin} onChange={setPin} onEnter={submit} shake={shake} autoFocus placeholder="4–6 digits" />
      {error && <p className="mt-2 text-[12.5px] text-terracotta-dk">{error}</p>}
      <Button variant="primary" size="lg" className="mt-4 w-full" onClick={submit}>
        <IconLock size={16} /> Unlock
      </Button>
      <button
        onClick={() => setShowHelp((v) => !v)}
        className="mt-3 text-[12.5px] text-muted underline-offset-2 hover:underline"
      >
        Forgotten the PIN?
      </button>
      {showHelp && (
        <p className="mt-2 rounded-[10px] bg-cream-2/70 px-3 py-2 text-left text-[12px] leading-relaxed text-brown">
          The PIN is stored separately from your data — none of your records are lost. Delete the file{' '}
          <b>sbh-secret.bin</b> from the app's data folder and it will ask you to set a new one the next time it opens.
        </p>
      )}
    </Shell>
  );
}
