/**
 * Vendor Rules Module
 *
 * Applies vendor-specific memories to normalize invoice data.
 * Implements concrete logic for:
 * - Supplier GmbH: Field mapping (Leistungsdatum -> serviceDate), PO matching
 * - Parts AG: VAT included detection, currency extraction
 * - Freight & Co: SKU mapping for shipping, Skonto detection
 */

import {
    InvoiceInput,
    VendorMemory,
    ProposedCorrection,
    NormalizedInvoice,
    NormalizedLineItem,
    FieldMapping,
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

    /** Detected payment terms (for Freight & Co) */
    detectedPaymentTerms?: {
        discountPercent?: number;
        discountDays?: number;
        netDays?: number;
    };
}

// =============================================================================
// Known Vendor Constants
// =============================================================================

const KNOWN_VENDORS = {
    SUPPLIER_GMBH: ['supplier gmbh', 'supplier', 'lieferant gmbh'],
    PARTS_AG: ['parts ag', 'parts', 'teile ag'],
    FREIGHT_CO: ['freight & co', 'freight and co', 'freight co', 'fracht & co'],
};

// =============================================================================
// Main Apply Function
// =============================================================================

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
    let detectedPaymentTerms: VendorApplyResult['detectedPaymentTerms'];

    // Identify vendor type
    const vendorType = identifyVendorType(invoice.vendor.name);

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

        // Apply vendor-specific field mappings
        const mappingCorrections = applyFieldMappings(invoice, vendorMemory, autoApplyThreshold);
        corrections.push(...mappingCorrections.corrections);
        notes.push(...mappingCorrections.notes);
    } else {
        notes.push(`No vendor memory found for "${invoice.vendor.name}"`);
    }

    // Apply vendor-type-specific rules
    switch (vendorType) {
        case 'SUPPLIER_GMBH':
            const supplierResult = applySupplierGmbHRules(invoice, vendorMemory, autoApplyThreshold);
            corrections.push(...supplierResult.corrections);
            notes.push(...supplierResult.notes);
            break;

        case 'PARTS_AG':
            const partsResult = applyPartsAGRules(invoice, vendorMemory, autoApplyThreshold);
            corrections.push(...partsResult.corrections);
            notes.push(...partsResult.notes);
            break;

        case 'FREIGHT_CO':
            const freightResult = applyFreightCoRules(invoice, vendorMemory, autoApplyThreshold);
            corrections.push(...freightResult.corrections);
            notes.push(...freightResult.notes);
            detectedPaymentTerms = freightResult.paymentTerms;
            break;
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
        serviceDate: invoice.serviceDate,
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        currency: invoice.currency,
        lineItems: normalizedLineItems,
        poNumber: invoice.poNumber || null,
        paymentTerms: detectedPaymentTerms || invoice.paymentTerms,
        processingTimestamp: getTimestamp(),
        normalizationVersion: '2.0.0',
    };

    return {
        normalizedInvoice,
        corrections,
        notes,
        vendorConfidence,
        detectedPaymentTerms,
    };
}

// =============================================================================
// Vendor Identification
// =============================================================================

function identifyVendorType(vendorName: string): string | null {
    const normalized = vendorName.toLowerCase().trim();

    for (const [type, patterns] of Object.entries(KNOWN_VENDORS)) {
        if (patterns.some((p) => normalized.includes(p))) {
            return type;
        }
    }

    return null;
}

// =============================================================================
// Field Mapping Application
// =============================================================================

function applyFieldMappings(
    invoice: InvoiceInput,
    vendorMemory: VendorMemory,
    autoApplyThreshold: number
): { corrections: ProposedCorrection[]; notes: string[] } {
    const corrections: ProposedCorrection[] = [];
    const notes: string[] = [];

    if (!vendorMemory.fieldMappings || Object.keys(vendorMemory.fieldMappings).length === 0) {
        return { corrections, notes };
    }

    const metadata = invoice.metadata || {};

    for (const [sourceField, mapping] of Object.entries(vendorMemory.fieldMappings)) {
        if (metadata[sourceField] !== undefined) {
            const value = String(metadata[sourceField]);
            const shouldAutoApply = mapping.confidence >= autoApplyThreshold;

            corrections.push({
                field: mapping.targetField,
                originalValue: '',
                proposedValue: value,
                confidence: mapping.confidence,
                reasoning: `Field mapping: "${sourceField}" -> "${mapping.targetField}" (${mapping.occurrenceCount} occurrences)`,
                source: vendorMemory.id,
                autoApplied: shouldAutoApply,
            });

            if (shouldAutoApply) {
                notes.push(`Applied field mapping: ${sourceField} -> ${mapping.targetField} = "${value}"`);
            } else {
                notes.push(`Suggested field mapping: ${sourceField} -> ${mapping.targetField}`);
            }
        }
    }

    return { corrections, notes };
}

