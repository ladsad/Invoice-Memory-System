/**
 * Correction Rules Module
 *
 * Applies pattern-based corrections from memory.
 * Implements concrete logic for:
 * - VAT recomputation with clear reasoning
 * - Currency extraction heuristics
 * - Line item SKU suggestions
 * - Resolution memory integration
 */

import {
    InvoiceInput,
    CorrectionMemory,
    ProposedCorrection,
    CorrectionPattern,
    HumanDecision,
} from '../../types';
import { MemoryStore } from '../../memory';
import { getTimestamp } from '../../utils';

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
    vendorName: string;
    invoiceNumber: string;
    amount: number;
    currency: string;
    lineItemCount: number;
    hasRawText: boolean;
    rawTextLength: number;
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
        vendorName: invoice.vendor.name,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.totalAmount,
        currency: invoice.currency,
        lineItemCount: invoice.lineItems.length,
        hasRawText: !!invoice.rawText,
        rawTextLength: invoice.rawText?.length || 0,
    };

    // Filter corrections applicable to this invoice
    const applicableCorrections = corrections.filter((c) =>
        isPatternApplicable(c.pattern, context, invoice)
    );

    if (applicableCorrections.length === 0) {
        notes.push('No applicable correction patterns found from memory');

        // Apply heuristic corrections even without memory
        const heuristicCorrections = applyHeuristicCorrections(invoice, autoApplyThreshold);
        proposedCorrections.push(...heuristicCorrections.corrections);
        notes.push(...heuristicCorrections.notes);

        return {
            corrections: proposedCorrections,
            notes,
            averageConfidence: heuristicCorrections.avgConfidence,
            autoAppliedCount: heuristicCorrections.autoApplied,
            pendingReviewCount: heuristicCorrections.pendingReview,
        };
    }

    notes.push(`Found ${applicableCorrections.length} applicable correction pattern(s) from memory`);

    for (const correction of applicableCorrections) {
        const proposed = createProposedCorrection(correction, autoApplyThreshold);
        proposedCorrections.push(proposed);
        totalConfidence += correction.confidence;

        if (proposed.autoApplied) {
            autoAppliedCount++;
            notes.push(`Auto-applied: ${correction.suggestedAction}`);
        } else {
            pendingReviewCount++;
            notes.push(
                `Pending review: ${correction.suggestedAction} (${(correction.confidence * 100).toFixed(0)}% confidence)`
            );
        }
    }

    const averageConfidence =
        applicableCorrections.length > 0 ? totalConfidence / applicableCorrections.length : 0;

    return {
        corrections: proposedCorrections,
        notes,
        averageConfidence,
        autoAppliedCount,
        pendingReviewCount,
    };
}

// =============================================================================
// Pattern Matching
// =============================================================================

/**
 * Check if a correction pattern is applicable to the current context
 */
function isPatternApplicable(
    pattern: CorrectionPattern,
    context: CorrectionContext,
    invoice: InvoiceInput
): boolean {
    switch (pattern.type) {
        case 'quantityMismatch':
            // Applicable if invoice has line items with quantities
            return (
                context.lineItemCount > 0 &&
                invoice.lineItems.some((item) => item.quantity !== undefined)
            );

        case 'taxRecomputation':
            // Applicable if rawText suggests VAT issues
            return context.hasRawText && detectVATIssue(invoice.rawText || '');

        case 'fieldCorrection':
            // Check if pattern signature matches vendor or field
            return (
                pattern.signature.includes(context.vendorId || '') ||
                pattern.signature.includes(context.vendorName.toLowerCase())
            );

        case 'amountAdjustment':
            // Applicable if amount looks unusual (round numbers, outliers)
            return isAmountSuspicious(context.amount);

        case 'other':
        default:
            return false;
    }
}

/**
 * Detect if raw text suggests VAT calculation issues
 */
function detectVATIssue(rawText: string): boolean {
    const vatPatterns = [
        /mwst\.?\s*inkl/i,
        /inkl\.?\s*mwst/i,
        /prices?\s+incl\.?\s*vat/i,
        /brutto/i,
        /inklusive\s+mehrwertsteuer/i,
    ];

    return vatPatterns.some((p) => p.test(rawText));
}

/**
 * Check if an amount looks suspicious
 */
function isAmountSuspicious(amount: number): boolean {
    // Round numbers are sometimes suspicious
    if (amount === Math.round(amount) && amount > 100) {
        return true;
    }
    // Very small amounts
    if (amount < 1) {
        return true;
    }
    return false;
}

// =============================================================================
// Heuristic Corrections
// =============================================================================

