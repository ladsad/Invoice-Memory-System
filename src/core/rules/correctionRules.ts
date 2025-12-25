/**
 * Correction Rules Module
 *
 * Applies pattern-based corrections from memory.
 */

import {
    InvoiceInput,
    CorrectionMemory,
    ProposedCorrection,
    CorrectionPattern,
} from '../../types';

/**
 * Result from applying correction memories
 */
export interface CorrectionApplyResult {
    /** Proposed corrections from memory */
    corrections: ProposedCorrection[];

    /** Notes for reasoning */
    notes: string[];

    /** Average confidence of applicable corrections */
    averageConfidence: number;

    /** Number of corrections auto-applied */
    autoAppliedCount: number;

    /** Number of corrections requiring review */
    pendingReviewCount: number;
}

/**
 * Context for matching correction patterns
 */
export interface CorrectionContext {
    vendorId?: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    lineItemCount: number;
}

/**
 * Apply correction memories to an invoice
 *
 * @param invoice The raw invoice input
 * @param corrections Available correction memories
 * @param autoApplyThreshold Confidence threshold for auto-applying
 * @returns Result with proposed corrections and notes
 */
export function applyCorrectionMemories(
    invoice: InvoiceInput,
    corrections: CorrectionMemory[],
    autoApplyThreshold: number = 0.85
): CorrectionApplyResult {
    const proposedCorrections: ProposedCorrection[] = [];
    const notes: string[] = [];
    let totalConfidence = 0;
    let autoAppliedCount = 0;
    let pendingReviewCount = 0;

    // Build context for pattern matching
    const context: CorrectionContext = {
        vendorId: invoice.vendor.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.totalAmount,
        currency: invoice.currency,
        lineItemCount: invoice.lineItems.length,
    };

    // Filter corrections applicable to this invoice
    const applicableCorrections = corrections.filter((c) =>
        isPatternApplicable(c.pattern, context, invoice)
    );

    if (applicableCorrections.length === 0) {
        notes.push('No applicable correction patterns found');
        return {
            corrections: [],
            notes,
            averageConfidence: 0,
            autoAppliedCount: 0,
            pendingReviewCount: 0,
        };
    }

    notes.push(`Found ${applicableCorrections.length} applicable correction pattern(s)`);

    for (const correction of applicableCorrections) {
        const proposed = createProposedCorrection(correction, autoApplyThreshold);
        proposedCorrections.push(proposed);
        totalConfidence += correction.confidence;

        if (proposed.autoApplied) {
            autoAppliedCount++;
            notes.push(`Auto-applied: ${correction.suggestedAction}`);
        } else {
            pendingReviewCount++;
            notes.push(`Pending review: ${correction.suggestedAction} (${(correction.confidence * 100).toFixed(0)}% confidence)`);
        }
    }

    const averageConfidence = applicableCorrections.length > 0
        ? totalConfidence / applicableCorrections.length
        : 0;

    return {
        corrections: proposedCorrections,
        notes,
        averageConfidence,
        autoAppliedCount,
        pendingReviewCount,
    };
}

/**
 * Check if a correction pattern is applicable to the current context
 */
function isPatternApplicable(
    pattern: CorrectionPattern,
    context: CorrectionContext,
    invoice: InvoiceInput
): boolean {
    // TODO: Implement full pattern matching logic
    // For now, use basic type-based matching

    switch (pattern.type) {
        case 'quantityMismatch':
            // Applicable if invoice has line items
            return context.lineItemCount > 0;

        case 'taxRecomputation':
            // Applicable if amount suggests tax issues
            // TODO: Implement tax detection logic
            return false;

        case 'fieldCorrection':
            // Check if pattern signature matches any field
            return pattern.condition.includes(invoice.vendor.name) ||
                pattern.signature.includes(context.vendorId || '');

        case 'amountAdjustment':
            // Applicable if amount pattern matches
            return true;

        case 'other':
        default:
            return false;
    }
}

/**
 * Create a proposed correction from a correction memory
 */
function createProposedCorrection(
    correction: CorrectionMemory,
    autoApplyThreshold: number
): ProposedCorrection {
    return {
        field: correction.pattern.type,
        originalValue: correction.pattern.condition,
        proposedValue: correction.suggestedAction,
        confidence: correction.confidence,
        reasoning: `Based on pattern: ${correction.pattern.signature} (${correction.reinforcementCount} reinforcements)`,
        source: correction.id,
        autoApplied: correction.confidence >= autoApplyThreshold && correction.humanApproved,
    };
}

/**
 * Generate a pattern signature from invoice characteristics
 */
export function generatePatternSignature(
    patternType: CorrectionPattern['type'],
    context: CorrectionContext
): string {
    switch (patternType) {
        case 'quantityMismatch':
            return `qty_mismatch:${context.vendorId || 'unknown'}`;

        case 'taxRecomputation':
            return `tax_recompute:${context.currency}`;

        case 'amountAdjustment':
            return `amount_adj:${context.vendorId || 'unknown'}:${Math.round(context.amount)}`;

        default:
            return `${patternType}:${context.vendorId || 'unknown'}`;
    }
}