// =============================================================================
// Supplier GmbH Rules
// =============================================================================

/**
 * Supplier GmbH specific rules:
 * - Map "Leistungsdatum" -> serviceDate
 * - Suggest PO matching when single PO matches
 */
function applySupplierGmbHRules(
    invoice: InvoiceInput,
    vendorMemory: VendorMemory | undefined,
    autoApplyThreshold: number
): { corrections: ProposedCorrection[]; notes: string[] } {
    const corrections: ProposedCorrection[] = [];
    const notes: string[] = [];
    const metadata = invoice.metadata || {};

    // Rule 1: Map "Leistungsdatum" to serviceDate
    const leistungsdatum = metadata['Leistungsdatum'] || metadata['leistungsdatum'];
    if (leistungsdatum && !invoice.serviceDate) {
        const confidence = vendorMemory ? Math.min(vendorMemory.confidence + 0.1, 0.95) : 0.7;
        const shouldAutoApply = confidence >= autoApplyThreshold;

        corrections.push({
            field: 'serviceDate',
            originalValue: '',
            proposedValue: String(leistungsdatum),
            confidence,
            reasoning: 'Supplier GmbH: Mapped "Leistungsdatum" field to serviceDate',
            source: vendorMemory?.id,
            autoApplied: shouldAutoApply,
        });

        if (shouldAutoApply) {
            notes.push(`Auto-applied: Leistungsdatum "${leistungsdatum}" -> serviceDate`);
        } else {
            notes.push(`Suggested: Map Leistungsdatum "${leistungsdatum}" to serviceDate`);
        }
    }

    // Rule 2: PO matching suggestion
    if (invoice.poNumber && vendorMemory) {
        // Check if we have historical data suggesting this is a valid PO
        const poConfidence = vendorMemory.confidence * 0.9;
        if (poConfidence >= 0.6) {
            notes.push(`PO-${invoice.poNumber} reference found, confidence: ${(poConfidence * 100).toFixed(0)}%`);
        }
    }

    // Rule 3: Check for item matching patterns in line items
    const lineItemMatches = analyzeLineItemsForPO(invoice);
    if (lineItemMatches.length > 0) {
        notes.push(`Found ${lineItemMatches.length} line item(s) potentially matching PO`);
    }

    return { corrections, notes };
}

/**
 * Analyze line items for PO matching hints
 */
function analyzeLineItemsForPO(invoice: InvoiceInput): string[] {
    const matches: string[] = [];

    for (const item of invoice.lineItems) {
        // Look for product codes or SKUs that suggest PO line matching
        if (item.productCode) {
            matches.push(item.productCode);
        }
    }

    return matches;
}

// =============================================================================
// Parts AG Rules
// =============================================================================

/**
 * Parts AG specific rules:
 * - Detect "MwSt. inkl." / "Prices incl. VAT" and recompute tax
 * - Extract currency from rawText if missing
 */
function applyPartsAGRules(
    invoice: InvoiceInput,
    vendorMemory: VendorMemory | undefined,
    autoApplyThreshold: number
): { corrections: ProposedCorrection[]; notes: string[] } {
    const corrections: ProposedCorrection[] = [];
    const notes: string[] = [];

    // Rule 1: VAT included detection and recomputation
    const vatIncluded = detectVATIncluded(invoice);
    if (vatIncluded.detected) {
        const vatResult = recomputeVATFromGross(invoice.totalAmount, vatIncluded.rate);
        const confidence = vendorMemory
            ? Math.min(vendorMemory.confidence + 0.15, 0.9)
            : 0.65;

        corrections.push({
            field: 'taxAmount',
            originalValue: '0',
            proposedValue: vatResult.taxAmount.toFixed(2),
            confidence,
            reasoning: `Parts AG: Detected "${vatIncluded.marker}" - Recomputed VAT at ${vatResult.rate}%`,
            source: vendorMemory?.id,
            autoApplied: confidence >= autoApplyThreshold,
        });

        corrections.push({
            field: 'netAmount',
            originalValue: invoice.totalAmount.toFixed(2),
            proposedValue: vatResult.netAmount.toFixed(2),
            confidence,
            reasoning: `Parts AG: Net amount after VAT extraction (${vatResult.rate}%)`,
            source: vendorMemory?.id,
            autoApplied: confidence >= autoApplyThreshold,
        });

        notes.push(
            `VAT included detected: "${vatIncluded.marker}". ` +
            `Gross: ${invoice.totalAmount.toFixed(2)}, Net: ${vatResult.netAmount.toFixed(2)}, ` +
            `VAT: ${vatResult.taxAmount.toFixed(2)} (${vatResult.rate}%)`
        );
    }

    // Rule 2: Currency extraction from rawText
    if (!invoice.currency || invoice.currency === 'UNKNOWN') {
        const extractedCurrency = extractCurrencyFromRawText(invoice.rawText);
        if (extractedCurrency) {
            // Higher confidence if vendor memory confirms typical currency
            let confidence = 0.6;
            if (vendorMemory?.behaviors?.defaultCurrency === extractedCurrency) {
                confidence = 0.85;
                notes.push(`Currency "${extractedCurrency}" confirmed by vendor memory`);
            }

            corrections.push({
                field: 'currency',
                originalValue: invoice.currency || 'UNKNOWN',
                proposedValue: extractedCurrency,
                confidence,
                reasoning: `Parts AG: Extracted currency "${extractedCurrency}" from invoice text`,
                source: vendorMemory?.id,
                autoApplied: confidence >= autoApplyThreshold,
            });

            notes.push(`Extracted currency "${extractedCurrency}" from rawText`);
        }
    }

    return { corrections, notes };
}

