import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ROLES: string[] = ['Cashier', 'Manager', 'Accountant', 'Director', 'Admin'];

export function isGlobalUser(role: string) {
  return ['Accountant', 'Director', 'Admin'].includes(role);
}
