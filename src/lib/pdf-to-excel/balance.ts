import {
  BALANCE_MAX_BREAK_SHARE,
  BALANCE_MIN_COVER,
  DECIMALS_MAX,
  MONEY_DECIMALS_MIN,
} from './constants';
import type { Cell, Column, Row, Sheet } from './types';

export type BalanceShape = 'debitCredit' | 'signed';

export interface BalanceCheck {
  shape: BalanceShape;
  balanceCol: number;
  debitCol?: number;
  creditCol?: number;
  amountCol?: number;
  transitions: number;
  breaks: number;
  /** Row indices that do not reconcile. */
  brokenRows: number[];
}

const minor = (value: number, decimals: number): number =>
  Math.round(value * Math.pow(10, decimals));

const decimalsOf = (column: Column | undefined): number =>
  Math.min(DECIMALS_MAX, Math.max(MONEY_DECIMALS_MIN, column?.decimals ?? MONEY_DECIMALS_MIN));

const amountOf = (cell: Cell | undefined): number | null =>
  cell && cell.value.kind === 'number' ? cell.value.value : null;

/** 0 for an empty cell, the value for a number, null for anything we could not read. */
const contribution = (cell: Cell | undefined): number | null => {
  if (!cell || cell.value.kind === 'empty') return 0;
  return cell.value.kind === 'number' ? cell.value.value : null;
};

/** Minor units, so 192 transitions compare exactly and nothing drifts in floating point. */
type DeltaOf = (row: Row, decimals: number) => number | null;

function reconcile(
  rows: readonly Row[],
  balanceCol: number,
  decimals: number,
  deltaOf: DeltaOf,
): { transitions: number; breaks: number; brokenRows: number[] } {
  const brokenRows: number[] = [];
  let transitions = 0;
  let previous: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const balance = amountOf(row.cells[balanceCol]);
    if (balance === null) {
      previous = null;
      continue;
    }
    const here = minor(balance, decimals);
    const delta = deltaOf(row, decimals);
    if (delta === null) {
      previous = here;
      continue;
    }
    if (previous !== null) {
      transitions++;
      if (previous + delta !== here) brokenRows.push(i);
    }
    previous = here;
  }
  return { transitions, breaks: brokenRows.length, brokenRows };
}

/** The last money column, read as a running balance, in whichever shape breaks least. */
export function findBalance(sheet: Sheet): BalanceCheck | null {
  const money: number[] = [];
  const numeric: number[] = [];
  sheet.columns.forEach((column, i) => {
    if (column.kind === 'money') money.push(i);
    if (column.kind === 'money' || column.kind === 'number') numeric.push(i);
  });
  if (money.length === 0) return null;

  const balanceCol = money[money.length - 1];
  const decimals = decimalsOf(sheet.columns[balanceCol]);

  let withAmount = 0;
  let withBalance = 0;
  for (const row of sheet.rows) {
    if (!numeric.some((i) => amountOf(row.cells[i]) !== null)) continue;
    withAmount++;
    if (amountOf(row.cells[balanceCol]) !== null) withBalance++;
  }
  if (withAmount === 0 || withBalance / withAmount < BALANCE_MIN_COVER) return null;

  const left = numeric.filter((i) => i < balanceCol);
  const candidates: BalanceCheck[] = [];

  if (left.length >= 2) {
    const debitCol = left[left.length - 2];
    const creditCol = left[left.length - 1];
    const run = reconcile(sheet.rows, balanceCol, decimals, (row, d) => {
      const debit = contribution(row.cells[debitCol]);
      const credit = contribution(row.cells[creditCol]);
      if (debit === null || credit === null) return null;
      return -Math.abs(minor(debit, d)) + Math.abs(minor(credit, d));
    });
    candidates.push({ shape: 'debitCredit', balanceCol, debitCol, creditCol, ...run });
  }

  if (left.length >= 1) {
    const amountCol = left[left.length - 1];
    const run = reconcile(sheet.rows, balanceCol, decimals, (row, d) => {
      const amount = contribution(row.cells[amountCol]);
      return amount === null ? null : minor(amount, d);
    });
    candidates.push({ shape: 'signed', balanceCol, amountCol, ...run });
  }

  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const candidate of candidates) {
    if (candidate.transitions === 0) continue;
    if (best.transitions === 0 || candidate.breaks < best.breaks) best = candidate;
  }
  return best;
}

/** Flags the rows that do not add up. Never changes a value to make them add up. */
export function applyBalance(sheet: Sheet, check: BalanceCheck | null): void {
  if (!check || check.transitions === 0) {
    sheet.notes.push({ code: 'balanceUnchecked' });
    return;
  }
  if (check.breaks / check.transitions > BALANCE_MAX_BREAK_SHARE) {
    sheet.notes.push({
      code: 'balanceUnchecked',
      detail: 'The last money column does not read as a running balance.',
    });
    return;
  }

  const column = sheet.columns[check.balanceCol];
  if (column) column.balance = true;
  for (const i of check.brokenRows) {
    const row = sheet.rows[i];
    if (!row) continue;
    if (!row.flags.includes('balance')) row.flags.push('balance');
    row.ok = row.flags.length === 0;
  }
  if (check.breaks > 0) sheet.notes.push({ code: 'balanceBreaks', count: check.breaks });
}