/**
 * Detect if VAT is included in the price
 */
function detectVATIncluded(invoice: InvoiceInput): {
    detected: boolean;
    marker: string;
    rate: number;
} {
    const rawText = invoice.rawText || '';
    const metadata = invoice.metadata || {};

    // Check common VAT inclusion markers
    const vatMarkers = [
        { pattern: /mwst\.?\s*inkl/i, marker: 'MwSt. inkl.', rate: 19 },
        { pattern: /prices?\s+incl\.?\s*vat/i, marker: 'Prices incl. VAT', rate: 19 },
        { pattern: /inkl\.?\s*mwst/i, marker: 'inkl. MwSt.', rate: 19 },
        { pattern: /including\s+vat/i, marker: 'including VAT', rate: 20 },
        { pattern: /inklusive\s+mehrwertsteuer/i, marker: 'inklusive Mehrwertsteuer', rate: 19 },
        { pattern: /brutto/i, marker: 'Brutto', rate: 19 },
    ];

    for (const { pattern, marker, rate } of vatMarkers) {
        if (pattern.test(rawText) || pattern.test(String(metadata['vatInfo'] || ''))) {
            return { detected: true, marker, rate };
        }
    }

    return { detected: false, marker: '', rate: 0 };
}

/**
 * Recompute net and tax from gross amount
 */
