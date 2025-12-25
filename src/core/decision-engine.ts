/**
 * Decision Engine
 *
 * Core logic for processing invoices through the memory-driven learning layer.
 * Applies memory, makes decisions, and generates output with audit trails.
 */

import {
    InvoiceInput,
    NormalizedInvoice,
    InvoiceDecisionOutput,
    ProposedCorrection,
    MemoryUpdate,
    AuditTrailEntry,
    DecisionEngineConfig,
    NormalizedLineItem,
} from '../types';
import { MemoryManager } from '../memory';
import { getTimestamp, generateId, generateHash } from '../utils';

/**
 * Default configuration for the decision engine
 */
const DEFAULT_CONFIG: DecisionEngineConfig = {
    humanReviewThreshold: 0.6,
    autoApplyThreshold: 0.85,
    memoryDecayRate: 0.01,
    minReinforcementCount: 3,
    maxContradictionRatio: 0.3,
    memoryStorePath: './data/memory.json',
    auditLogPath: './data/audit-log.jsonl',
};

/**
 * Decision Engine class for processing invoices
 */
export class DecisionEngine {
    private memoryManager: MemoryManager;
    private config: DecisionEngineConfig;

    constructor(memoryManager: MemoryManager, config?: Partial<DecisionEngineConfig>) {
        this.memoryManager = memoryManager;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Process an invoice through the decision engine
     * This is the main entry point for invoice processing
     */
    async processInvoice(invoice: InvoiceInput): Promise<InvoiceDecisionOutput> {
        const auditTrail: AuditTrailEntry[] = [];
        const proposedCorrections: ProposedCorrection[] = [];
        const memoryUpdates: MemoryUpdate[] = [];

        // Step 1: Recall - Retrieve relevant memories
        auditTrail.push({
            step: 'recall',
            timestamp: getTimestamp(),
            details: `Starting memory recall for invoice ${invoice.invoiceId} from vendor "${invoice.vendor.name}"`,
        });

        const recallResult = await this.recallMemories(invoice);
        auditTrail.push({
            step: 'recall',
            timestamp: getTimestamp(),
            details: `Found ${recallResult.vendorMemoryFound ? 'existing' : 'no'} vendor memory, ${recallResult.correctionsFound} applicable corrections`,
        });

        // Step 2: Apply - Generate proposed corrections based on memory
        auditTrail.push({
            step: 'apply',
            timestamp: getTimestamp(),
            details: 'Applying memory-based corrections and normalization rules',
        });

        const applyResult = await this.applyMemory(invoice, recallResult);
        proposedCorrections.push(...applyResult.corrections);

        // Step 3: Decide - Determine final action and confidence
        auditTrail.push({
            step: 'decide',
            timestamp: getTimestamp(),
            details: 'Evaluating confidence and determining final decision',
        });

        const decision = this.makeDecision(invoice, applyResult);

        // Step 4: Learn - Generate memory updates for persistence
        auditTrail.push({
            step: 'learn',
            timestamp: getTimestamp(),
            details: `Generating ${decision.requiresHumanReview ? 'pending' : 'confirmed'} memory updates`,
        });

        const learnResult = this.generateMemoryUpdates(invoice, applyResult, decision);
        memoryUpdates.push(...learnResult);

        // Build normalized invoice
        const normalizedInvoice = this.buildNormalizedInvoice(invoice, applyResult);

        // Build final output
        const output: InvoiceDecisionOutput = {
            normalizedInvoice,
            proposedCorrections,
            requiresHumanReview: decision.requiresHumanReview,
            reasoning: decision.reasoning,
            confidenceScore: decision.confidenceScore,
            memoryUpdates,
            auditTrail,
        };

        // Update statistics
        this.memoryManager.updateStats(
            proposedCorrections.filter((c) => c.autoApplied).length,
            decision.requiresHumanReview,
            decision.confidenceScore
        );

        // Write audit log
        this.memoryManager.writeAuditLog(invoice.invoiceId, auditTrail);

        return output;
    }

    /**
     * Recall relevant memories for an invoice
     */
    private async recallMemories(invoice: InvoiceInput): Promise<RecallResult> {
        // TODO: Implement comprehensive memory recall
        // - Look up vendor by name variations
        // - Find applicable corrections for field types
        // - Check for duplicate invoices
        // - Find relevant resolution patterns

        const vendorMemory = this.memoryManager.findVendorByName(invoice.vendor.name);

        // Check for potential duplicates
        const duplicateHash = generateHash({
            vendorName: invoice.vendor.name,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
        });
        const duplicateRecord = this.memoryManager.findDuplicate(duplicateHash);

        return {
            vendorMemoryFound: !!vendorMemory,
            vendorMemory,
            correctionsFound: 0, // TODO: Count applicable corrections
            potentialDuplicate: duplicateRecord,
            duplicateHash,
        };
    }

    /**
     * Apply memory-based corrections to the invoice
     */
    private async applyMemory(
        invoice: InvoiceInput,
        recallResult: RecallResult
    ): Promise<ApplyResult> {
        const corrections: ProposedCorrection[] = [];
        let normalizedVendorName = invoice.vendor.name;
        let normalizedVendorId = invoice.vendor.id || generateId('vendor');

        // Apply vendor normalization if memory exists
        if (recallResult.vendorMemory) {
            const vendorMemory = recallResult.vendorMemory;

            if (vendorMemory.confidence >= this.config.autoApplyThreshold) {
                normalizedVendorName = vendorMemory.canonicalName;
                normalizedVendorId = vendorMemory.canonicalId;

                corrections.push({
                    field: 'vendor.name',
                    originalValue: invoice.vendor.name,
                    proposedValue: vendorMemory.canonicalName,
                    confidence: vendorMemory.confidence,
                    reasoning: `Normalized vendor name based on memory (${vendorMemory.reinforcementCount} reinforcements)`,
                    source: vendorMemory.id,
                    autoApplied: true,
                });
            } else if (vendorMemory.confidence >= this.config.humanReviewThreshold) {
                corrections.push({
                    field: 'vendor.name',
                    originalValue: invoice.vendor.name,
                    proposedValue: vendorMemory.canonicalName,
                    confidence: vendorMemory.confidence,
                    reasoning: `Suggested vendor name normalization (confidence below auto-apply threshold)`,
                    source: vendorMemory.id,
                    autoApplied: false,
                });
            }
        }

        // TODO: Apply field-level corrections from correction memory
        // TODO: Apply resolution patterns for known ambiguities

        return {
            corrections,
            normalizedVendorName,
            normalizedVendorId,
            duplicateDetected: !!recallResult.potentialDuplicate?.confirmedDuplicate,
            duplicateHash: recallResult.duplicateHash,
        };
    }

    /**
     * Make the final decision about the invoice
     */
    private makeDecision(
        invoice: InvoiceInput,
        applyResult: ApplyResult
    ): DecisionResult {
        const reasons: string[] = [];
        let confidenceScore = invoice.extractionConfidence || 0.5;
        let requiresHumanReview = false;

        // Check for duplicate
        if (applyResult.duplicateDetected) {
            reasons.push('Potential duplicate invoice detected');
            requiresHumanReview = true;
            confidenceScore *= 0.5;
        }

        // Check for low-confidence corrections
        const lowConfidenceCorrections = applyResult.corrections.filter(
            (c) => !c.autoApplied && c.confidence < this.config.humanReviewThreshold
        );
        if (lowConfidenceCorrections.length > 0) {
            reasons.push(
                `${lowConfidenceCorrections.length} correction(s) require human review`
            );
            requiresHumanReview = true;
        }

        // Check overall confidence
        if (confidenceScore < this.config.humanReviewThreshold) {
            reasons.push('Overall confidence below threshold');
            requiresHumanReview = true;
        }

        // Build reasoning string
        const reasoning = requiresHumanReview
            ? `Human review required: ${reasons.join('; ')}`
            : `Invoice processed successfully with ${applyResult.corrections.filter((c) => c.autoApplied).length} auto-applied corrections`;

        return {
            requiresHumanReview,
            confidenceScore,
            reasoning,
        };
    }

    /**
     * Generate memory updates based on processing results
     */
    private generateMemoryUpdates(
        invoice: InvoiceInput,
        applyResult: ApplyResult,
        decision: DecisionResult
    ): MemoryUpdate[] {
        const updates: MemoryUpdate[] = [];

        // If this is a new vendor, create vendor memory
        if (!applyResult.normalizedVendorId.startsWith('vendor_')) {
            // Vendor memory already exists, reinforce it
            updates.push({
                operation: 'reinforce',
                memoryType: 'vendor',
                recordId: applyResult.normalizedVendorId,
                data: {},
                reason: 'Vendor seen again in invoice processing',
            });
        } else {
            // Create new vendor memory
            updates.push({
                operation: 'create',
                memoryType: 'vendor',
                data: {
                    type: 'vendor',
                    canonicalId: applyResult.normalizedVendorId,
                    canonicalName: applyResult.normalizedVendorName,
                    nameVariations: [invoice.vendor.name],
                    confidence: decision.requiresHumanReview ? 0.3 : 0.5,
                },
                reason: 'New vendor encountered',
            });
        }

        // Record duplicate hash for future detection
        updates.push({
            operation: 'create',
            memoryType: 'duplicate',
            data: {
                type: 'duplicate',
                duplicateHash: applyResult.duplicateHash,
                originalInvoiceId: invoice.invoiceId,
                duplicateInvoiceIds: [],
                vendorId: applyResult.normalizedVendorId,
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.totalAmount,
                confirmedDuplicate: false,
                resolution: 'pending',
            },
            reason: 'Record invoice hash for duplicate detection',
        });

        return updates;
    }

    /**
     * Build the normalized invoice from input and corrections
     */
    private buildNormalizedInvoice(
        invoice: InvoiceInput,
        applyResult: ApplyResult
    ): NormalizedInvoice {
        const normalizedLineItems: NormalizedLineItem[] = invoice.lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || item.amount,
            amount: item.amount,
            category: item.category || null,
            productCode: item.productCode || null,
        }));

        return {
            invoiceId: invoice.invoiceId,
            vendor: {
                normalizedName: applyResult.normalizedVendorName,
                canonicalId: applyResult.normalizedVendorId,
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
            normalizationVersion: '1.0.0',
        };
    }
}

// =============================================================================
// Internal Types
// =============================================================================

interface RecallResult {
    vendorMemoryFound: boolean;
    vendorMemory?: ReturnType<MemoryManager['findVendorByName']>;
    correctionsFound: number;
    potentialDuplicate?: ReturnType<MemoryManager['findDuplicate']>;
    duplicateHash: string;
}

interface ApplyResult {
    corrections: ProposedCorrection[];
    normalizedVendorName: string;
    normalizedVendorId: string;
    duplicateDetected: boolean;
    duplicateHash: string;
}

interface DecisionResult {
    requiresHumanReview: boolean;
    confidenceScore: number;
    reasoning: string;
}
