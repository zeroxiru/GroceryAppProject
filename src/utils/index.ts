import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { Transaction } from '../types';

export function formatCurrency(amount: number): string {
  if (amount >= 100000) return `${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`;
  return Math.round(amount).toString();
}

export function formatTime(isoString: string): string {
  try {
    return format(parseISO(isoString), 'hh:mm a');
  } catch { return ''; }
}

export function formatDate(isoString: string): string {
  try {
    const date = parseISO(isoString);
    if (isToday(date)) return 'আজ';
    if (isYesterday(date)) return 'গতকাল';
    return format(date, 'dd/MM/yyyy');
  } catch { return ''; }
}

export function groupByDate(transactions: Transaction[]): Record<string, Transaction[]> {
  return transactions.reduce((acc, txn) => {
    const date = txn.created_at.split('T')[0];
    if (!acc[date]) acc[date] = [];
    acc[date].push(txn);
    return acc;
  }, {} as Record<string, Transaction[]>);
}