function recomputeVATFromGross(
    grossAmount: number,
    vatRate: number
): { netAmount: number; taxAmount: number; rate: number } {
    const rate = vatRate;
    const netAmount = grossAmount / (1 + rate / 100);
    const taxAmount = grossAmount - netAmount;

    return {
        netAmount: Math.round(netAmount * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        rate,
    };
}

/**
 * Extract currency from raw text
 */
function extractCurrencyFromRawText(rawText?: string): string | null {
    if (!rawText) return null;

    // Common currency patterns
    const currencyPatterns = [
        { pattern: /(\d+[.,]\d{2})\s*EUR/i, currency: 'EUR' },
        { pattern: /EUR\s*(\d+[.,]\d{2})/i, currency: 'EUR' },
        { pattern: /€\s*(\d+[.,]\d{2})/i, currency: 'EUR' },
        { pattern: /(\d+[.,]\d{2})\s*€/i, currency: 'EUR' },
        { pattern: /(\d+[.,]\d{2})\s*USD/i, currency: 'USD' },
        { pattern: /USD\s*(\d+[.,]\d{2})/i, currency: 'USD' },
        { pattern: /\$\s*(\d+[.,]\d{2})/i, currency: 'USD' },
        { pattern: /(\d+[.,]\d{2})\s*CHF/i, currency: 'CHF' },
        { pattern: /CHF\s*(\d+[.,]\d{2})/i, currency: 'CHF' },
        { pattern: /(\d+[.,]\d{2})\s*GBP/i, currency: 'GBP' },
        { pattern: /£\s*(\d+[.,]\d{2})/i, currency: 'GBP' },
    ];

    for (const { pattern, currency } of currencyPatterns) {
        if (pattern.test(rawText)) {
            return currency;
        }
    }

    return null;
}

// =============================================================================
// Freight & Co Rules
// =============================================================================

/**
 * Freight & Co specific rules:
 * - Detect Skonto terms and store as structured data
 * - Map shipping descriptions to FREIGHT SKU
 */
function applyFreightCoRules(
    invoice: InvoiceInput,
    vendorMemory: VendorMemory | undefined,
    autoApplyThreshold: number
): {
    corrections: ProposedCorrection[];
    notes: string[];
    paymentTerms?: { discountPercent?: number; discountDays?: number; netDays?: number };
} {
    const corrections: ProposedCorrection[] = [];
    const notes: string[] = [];

    // Rule 1: Detect Skonto/discount terms
    const skontoTerms = detectSkontoTerms(invoice);
    if (skontoTerms) {
        notes.push(
            `Detected Skonto terms: ${skontoTerms.discountPercent}% within ${skontoTerms.discountDays} days` +
            (skontoTerms.netDays ? `, net ${skontoTerms.netDays} days` : '')
        );

        corrections.push({
            field: 'paymentTerms',
            originalValue: JSON.stringify(invoice.paymentTerms || {}),
            proposedValue: JSON.stringify(skontoTerms),
            confidence: 0.8,
            reasoning: `Freight & Co: Extracted Skonto terms from invoice`,
            source: vendorMemory?.id,
            autoApplied: true,
        });
    }

    // Rule 2: Map shipping/freight descriptions to FREIGHT SKU
    for (let i = 0; i < invoice.lineItems.length; i++) {
        const item = invoice.lineItems[i];
        const isShipping = isShippingLineItem(item.description);

        if (isShipping && !item.productCode) {
            const confidence = vendorMemory
                ? Math.min(vendorMemory.confidence + 0.2, 0.95)
                : 0.7;

            corrections.push({
                field: `lineItems[${i}].productCode`,
                originalValue: item.productCode || '',
                proposedValue: 'FREIGHT',
                confidence,
                reasoning: `Freight & Co: Mapped shipping description "${item.description}" to SKU FREIGHT`,
                source: vendorMemory?.id,
                autoApplied: confidence >= autoApplyThreshold,
            });

            notes.push(
                `Suggested SKU "FREIGHT" for line item: "${item.description}" (confidence: ${(confidence * 100).toFixed(0)}%)`
            );
        }
    }

    return { corrections, notes, paymentTerms: skontoTerms || undefined };
}

/**
 * Detect Skonto payment terms from invoice
 */
function detectSkontoTerms(invoice: InvoiceInput): {
    discountPercent: number;
    discountDays: number;
    netDays?: number;
} | null {
    const rawText = invoice.rawText || '';
    const metadata = invoice.metadata || {};
    const searchText = rawText + ' ' + JSON.stringify(metadata);

    // Pattern: "2% Skonto within 14 days" or "2% Skonto innerhalb 14 Tagen"
    const skontoPatterns = [
        /(\d+(?:[.,]\d+)?)\s*%\s*skonto\s*(?:within|innerhalb|bei\s+zahlung\s+binnen)\s*(\d+)\s*(?:days?|tage?n?)/i,
        /skonto\s*(\d+(?:[.,]\d+)?)\s*%\s*(?:within|innerhalb|bei\s+zahlung\s+binnen)\s*(\d+)\s*(?:days?|tage?n?)/i,
        /(\d+(?:[.,]\d+)?)\s*%\s*(?:discount|rabatt)\s*(?:within|innerhalb)\s*(\d+)\s*(?:days?|tage?n?)/i,
    ];

    for (const pattern of skontoPatterns) {
        const match = searchText.match(pattern);
        if (match) {
            const discountPercent = parseFloat(match[1].replace(',', '.'));
            const discountDays = parseInt(match[2], 10);

            // Try to find net payment days
            const netPattern = /(?:net|netto)\s*(?:within|innerhalb)?\s*(\d+)\s*(?:days?|tage?n?)/i;
            const netMatch = searchText.match(netPattern);
            const netDays = netMatch ? parseInt(netMatch[1], 10) : undefined;

            return { discountPercent, discountDays, netDays };
        }
    }

    return null;
}

/**
 * Check if a line item description indicates shipping/freight
 */
function isShippingLineItem(description: string): boolean {
    const shippingPatterns = [
        /seefracht/i,
        /shipping/i,
        /freight/i,
        /fracht/i,
        /versand/i,
        /lieferung/i,
        /transport/i,
        /luftfracht/i,
        /express\s*delivery/i,
    ];

    return shippingPatterns.some((pattern) => pattern.test(description));
}

// =============================================================================
// Utility Functions
// =============================================================================

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

/**
 * Create a field mapping for vendor memory
 */
export function createFieldMapping(
    sourceField: string,
    targetField: string,
    confidence: number = 0.5,
    exampleValue?: string
): FieldMapping {
    return {
        sourceField,
        targetField,
        confidence,
        occurrenceCount: 1,
        exampleValues: exampleValue ? [exampleValue] : [],
    };
}
