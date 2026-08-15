// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { Lock } from './Lock';
import { DbProvider } from '@/data/store';
import { ToastHost } from '@/ui/primitives';
import { sampleData } from '@/data/seed';
import { money } from '@/ui/format';

/**
 * Walks the screens the way the owners will. These catch render-time crashes
 * and wiring mistakes that a type check cannot see.
 */

function renderApp() {
  return render(
    <ToastHost>
      <DbProvider>
        <App />
      </DbProvider>
    </ToastHost>
  );
}

// The store loads asynchronously; let its effect settle before asserting.
async function boot() {
  const view = renderApp();
  await act(async () => {
    await Promise.resolve();
  });
  return view;
}

/**
 * The sidebar and the phone bottom bar are both in the document — CSS decides
 * which one is visible, and jsdom applies no CSS. The first match is the
 * sidebar, which is the one these desktop-shaped tests mean.
 */
const click = (name: RegExp | string) =>
  fireEvent.click(screen.getAllByRole('button', { name })[0]);

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

describe('first run', () => {
  it('opens on the dashboard and offers to set up the hostel', async () => {
    await boot();
    expect(screen.getByRole('heading', { name: /good (morning|afternoon|evening)/i })).toBeTruthy();
    expect(screen.getByText(/let's set up your hostel/i)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Branch 1' }).length).toBeGreaterThan(0);
  });

  it('lets a room be added with its beds from the Rooms screen', async () => {
    await boot();
    click('Rooms & Beds');

    const addButtons = screen.getAllByRole('button', { name: /add (the first )?room/i });
    fireEvent.click(addButtons[0]);

    fireEvent.change(screen.getByPlaceholderText('e.g. 101'), { target: { value: '101' } });
    // The dialog's submit is the last "Add room" on the page.
    const submits = screen.getAllByRole('button', { name: /^Add room$/ });
    fireEvent.click(submits[submits.length - 1]);

    expect(screen.getByText('Room 101')).toBeTruthy();
    // 4-sharing is the default, so four beds appear.
    expect(screen.getAllByText(/^Bed [A-D]$/)).toHaveLength(4);
  });
});

describe('with a hostel full of data', () => {
  beforeEach(() => {
    localStorage.setItem('sbh-data-v1', JSON.stringify(sampleData()));
  });

  it('shows occupancy and money on the dashboard', async () => {
    await boot();
    expect(screen.getByText('Beds filled')).toBeTruthy();
    expect(screen.getByText('Collected this month')).toBeTruthy();
    expect(screen.getByText('Outstanding')).toBeTruthy();
    expect(screen.getByText('Girls staying')).toBeTruthy();
    // Every branch gets an occupancy card.
    expect(screen.getByText('Branches')).toBeTruthy();
  });

  it('draws the bed map with occupied and free beds', async () => {
    await boot();
    click('Rooms & Beds');
    expect(screen.getAllByText(/^Room \d+/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Add girl').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/of \d+ beds filled/).length).toBeGreaterThan(0);
  });

  it('lists the girls and opens a profile with her rent ledger', async () => {
    await boot();
    click('Girls');
    const table = screen.getByRole('table');
    const firstRow = within(table).getAllByRole('row')[1];
    // The name sits in the row's own cell, next to the initials avatar.
    const name = firstRow.querySelector('td .font-semibold')!.textContent!;

    fireEvent.click(firstRow);
    expect(screen.getAllByText(/Rent ledger/).length).toBeGreaterThan(0);
    expect(screen.getByText('Pending amount') ?? screen.getByText('Account status')).toBeTruthy();
    expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });

  it('records a payment and settles that month', async () => {
    await boot();
    click('Rent & Dues');

    const before = screen.getByText('Outstanding (all months)').parentElement!.textContent!;

    // Open the first pending bill's payment dialog.
    fireEvent.click(screen.getAllByRole('button', { name: 'Record' })[0]);
    expect(screen.getByText('Record payment')).toBeTruthy();

    // The dialog pre-fills the full balance, so saving settles the month.
    click(/save payment/i);
    expect(screen.getByText('Payment recorded')).toBeTruthy();
    expect(screen.getByText(/Receipt SBH\//)).toBeTruthy();

    click(/^Done$/);

    const after = screen.getByText('Outstanding (all months)').parentElement!.textContent!;
    expect(after).not.toBe(before);
  });

  it('reports collection month by month', async () => {
    await boot();
    click('Reports');
    expect(screen.getByText('Rent collected each month')).toBeTruthy();
    // Two series, so the legend names both rather than relying on colour.
    expect(screen.getAllByText('Collected').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Expected').length).toBeGreaterThan(0);
    // The table view exists alongside the chart.
    expect(screen.getByText('Month by month')).toBeTruthy();
  });

  it('keeps every screen reachable from the sidebar', async () => {
    await boot();
    for (const label of ['Rooms & Beds', 'Girls', 'Rent & Dues', 'Reports', 'Settings', 'Dashboard']) {
      click(label);
    }
    expect(screen.getByRole('heading', { name: /good (morning|afternoon|evening)/i })).toBeTruthy();
  });

  it('writes changes back to storage', async () => {
    await boot();
    click('Rent & Dues');
    fireEvent.click(screen.getAllByRole('button', { name: 'Record' })[0]);
    click(/save payment/i);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 400)); // past the save debounce
    });

    const saved = JSON.parse(localStorage.getItem('sbh-data-v1')!);
    expect(saved.payments.length).toBe(1);
    expect(saved.payments[0].receiptNo).toMatch(/^SBH\//);
  });
});

describe('PIN lock', () => {
  it('steps aside when there is no desktop bridge to protect', async () => {
    render(
      <Lock>
        <p>the register</p>
      </Lock>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('the register')).toBeTruthy();
  });
});

describe('money formatting', () => {
  it('groups rupees the Indian way', () => {
    expect(money(6000)).toBe('₹6,000');
    expect(money(125000)).toBe('₹1,25,000');
  });
});
