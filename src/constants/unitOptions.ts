import { UNITS } from '@/constants';

export interface UnitOption { value: string; label: string; hint: string }

/** Dropdown options for the unit picker: Bangla name first, English underneath. */
export function unitOptions(units: string[] = ['piece', 'kg', 'gram', 'litre', 'ml', 'dozen', 'packet', 'bag']): UnitOption[] {
  return units.map(u => ({
    value: u,
    label: (UNITS as Record<string, { label: string; bangla: string }>)[u]?.bangla ?? u,
    hint: (UNITS as Record<string, { label: string; bangla: string }>)[u]?.label ?? u,
  }));
}
