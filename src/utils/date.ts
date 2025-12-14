/**
 * Date Utilities
 *
 * Provides date validation and standardization for AIGILE CLI.
 * All dates are stored in ISO 8601 format (YYYY-MM-DD).
 *
 * @author Vladimir K.S.
 */

/**
 * Standard date format used throughout AIGILE
 */
export const DATE_FORMAT = 'YYYY-MM-DD';

/**
 * Validates that a string is a valid date in YYYY-MM-DD format
 * @param dateStr - The date string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDateFormat(dateStr: string): boolean {
  if (!dateStr) return false;

  // Check format matches YYYY-MM-DD
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) {
    return false;
  }

  // Validate actual date values
  const [year, month, day] = dateStr.split('-').map(Number);

  // Check month range
  if (month < 1 || month > 12) {
    return false;
  }

  // Check day range for the given month/year
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return false;
  }

  return true;
}

/**
 * Attempts to parse a date string in various formats and convert to YYYY-MM-DD
 *
 * Supported input formats:
 * - YYYY-MM-DD (already standard)
 * - MM/DD/YYYY (US format)
 * - DD/MM/YYYY (EU format) - detected when day > 12
 * - YYYY/MM/DD (slash variant)
 * - DD.MM.YYYY (EU with dots)
 * - ISO 8601 with time (extracts date)
 *
 * @param dateStr - The date string to parse
 * @returns Standardized YYYY-MM-DD string, or null if unparseable
 */
export function parseDate(dateStr: string): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return isValidDateFormat(trimmed) ? trimmed : null;
  }

  // ISO 8601 with time component (e.g., 2025-12-14T10:30:00Z)
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const datePart = trimmed.split('T')[0];
    return isValidDateFormat(datePart) ? datePart : null;
  }

  // YYYY/MM/DD format
  const slashYMD = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slashYMD) {
    const result = `${slashYMD[1]}-${slashYMD[2]}-${slashYMD[3]}`;
    return isValidDateFormat(result) ? result : null;
  }

  // MM/DD/YYYY or DD/MM/YYYY format
  const slashMDY = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMDY) {
    let [, first, second, year] = slashMDY;
    const firstNum = Number(first);
    const secondNum = Number(second);

    // If first part > 12, it must be a day (EU format DD/MM/YYYY)
    // Otherwise assume US format MM/DD/YYYY
    let month: string, day: string;
    if (firstNum > 12) {
      day = first.padStart(2, '0');
      month = second.padStart(2, '0');
    } else {
      month = first.padStart(2, '0');
      day = second.padStart(2, '0');
    }

    const result = `${year}-${month}-${day}`;
    return isValidDateFormat(result) ? result : null;
  }

  // DD.MM.YYYY format (EU with dots)
  const dotDMY = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotDMY) {
    const [, day, month, year] = dotDMY;
    const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return isValidDateFormat(result) ? result : null;
  }

  // Try native Date parsing as fallback
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const result = `${year}-${month}-${day}`;
    return isValidDateFormat(result) ? result : null;
  }

  return null;
}

/**
 * Validates and standardizes a date string, throwing an error if invalid
 *
 * @param dateStr - The date string to validate
 * @param fieldName - The name of the field (for error messages)
 * @returns Standardized YYYY-MM-DD string
 * @throws Error if the date is invalid
 */
export function validateAndStandardizeDate(dateStr: string, fieldName: string): string {
  const standardized = parseDate(dateStr);

  if (!standardized) {
    throw new Error(
      `Invalid date format for ${fieldName}: "${dateStr}". ` +
      `Expected format: ${DATE_FORMAT} (e.g., 2025-12-14)`
    );
  }

  return standardized;
}

/**
 * Validates that end date is after start date
 *
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @returns true if end date is after or equal to start date
 */
export function isEndDateValid(startDate: string, endDate: string): boolean {
  return endDate >= startDate;
}

/**
 * Checks if a date is in the past
 *
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns true if the date is before today
 */
export function isDateInPast(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr < today;
}

/**
 * Checks if a date is in the future
 *
 * @param dateStr - Date in YYYY-MM-DD format
 * @returns true if the date is after today
 */
export function isDateInFuture(dateStr: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return dateStr > today;
}

/**
 * Gets today's date in YYYY-MM-DD format
 *
 * @returns Today's date as YYYY-MM-DD
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}
