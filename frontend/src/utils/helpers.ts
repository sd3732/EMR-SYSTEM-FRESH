import { format, isValid, parseISO, differenceInMinutes, differenceInYears } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import type { Patient, PatientStatus, TriagePriority } from '@/types';

// Class name utility
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Date formatting utilities
export function formatDate(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return isValid(dateObj) ? format(dateObj, 'MMM dd, yyyy') : 'Invalid Date';
}

export function formatDateTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return isValid(dateObj) ? format(dateObj, 'MMM dd, yyyy h:mm a') : 'Invalid Date';
}

export function formatTime(date: string | Date): string {
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return isValid(dateObj) ? format(dateObj, 'h:mm a') : 'Invalid Time';
}

// Patient utilities
export function getPatientFullName(patient: Patient): string {
  return `${patient.first_name} ${patient.last_name}`;
}

export function getPatientAge(dateOfBirth: string): number {
  const birthDate = parseISO(dateOfBirth);
  return isValid(birthDate) ? differenceInYears(new Date(), birthDate) : 0;
}

export function formatPatientName(patient: Patient): string {
  return `${patient.last_name}, ${patient.first_name}`;
}

export function getPatientInitials(patient: Patient): string {
  return `${patient.first_name.charAt(0)}${patient.last_name.charAt(0)}`.toUpperCase();
}

// Wait time calculation
export function calculateWaitTime(arrivalTime: string, currentTime?: Date): number {
  const arrival = parseISO(arrivalTime);
  const now = currentTime || new Date();
  return isValid(arrival) ? differenceInMinutes(now, arrival) : 0;
}

export function formatWaitTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Status and priority utilities
export function getStatusPriority(status: PatientStatus): number {
  const priorities: Record<PatientStatus, number> = {
    'waiting': 1,
    'triaged': 2,
    'roomed': 3,
    'with-provider': 4,
    'checkout': 5,
    'discharged': 6,
  };
  return priorities[status] || 0;
}

export function getTriagePriority(priority: TriagePriority): number {
  const priorities: Record<TriagePriority, number> = {
    'emergent': 1,
    'urgent': 2,
    'less-urgent': 3,
    'non-urgent': 4,
  };
  return priorities[priority] || 0;
}

// Vital signs utilities
export function isVitalInRange(vital: number, min: number, max: number): boolean {
  return vital >= min && vital <= max;
}

export function formatVital(value: number, unit: string): string {
  return `${value} ${unit}`;
}

export function formatBloodPressure(systolic: number, diastolic: number): string {
  return `${systolic}/${diastolic}`;
}

// Search and filter utilities
export function searchPatients(patients: Patient[], query: string): Patient[] {
  if (!query.trim()) return patients;

  const searchTerm = query.toLowerCase();
  return patients.filter(patient =>
    patient.first_name.toLowerCase().includes(searchTerm) ||
    patient.last_name.toLowerCase().includes(searchTerm) ||
    patient.mrn.toLowerCase().includes(searchTerm) ||
    patient.phone.includes(searchTerm) ||
    patient.email.toLowerCase().includes(searchTerm)
  );
}

// Form validation utilities
export function validateMRN(mrn: string): boolean {
  // MRN should be alphanumeric and between 6-12 characters
  return /^[A-Za-z0-9]{6,12}$/.test(mrn);
}

export function validatePhone(phone: string): boolean {
  // Basic phone validation - allows various formats
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length === 10;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Number formatting utilities
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatPercentage(value: number): string {
  return `${Math.round(value)}%`;
}

// Local storage utilities
export function getStorageItem<T>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Silently fail if localStorage is not available
  }
}

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}