/**
 * Apply heuristic corrections without memory
 */
function applyHeuristicCorrections(
    invoice: InvoiceInput,
    autoApplyThreshold: number
): {
    corrections: ProposedCorrection[];
    notes: string[];
    avgConfidence: number;
    autoApplied: number;
    pendingReview: number;
} {
    const corrections: ProposedCorrection[] = [];
    const notes: string[] = [];
    let totalConfidence = 0;
    let autoApplied = 0;
    let pendingReview = 0;

    // Heuristic 1: Missing currency extraction
    if (!invoice.currency || invoice.currency === 'UNKNOWN') {
        const extracted = extractCurrencyHeuristic(invoice);
        if (extracted) {
            const confidence = 0.6;
            corrections.push({
                field: 'currency',
                originalValue: invoice.currency || 'UNKNOWN',
                proposedValue: extracted.currency,
                confidence,
                reasoning: `Heuristic: Extracted currency "${extracted.currency}" from ${extracted.source}`,
                autoApplied: confidence >= autoApplyThreshold,
            });
            totalConfidence += confidence;
            if (confidence >= autoApplyThreshold) autoApplied++;
            else pendingReview++;
            notes.push(`Heuristic: Found currency "${extracted.currency}" in ${extracted.source}`);
        }
    }

    // Heuristic 2: Line item SKU suggestions for common patterns
    for (let i = 0; i < invoice.lineItems.length; i++) {
        const item = invoice.lineItems[i];
        const suggestedSku = suggestSkuFromDescription(item.description);

        if (suggestedSku && !item.productCode) {
            const confidence = suggestedSku.confidence;
            corrections.push({
                field: `lineItems[${i}].productCode`,
                originalValue: '',
                proposedValue: suggestedSku.sku,
                confidence,
                reasoning: `Heuristic: "${item.description}" matches pattern for ${suggestedSku.sku}`,
                autoApplied: confidence >= autoApplyThreshold,
            });
            totalConfidence += confidence;
            if (confidence >= autoApplyThreshold) autoApplied++;
            else pendingReview++;
        }
    }

    // Heuristic 3: Date format normalization
    if (invoice.invoiceDate && !isISODate(invoice.invoiceDate)) {
        const normalized = normalizeDateFormat(invoice.invoiceDate);
        if (normalized) {
            const confidence = 0.8;
            corrections.push({
                field: 'invoiceDate',
                originalValue: invoice.invoiceDate,
                proposedValue: normalized,
                confidence,
                reasoning: 'Heuristic: Normalized date to ISO 8601 format',
                autoApplied: confidence >= autoApplyThreshold,
            });
            totalConfidence += confidence;
            if (confidence >= autoApplyThreshold) autoApplied++;
            else pendingReview++;
        }
    }

    const avgConfidence = corrections.length > 0 ? totalConfidence / corrections.length : 0.5;

    return { corrections, notes, avgConfidence, autoApplied, pendingReview };
}

/**
 * Extract currency using heuristics
 */
function extractCurrencyHeuristic(invoice: InvoiceInput): {
    currency: string;
    source: string;
} | null {
    // Check rawText
    if (invoice.rawText) {
        const patterns = [
            { regex: /EUR|€/i, currency: 'EUR' },
            { regex: /USD|\$/i, currency: 'USD' },
            { regex: /GBP|£/i, currency: 'GBP' },
            { regex: /CHF/i, currency: 'CHF' },
        ];

        for (const { regex, currency } of patterns) {
            if (regex.test(invoice.rawText)) {
                return { currency, source: 'rawText' };
            }
        }
    }

    // Check metadata
    if (invoice.metadata?.currency) {
        return { currency: String(invoice.metadata.currency), source: 'metadata' };
    }

    // Default based on vendor location hints
    if (invoice.vendor.address) {
        if (/germany|deutschland|de$/i.test(invoice.vendor.address)) {
            return { currency: 'EUR', source: 'vendor address (Germany)' };
        }
        if (/switzerland|schweiz|ch$/i.test(invoice.vendor.address)) {
            return { currency: 'CHF', source: 'vendor address (Switzerland)' };
        }
    }

    return null;
}

/**
 * Suggest SKU from description
 */
