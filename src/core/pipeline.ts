/**
 * Invoice Processing Pipeline
 *
 * Main orchestrator for the Recall -> Apply -> Decide -> Learn pipeline.
 */

import {
    InvoiceInput,
    InvoiceDecisionOutput,
    NormalizedInvoice,
    ProposedCorrection,
    MemoryUpdate,
    AuditTrailEntry,
    VendorMemory,
    CorrectionMemory,
    DuplicateRecord,
} from '../types';
import { MemoryStore } from '../memory';
import { getTimestamp, generateHash } from '../utils';
import { DUPLICATE_DETECTION } from '../config';
import {
    createAuditEntry,
    appendToAuditLog,
    buildReasoningFromAudit,
    AuditStep,
} from './audit';
import {
    checkForDuplicate,
    recordDuplicate,
    recordInvoiceForDuplicateDetection,
} from './duplicates';
import { applyVendorMemories, shouldAddNameVariation } from './rules/vendorRules';
import { applyCorrectionMemories } from './rules/correctionRules';

/**
 * Pipeline configuration options
 */
export interface PipelineOptions {
    /** Simulate human decisions for testing */
    simulateHumanDecision?: boolean;

    /** Override values from simulated human */
    humanOverrides?: {
        approved?: boolean;
        corrections?: ProposedCorrection[];
    };

    /** Confidence threshold for auto-applying corrections */
    autoApplyThreshold?: number;

    /** Confidence threshold for escalating to human review */
    humanReviewThreshold?: number;
}

/**
 * Default pipeline options
 */
const DEFAULT_OPTIONS: Required<PipelineOptions> = {
    simulateHumanDecision: false,
    humanOverrides: {},
    autoApplyThreshold: 0.85,
    humanReviewThreshold: 0.6,
};

/**
 * Context passed through pipeline phases
 */
interface PipelineContext {
    invoice: InvoiceInput;
    options: Required<PipelineOptions>;
    auditTrail: AuditTrailEntry[];
    memoryStore: MemoryStore;
}

/**
 * Result from recall phase
 */
interface RecallResult {
    vendorMemory: VendorMemory | undefined;
    correctionMemories: CorrectionMemory[];
    duplicateRecord: DuplicateRecord | undefined;
    duplicateHash: string;
}

/**
 * Result from apply phase
 */
interface ApplyResult {
    normalizedInvoice: NormalizedInvoice;
    corrections: ProposedCorrection[];
    overallConfidence: number;
}

/**
 * Result from decide phase
 */
interface DecideResult {
    requiresHumanReview: boolean;
    confidenceScore: number;
    reasoning: string;
    finalCorrections: ProposedCorrection[];
}

/**
 * Main entry point: Process an invoice through the pipeline
 */
export async function processInvoice(
    invoice: InvoiceInput,
    memoryStore: MemoryStore,
    options?: PipelineOptions
): Promise<InvoiceDecisionOutput> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const auditTrail: AuditTrailEntry[] = [];
    let skipLearning = false;

    const context: PipelineContext = {
        invoice,
        options: opts,
        auditTrail,
        memoryStore,
    };

    // Phase 1: Recall
    addAudit(context, 'recall', `Starting memory recall for invoice ${invoice.invoiceId}`);
    const recallResult = await recallMemories(context);
    addAudit(
        context,
        'recall',
        `Found: ${recallResult.vendorMemory ? 'vendor memory' : 'no vendor memory'}, ` +
        `${recallResult.correctionMemories.length} corrections, ` +
        `${recallResult.duplicateRecord ? 'potential duplicate' : 'no duplicate'}`
    );

    // Check for duplicate (after recall, before apply)
    const duplicateCheck = checkForDuplicate(invoice, memoryStore);
    if (duplicateCheck.isDuplicate) {
        skipLearning = duplicateCheck.skipLearning;
        addAudit(
            context,
            'decide',
            `Duplicate detected: ${duplicateCheck.reason}. Similarity: ${(duplicateCheck.similarityScore * 100).toFixed(0)}%`
        );

        // Record the duplicate
        recordDuplicate(memoryStore, invoice, duplicateCheck);
    }

    // Phase 2: Apply
    addAudit(context, 'apply', 'Applying memories to normalize invoice');
    const applyResult = await applyMemories(context, recallResult);
    addAudit(
        context,
        'apply',
        `Generated ${applyResult.corrections.length} correction(s), ` +
        `confidence: ${(applyResult.overallConfidence * 100).toFixed(0)}%`
    );

    // Phase 3: Decide
    addAudit(context, 'decide', 'Evaluating confidence and determining action');
    let decideResult = await decideActions(context, applyResult, recallResult);

    // Apply duplicate penalty to confidence
    if (duplicateCheck.isDuplicate) {
        decideResult = {
            ...decideResult,
            confidenceScore: decideResult.confidenceScore * (1 - DUPLICATE_DETECTION.DUPLICATE_CONFIDENCE_PENALTY),
            requiresHumanReview: true,
            reasoning: `${decideResult.reasoning}. DUPLICATE: ${duplicateCheck.reason}`,
        };
    }

    addAudit(
        context,
        'decide',
        decideResult.requiresHumanReview
            ? `Escalating to human review: ${decideResult.reasoning}`
            : `Auto-approved with confidence ${(decideResult.confidenceScore * 100).toFixed(0)}%`
    );

    // Phase 4: Learn (skip if duplicate)
    let memoryUpdates: MemoryUpdate[] = [];
    if (skipLearning) {
        addAudit(context, 'learn', 'Skipping learning - duplicate invoice detected');
    } else {
        addAudit(context, 'learn', 'Recording memory updates');
        memoryUpdates = await learnFromOutcome(context, recallResult, applyResult, decideResult);
        addAudit(context, 'learn', `Generated ${memoryUpdates.length} memory update(s)`);

        // Record invoice hash for future duplicate detection
        recordInvoiceForDuplicateDetection(memoryStore, invoice, duplicateCheck.duplicateHash);
    }

    // Build final output
    const output: InvoiceDecisionOutput = {
        normalizedInvoice: applyResult.normalizedInvoice,
        proposedCorrections: decideResult.finalCorrections,
        requiresHumanReview: decideResult.requiresHumanReview,
        reasoning: decideResult.reasoning,
        confidenceScore: decideResult.confidenceScore,
        memoryUpdates,
        auditTrail,
    };

    // Persist audit trail
    appendToAuditLog(
        invoice.invoiceId,
        auditTrail,
        decideResult.requiresHumanReview,
        decideResult.confidenceScore
    );

    return output;
}

