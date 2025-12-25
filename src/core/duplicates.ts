/**
 * Duplicate Detection Module
 *
 * Detects potential duplicate invoices to prevent:
 * - Double processing
 * - Learning from duplicate data
 * - Reinforcing incorrect patterns
 */

import { InvoiceInput } from '../types';
import { MemoryStore } from '../memory';
import { generateHash } from '../utils';
import { PROCESSING } from '../config';

/**
 * Duplicate detection result
 */
export interface DuplicateCheckResult {
    /** Whether this is flagged as a duplicate */
    isDuplicate: boolean;

    /** Whether it's a confirmed duplicate (high confidence) */
    isConfirmed: boolean;

    /** Similarity score (0-1) */
    similarityScore: number;

    /** ID of the original invoice if duplicate */
    originalInvoiceId?: string;

    /** Reason for duplicate flag */
    reason?: string;

    /** Generated hash for this invoice */
    duplicateHash: string;

    /** Whether learning should be skipped */
    skipLearning: boolean;
}

/**
 * Check if an invoice is a potential duplicate
 */
export function checkForDuplicate(
    invoice: InvoiceInput,
    memoryStore: MemoryStore
): DuplicateCheckResult {
    // Generate hash for this invoice
    const duplicateHash = generateDuplicateHash(invoice);

    // Check exact hash match first
    const exactMatch = memoryStore.findDuplicate(duplicateHash);
    if (exactMatch) {
        return {
            isDuplicate: true,
            isConfirmed: exactMatch.confirmedDuplicate,
            similarityScore: 1.0,
            originalInvoiceId: exactMatch.originalInvoiceId,
            reason: 'Exact hash match found',
            duplicateHash,
            skipLearning: PROCESSING.SKIP_LEARNING_FOR_DUPLICATES,
        };
    }

    // No duplicate found
    return {
        isDuplicate: false,
        isConfirmed: false,
        similarityScore: 0,
        duplicateHash,
        skipLearning: false,
    };
}

/**
 * Generate a hash for duplicate detection
 */
export function generateDuplicateHash(invoice: InvoiceInput): string {
    return generateHash({
        vendorKey: normalizeVendorName(invoice.vendor.name),
        invoiceNumber: normalizeInvoiceNumber(invoice.invoiceNumber),
        dateKey: invoice.invoiceDate.substring(0, 7), // YYYY-MM
    });
}

/**
 * Normalize vendor name for matching
 */
function normalizeVendorName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Normalize invoice number for matching
 */
function normalizeInvoiceNumber(invoiceNumber: string): string {
    return invoiceNumber
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Record a duplicate in memory
 */
export function recordDuplicate(
    memoryStore: MemoryStore,
    invoice: InvoiceInput,
    _checkResult: DuplicateCheckResult
): void {
    memoryStore.recordDuplicate({
        vendorId: invoice.vendor.id || normalizeVendorName(invoice.vendor.name),
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: invoice.totalAmount,
        invoiceId: invoice.invoiceId,
    });
}

/**
 * Record that an invoice was processed (for future duplicate detection)
 */
export function recordInvoiceForDuplicateDetection(
    memoryStore: MemoryStore,
    invoice: InvoiceInput,
    _duplicateHash: string
): void {
    memoryStore.recordDuplicate({
        vendorId: invoice.vendor.id || normalizeVendorName(invoice.vendor.name),
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        amount: invoice.totalAmount,
        invoiceId: invoice.invoiceId,
    });
}
