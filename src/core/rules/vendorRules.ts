/**
 * Vendor Rules Module
 *
 * Applies vendor-specific memories to normalize invoice data.
 */

import {
    InvoiceInput,
    VendorMemory,
    ProposedCorrection,
    NormalizedInvoice,
    NormalizedLineItem,
} from '../../types';
import { getTimestamp, generateId } from '../../utils';

/**
 * Result from applying vendor memories
 */
export interface VendorApplyResult {
    /** Partially normalized invoice */
    normalizedInvoice: Partial<NormalizedInvoice>;

    /** Proposed corrections from vendor memory */
    corrections: ProposedCorrection[];

    /** Notes for reasoning */
    notes: string[];

    /** Aggregated confidence from vendor memory */
    vendorConfidence: number;
}

/**
 * Apply vendor memories to normalize an invoice
 *
 * @param invoice The raw invoice input
 * @param vendorMemory The vendor memory (if found)
 * @param autoApplyThreshold Confidence threshold for auto-applying corrections
 * @returns Result with normalized fields and proposed corrections
 */
export function applyVendorMemories(
    invoice: InvoiceInput,
    vendorMemory: VendorMemory | undefined,
    autoApplyThreshold: number = 0.85
): VendorApplyResult {
    const corrections: ProposedCorrection[] = [];
    const notes: string[] = [];

    // Default vendor info
    let normalizedVendorName = invoice.vendor.name;
    let canonicalVendorId = invoice.vendor.id || generateId('vendor');
    let vendorConfidence = 0.5; // Default for unknown vendor

    if (vendorMemory) {
        vendorConfidence = vendorMemory.confidence;

        // Apply vendor name normalization
        if (vendorMemory.canonicalName !== invoice.vendor.name) {
            const correction: ProposedCorrection = {
                field: 'vendor.name',
                originalValue: invoice.vendor.name,
                proposedValue: vendorMemory.canonicalName,
                confidence: vendorMemory.confidence,
                reasoning: `Vendor name normalized based on ${vendorMemory.reinforcementCount} previous occurrences`,
                source: vendorMemory.id,
                autoApplied: vendorMemory.confidence >= autoApplyThreshold,
            };

            corrections.push(correction);

            if (correction.autoApplied) {
                normalizedVendorName = vendorMemory.canonicalName;
                canonicalVendorId = vendorMemory.canonicalId;
                notes.push(`Auto-normalized vendor name to "${vendorMemory.canonicalName}"`);
            } else {
                notes.push(
                    `Suggested vendor normalization to "${vendorMemory.canonicalName}" (confidence: ${(vendorMemory.confidence * 100).toFixed(0)}%)`
                );
            }
        } else {
            notes.push(`Vendor "${invoice.vendor.name}" already normalized`);
            canonicalVendorId = vendorMemory.canonicalId;
        }

        // Apply field mappings if available
        // TODO: Implement field mapping application when we have extracted fields

        // Apply vendor behaviors
        // TODO: Implement currency/VAT/payment terms application
    } else {
        notes.push(`No vendor memory found for "${invoice.vendor.name}"`);
    }

    // Build normalized line items
    const normalizedLineItems: NormalizedLineItem[] = invoice.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || item.amount,
        amount: item.amount,
        category: item.category || null,
        productCode: item.productCode || null,
    }));

    // Build partial normalized invoice
    const normalizedInvoice: Partial<NormalizedInvoice> = {
        invoiceId: invoice.invoiceId,
        vendor: {
            normalizedName: normalizedVendorName,
            canonicalId: canonicalVendorId,
            originalName: invoice.vendor.name,
        },
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate || null,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        lineItems: normalizedLineItems,
        poNumber: invoice.poNumber || null,
        processingTimestamp: getTimestamp(),
        normalizationVersion: '2.0.0',
    };

    return {
        normalizedInvoice,
        corrections,
        notes,
        vendorConfidence,
    };
}

/**
 * Check if a vendor name variation should be added to memory
 */
export function shouldAddNameVariation(
    vendorMemory: VendorMemory | undefined,
    vendorName: string
): boolean {
    if (!vendorMemory) return false;

    const normalized = vendorName.toLowerCase().trim();
    const canonicalNormalized = vendorMemory.canonicalName.toLowerCase().trim();

    if (normalized === canonicalNormalized) return false;

    return !vendorMemory.nameVariations.some(
        (v) => v.toLowerCase().trim() === normalized
    );
}