/**
 * Helper to add audit entry
 */
function addAudit(context: PipelineContext, step: AuditStep, details: string): void {
    context.auditTrail.push(createAuditEntry(step, details));
}

// =============================================================================
// Phase 1: Recall
// =============================================================================

async function recallMemories(context: PipelineContext): Promise<RecallResult> {
    const { invoice, memoryStore } = context;

    // Find vendor memory
    const vendorMemory = memoryStore.findVendorByName(invoice.vendor.name);

    // Find applicable corrections
    const correctionMemories = vendorMemory
        ? memoryStore.findCorrections('fieldCorrection', vendorMemory.canonicalId)
        : [];

    // Check for duplicates
    const duplicateHash = generateHash({
        vendorId: invoice.vendor.id || invoice.vendor.name,
        invoiceNumber: invoice.invoiceNumber.toLowerCase().trim(),
        dateKey: invoice.invoiceDate.substring(0, 7),
    });
    const duplicateRecord = memoryStore.findDuplicate(duplicateHash);

    return {
        vendorMemory,
        correctionMemories,
        duplicateRecord,
        duplicateHash,
    };
}

// =============================================================================
// Phase 2: Apply
// =============================================================================

async function applyMemories(
    context: PipelineContext,
    recallResult: RecallResult
): Promise<ApplyResult> {
    const { invoice, options } = context;
    const allCorrections: ProposedCorrection[] = [];

    // Apply vendor memories
    const vendorResult = applyVendorMemories(
        invoice,
        recallResult.vendorMemory,
        options.autoApplyThreshold
    );
    allCorrections.push(...vendorResult.corrections);

    // Log vendor notes
    for (const note of vendorResult.notes) {
        addAudit(context, 'apply', note);
    }

    // Apply correction memories
    const correctionResult = applyCorrectionMemories(
        invoice,
        recallResult.correctionMemories,
        options.autoApplyThreshold
    );
    allCorrections.push(...correctionResult.corrections);

    // Log correction notes
    for (const note of correctionResult.notes) {
        addAudit(context, 'apply', note);
    }

    // Calculate overall confidence
    const vendorWeight = 0.6;
    const correctionWeight = 0.4;
    const overallConfidence =
        vendorResult.vendorConfidence * vendorWeight +
        (correctionResult.averageConfidence || vendorResult.vendorConfidence) * correctionWeight;

    // Build complete normalized invoice
    const normalizedInvoice: NormalizedInvoice = {
        ...(vendorResult.normalizedInvoice as NormalizedInvoice),
        processingTimestamp: getTimestamp(),
        normalizationVersion: '2.0.0',
    };

    return {
        normalizedInvoice,
        corrections: allCorrections,
        overallConfidence,
    };
}

// =============================================================================
// Phase 3: Decide
// =============================================================================