function suggestSkuFromDescription(description: string): {
    sku: string;
    confidence: number;
} | null {
    const patterns: Array<{ pattern: RegExp; sku: string; confidence: number }> = [
        { pattern: /shipping|freight|seefracht|fracht|versand/i, sku: 'FREIGHT', confidence: 0.75 },
        { pattern: /consulting|beratung/i, sku: 'CONSULTING', confidence: 0.7 },
        { pattern: /license|lizenz/i, sku: 'LICENSE', confidence: 0.7 },
        { pattern: /maintenance|wartung/i, sku: 'MAINTENANCE', confidence: 0.7 },
        { pattern: /training|schulung/i, sku: 'TRAINING', confidence: 0.7 },
        { pattern: /tax|steuer|mwst/i, sku: 'TAX', confidence: 0.6 },
    ];

    for (const { pattern, sku, confidence } of patterns) {
        if (pattern.test(description)) {
            return { sku, confidence };
        }
    }

    return null;
}

/**
 * Check if string is ISO date format
 */
function isISODate(dateStr: string): boolean {
    return /^\d{4}-\d{2}-\d{2}/.test(dateStr);
}

/**
 * Normalize date to ISO format
 */
function normalizeDateFormat(dateStr: string): string | null {
    // Try common formats
    const patterns: Array<{ regex: RegExp; format: (m: RegExpMatchArray) => string }> = [
        // DD.MM.YYYY
        {
            regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
            format: (m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
        },
        // DD/MM/YYYY
        {
            regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
            format: (m) => `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
        },
        // MM/DD/YYYY (US format)
        {
            regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
            format: (m) => `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
        },
    ];

    for (const { regex, format } of patterns) {
        const match = dateStr.match(regex);
        if (match) {
            return format(match);
        }
    }

    return null;
}

// =============================================================================
// Correction Memory Helpers
// =============================================================================

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
        reasoning: `Memory: ${correction.pattern.signature} (${correction.reinforcementCount} reinforcements)`,
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
            return `qty_mismatch:${context.vendorId || context.vendorName}`;

        case 'taxRecomputation':
            return `tax_recompute:${context.currency}`;

        case 'amountAdjustment':
            return `amount_adj:${context.vendorId || context.vendorName}:${Math.round(context.amount)}`;

        case 'fieldCorrection':
            return `field_corr:${context.vendorId || context.vendorName}`;

        default:
            return `${patternType}:${context.vendorId || context.vendorName}`;
    }
}

// =============================================================================
// Resolution Memory Integration
// =============================================================================

/**
 * Record a human decision on a correction
 */
export async function recordHumanDecision(
    memoryStore: MemoryStore,
    correctionId: string,
    decision: 'approved' | 'rejected' | 'modified',
    reason?: string,
    userId?: string
): Promise<void> {
    const humanDecision: HumanDecision = {
        decisionType: decision === 'approved' ? 'approveCorrection' : 'rejectCorrection',
        action: decision,
        timestamp: getTimestamp(),
        reason,
        userId,
    };

    // Record the resolution
    memoryStore.recordResolution({
        decision: humanDecision,
        relatedMemoryId: correctionId,
    });

    // Update confidence based on decision
    if (decision === 'approved') {
        memoryStore.reinforceMemory(correctionId);
    } else if (decision === 'rejected') {
        memoryStore.penalizeMemory(correctionId);
    }

    // Save changes
    await memoryStore.saveIfDirty();
}

/**
 * Apply human overrides to proposed corrections
 */
export function applyHumanOverrides(
    corrections: ProposedCorrection[],
    overrides: { [field: string]: { approved: boolean; newValue?: string } }
): ProposedCorrection[] {
    return corrections.map((correction) => {
        const override = overrides[correction.field];
        if (override) {
            return {
                ...correction,
                autoApplied: override.approved,
                proposedValue: override.newValue || correction.proposedValue,
                reasoning: correction.reasoning + ' [Human override applied]',
            };
        }
        return correction;
    });
}

/**
 * Create a new correction memory from a human-approved correction
 */
export function createCorrectionFromApproval(
    correction: ProposedCorrection,
    vendorId?: string
): Omit<CorrectionMemory, 'id' | 'createdAt' | 'updatedAt' | 'reinforcementCount' | 'contradictionCount' | 'isActive'> {
    return {
        type: 'correction',
        confidence: 0.7, // Human-approved starts higher
        pattern: {
            type: determinePatterType(correction.field),
            signature: `${correction.field}:${vendorId || 'global'}`,
            condition: String(correction.originalValue),
        },
        suggestedAction: String(correction.proposedValue),
        vendorId,
        humanApproved: true,
    };
}

/**
 * Determine pattern type from field name
 */
function determinePatterType(field: string): CorrectionPattern['type'] {
    if (field.includes('tax') || field.includes('vat')) return 'taxRecomputation';
    if (field.includes('quantity')) return 'quantityMismatch';
    if (field.includes('amount') || field.includes('total')) return 'amountAdjustment';
    return 'fieldCorrection';
}
