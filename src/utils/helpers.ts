/**
 * Utility helper functions for the Invoice Memory System
 */

import * as crypto from 'crypto';

/**
 * Get the current timestamp in ISO 8601 format
 */
export function getTimestamp(): string {
    return new Date().toISOString();
}

/**
 * Generate a unique identifier
 */
export function generateId(prefix: string = ''): string {
    const randomPart = crypto.randomBytes(8).toString('hex');
    const timestampPart = Date.now().toString(36);
    return prefix ? `${prefix}_${timestampPart}_${randomPart}` : `${timestampPart}_${randomPart}`;
}

/**
 * Generate a hash for duplicate detection
 */
export function generateHash(data: Record<string, unknown>): string {
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Calculate similarity score between two strings (Levenshtein-based)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const maxLength = Math.max(s1.length, s2.length);
    const distance = levenshteinDistance(s1, s2);

    return 1 - distance / maxLength;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    const dp: number[][] = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0) as number[]);

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }

    return dp[m][n];
}

/**
 * Clamp a number between min and max values
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Format a number as currency
 */
export function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
    }).format(amount);
}

/**
 * Parse a date string into a standardized ISO format
 * Returns null if the date cannot be parsed
 */
export function parseDate(dateString: string): string | null {
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    } catch {
        return null;
    }
}

/**
 * Simple logging utility
 */
export const logger = {
    info: (message: string, data?: unknown): void => {
        console.log(`[INFO] ${getTimestamp()} - ${message}`, data ? data : '');
    },
    warn: (message: string, data?: unknown): void => {
        console.warn(`[WARN] ${getTimestamp()} - ${message}`, data ? data : '');
    },
    error: (message: string, data?: unknown): void => {
        console.error(`[ERROR] ${getTimestamp()} - ${message}`, data ? data : '');
    },
    debug: (message: string, data?: unknown): void => {
        if (process.env.DEBUG) {
            console.log(`[DEBUG] ${getTimestamp()} - ${message}`, data ? data : '');
        }
    },
};