async function decideActions(
    context: PipelineContext,
    applyResult: ApplyResult,
    recallResult: RecallResult
): Promise<DecideResult> {
    const { options } = context;
    const reasons: string[] = [];
    let requiresHumanReview = false;
    let confidenceScore = applyResult.overallConfidence;

    // Check for potential duplicate
    if (recallResult.duplicateRecord?.confirmedDuplicate) {
        reasons.push('Confirmed duplicate detected');
        requiresHumanReview = true;
        confidenceScore *= 0.3;
    } else if (recallResult.duplicateRecord) {
        reasons.push('Potential duplicate detected');
        requiresHumanReview = true;
        confidenceScore *= 0.7;
    }

    // Check for pending corrections
    const pendingCorrections = applyResult.corrections.filter((c) => !c.autoApplied);
    if (pendingCorrections.length > 0) {
        reasons.push(`${pendingCorrections.length} correction(s) require review`);
        requiresHumanReview = true;
    }

    // Check overall confidence
    if (confidenceScore < options.humanReviewThreshold) {
        reasons.push(`Confidence ${(confidenceScore * 100).toFixed(0)}% below threshold`);
        requiresHumanReview = true;
    }

    // Apply human simulation if enabled
    if (options.simulateHumanDecision && options.humanOverrides?.approved !== undefined) {
        if (options.humanOverrides.approved) {
            requiresHumanReview = false;
            confidenceScore = Math.max(confidenceScore, 0.9);
            reasons.push('Approved by simulated human review');
        } else {
            requiresHumanReview = true;
            reasons.push('Rejected by simulated human review');
        }
    }

    // Build reasoning
    const reasoning = buildReasoningFromAudit(context.auditTrail, requiresHumanReview);

    // Determine final corrections
    const finalCorrections = requiresHumanReview
        ? applyResult.corrections // All corrections need review
        : applyResult.corrections.filter((c) => c.autoApplied); // Only auto-applied

    return {
        requiresHumanReview,
        confidenceScore,
        reasoning,
        finalCorrections,
    };
}

// =============================================================================
// Phase 4: Learn
// =============================================================================

async function learnFromOutcome(
    context: PipelineContext,
    recallResult: RecallResult,
    applyResult: ApplyResult,
    decideResult: DecideResult
): Promise<MemoryUpdate[]> {
    const { invoice } = context;
    const updates: MemoryUpdate[] = [];

    // Update or create vendor memory
    if (recallResult.vendorMemory) {
        // Reinforce existing vendor memory
        updates.push({
            operation: 'reinforce',
            memoryType: 'vendor',
            recordId: recallResult.vendorMemory.id,
            data: {},
            reason: 'Vendor seen in invoice processing',
        });

        // Add name variation if applicable
        if (shouldAddNameVariation(recallResult.vendorMemory, invoice.vendor.name)) {
            updates.push({
                operation: 'update',
                memoryType: 'vendor',
                recordId: recallResult.vendorMemory.id,
                data: {
                    nameVariations: [...recallResult.vendorMemory.nameVariations, invoice.vendor.name],
                },
                reason: 'New name variation discovered',
            });
        }
    } else {
        // Create new vendor memory
        updates.push({
            operation: 'create',
            memoryType: 'vendor',
            data: {
                type: 'vendor',
                canonicalId: applyResult.normalizedInvoice.vendor.canonicalId,
                canonicalName: applyResult.normalizedInvoice.vendor.normalizedName,
                nameVariations: [invoice.vendor.name],
                fieldMappings: {},
                behaviors: {},
                confidence: decideResult.requiresHumanReview ? 0.3 : 0.5,
            },
            reason: 'New vendor encountered',
        });
    }

    // Record duplicate hash
    if (!recallResult.duplicateRecord) {
        updates.push({
            operation: 'create',
            memoryType: 'duplicate',
            data: {
                type: 'duplicate',
                duplicateHash: recallResult.duplicateHash,
                originalInvoiceId: invoice.invoiceId,
                duplicateInvoiceIds: [],
                vendorId: applyResult.normalizedInvoice.vendor.canonicalId,
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.totalAmount,
                confirmedDuplicate: false,
                resolution: 'pending',
            },
            reason: 'Record invoice hash for duplicate detection',
        });
    }

    // Record corrections that were auto-applied
    const autoApplied = applyResult.corrections.filter((c) => c.autoApplied);
    for (const correction of autoApplied) {
        if (correction.source) {
            updates.push({
                operation: 'reinforce',
                memoryType: 'correction',
                recordId: correction.source,
                data: {},
                reason: `Correction auto-applied: ${correction.field}`,
            });
        }
    }

    return updates;
}
