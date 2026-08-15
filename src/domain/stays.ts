import type { DateStr, Stay } from '@/data/types';
import { today as todayStr } from './dates';

/**
 * A stay counts as current right up to and including its last day.
 *
 * Notice given today for a date next week must not empty the bed, hide her from
 * the list, or let someone else be put in that bed before she has actually
 * gone. Everything that asks "who is in this bed" goes through here so the bed
 * map, the tenant list and the Excel export can never disagree.
 */
export function isCurrentStay(stay: Stay, on: DateStr = todayStr()): boolean {
  return !stay.toDate || stay.toDate >= on;
}

export function currentStayOf(stays: Stay[], tenantId: string, on?: DateStr): Stay | null {
  return stays.find((s) => s.tenantId === tenantId && isCurrentStay(s, on)) ?? null;
}
