/**
 * Invoice Memory System - TypeScript Interfaces
 *
 * This file contains all the core type definitions for the invoice memory system.
 * These types define the contract for invoice processing, memory storage, and decision outputs.
 */

// =============================================================================
// Invoice Types
// =============================================================================

/**
 * Raw extracted invoice data received from upstream systems.
 * This is the input to the memory-driven learning layer.
 */
export interface InvoiceInput {
    /** Unique identifier for the invoice */
    invoiceId: string;

    /** Vendor/supplier information */
    vendor: {
        name: string;
        id?: string;
        taxId?: string;
        address?: string;
    };

    /** Invoice date in ISO 8601 format */
    invoiceDate: string;

    /** Due date in ISO 8601 format */
    dueDate?: string;

    /** Invoice number as appears on the document */
    invoiceNumber: string;

    /** Total amount */
    totalAmount: number;

    /** Currency code (e.g., USD, EUR) */
    currency: string;

    /** Line items on the invoice */
    lineItems: LineItem[];

    /** Purchase order reference */
    poNumber?: string;

    /** Additional extracted fields (extensible) */
    metadata?: Record<string, unknown>;

    /** Raw extraction confidence from upstream OCR/extraction */
    extractionConfidence?: number;
}

/**
 * Individual line item on an invoice
 */
export interface LineItem {
    description: string;
    quantity?: number;
    unitPrice?: number;
    amount: number;
    category?: string;
    productCode?: string;
}

/**
 * Normalized invoice after processing and corrections
 */
export interface NormalizedInvoice {
    /** Original invoice ID */
    invoiceId: string;

    /** Normalized vendor information */
    vendor: {
        normalizedName: string;
        canonicalId: string;
        originalName: string;
    };

    /** Standardized dates */
    invoiceDate: string;
    dueDate: string | null;

    /** Cleaned invoice number */
    invoiceNumber: string;

    /** Financial details */
    totalAmount: number;
    currency: string;
    lineItems: NormalizedLineItem[];

    /** References */
    poNumber: string | null;

    /** Processing metadata */
    processingTimestamp: string;
    normalizationVersion: string;
}

/**
 * Normalized line item
 */
export interface NormalizedLineItem {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    category: string | null;
    productCode: string | null;
}

// =============================================================================
// Memory Types
// =============================================================================

/**
 * Base interface for all memory records
 */
export interface BaseMemoryRecord {
    /** Unique identifier for this memory record */
    id: string;

    /** When this memory was created */
    createdAt: string;

    /** When this memory was last updated */
    updatedAt: string;

    /** Confidence score (0-1) */
    confidence: number;

    /** Number of times this memory has been reinforced */
    reinforcementCount: number;

    /** Number of times this memory has been contradicted */
    contradictionCount: number;

    /** Whether this memory is active or has decayed/been invalidated */
    isActive: boolean;
}

/**
 * Field mapping for vendor-specific field translations
 * e.g., "Leistungsdatum" -> "serviceDate"
 */
export interface FieldMapping {
    /** Original field name as seen in vendor invoices */
    sourceField: string;

    /** Normalized/target field name in our system */
    targetField: string;

    /** Confidence in this mapping (0-1) */
    confidence: number;

    /** Number of times this mapping has been seen */
    occurrenceCount: number;

    /** Example values seen for this field */
    exampleValues?: string[];
}

/**
 * Vendor-specific behaviors and defaults
 */
export interface VendorBehavior {
    /** Whether VAT is typically included in amounts */
    vatIncluded?: boolean;

    /** Default VAT rate for this vendor */
    defaultVatRate?: number;

    /** Default currency for this vendor */
    defaultCurrency?: string;

    /** Typical payment terms in days */
    paymentTermsDays?: number;

    /** Expected invoice number pattern (regex) */
    invoiceNumberPattern?: string;

    /** Common categories for this vendor */
    expectedCategories?: string[];

    /** Quantity resolution strategy for mismatches */
    quantityMismatchStrategy?: 'preferInvoice' | 'preferDeliveryNote' | 'askHuman';

    /** Tax recomputation rule */
    taxRecomputationRule?: 'useVendorTax' | 'recompute' | 'askHuman';
}

/**
 * Memory record for vendor-specific patterns and normalization rules
 */
export interface VendorMemory extends BaseMemoryRecord {
    type: 'vendor';

    /** Canonical/normalized vendor name */
    canonicalName: string;

    /** Canonical vendor ID */
    canonicalId: string;

    /** Original vendor name variations encountered */
    nameVariations: string[];

    /** Field mappings specific to this vendor */
    fieldMappings: Record<string, FieldMapping>;

    /** Vendor-specific behaviors */
    behaviors: VendorBehavior;

    /** Tax ID if known */
    taxId?: string;
}

/**
 * Pattern signature for correction matching
 */
export interface CorrectionPattern {
    /** Type of pattern */
    type: 'quantityMismatch' | 'taxRecomputation' | 'fieldCorrection' | 'amountAdjustment' | 'other';

    /** Unique signature for this pattern (used for matching) */
    signature: string;

    /** Description of what condition triggers this pattern */
    condition: string;

    /** Additional context for the pattern */
    context?: Record<string, unknown>;
}

/**
 * Memory record for correction patterns
 */
export interface CorrectionMemory extends BaseMemoryRecord {
    type: 'correction';

    /** Pattern that triggers this correction */
    pattern: CorrectionPattern;

    /** Suggested action to take */
    suggestedAction: string;

    /** Vendor context (if vendor-specific correction) */
    vendorId?: string;

    /** Whether this correction was human-approved */
    humanApproved: boolean;
}

/**
 * Human decision record
 */
export interface HumanDecision {
    /** Type of decision */
    decisionType: 'approveCorrection' | 'rejectCorrection' | 'approveInvoice' | 'escalate';

    /** The action taken */
    action: 'approved' | 'rejected' | 'modified';

    /** Timestamp of the decision */
    timestamp: string;

    /** Optional reason provided */
    reason?: string;

    /** User ID who made the decision */
    userId?: string;
}

/**
 * Memory record for resolution patterns (tracking human decisions)
 */
export interface ResolutionMemory extends BaseMemoryRecord {
    type: 'resolution';

    /** History of human decisions for this pattern */
    decisions: HumanDecision[];

    /** Related memory ID that was approved/rejected */
    relatedMemoryId?: string;

    /** Context hash for matching similar situations */
    contextHash: string;
}

/**
 * Record for tracking potential duplicates
 */
export interface DuplicateRecord extends BaseMemoryRecord {
    type: 'duplicate';

    /** Hash used for duplicate detection */
    duplicateHash: string;

    /** Invoice ID of the original invoice */
    originalInvoiceId: string;

    /** Invoice IDs of duplicates */
    duplicateInvoiceIds: string[];

    /** Vendor ID for this duplicate set */
    vendorId: string;

    /** Invoice number */
    invoiceNumber: string;

    /** Amount for similarity matching */
    amount: number;

    /** Whether this was confirmed as a duplicate */
    confirmedDuplicate: boolean;

    /** Resolution status */
    resolution: 'pending' | 'confirmed' | 'rejected';
}

/**
 * Union type for all memory record types
 */
export type MemoryRecord = VendorMemory | CorrectionMemory | ResolutionMemory | DuplicateRecord;

/**
 * Root memory store structure (legacy - used by MemoryManager)
 */
export interface MemoryStore {
    /** Schema version for migration support */
    schemaVersion: string;

    /** Last updated timestamp */
    lastUpdated: string;

    /** Vendor memories indexed by canonical vendor ID */
    vendors: Record<string, VendorMemory>;

    /** Correction memories */
    corrections: CorrectionMemory[];

    /** Resolution memories */
    resolutions: ResolutionMemory[];

    /** Duplicate detection records */
    duplicates: DuplicateRecord[];

    /** Global statistics */
    stats: {
        totalInvoicesProcessed: number;
        totalCorrectionsApplied: number;
        totalHumanReviewsRequested: number;
        averageConfidence: number;
    };
}

/**
 * Root memory store data structure (used by MemoryStore class)
 */
export interface MemoryStoreData {
    /** Schema version for migration support */
    schemaVersion: string;

    /** Last updated timestamp */
    lastUpdated: string;

    /** Vendor memories indexed by canonical vendor ID */
    vendorMemories: Record<string, VendorMemory>;

    /** Correction memories */
    correctionMemories: CorrectionMemory[];

    /** Resolution memories */
    resolutionMemories: ResolutionMemory[];

    /** Duplicate detection records */
    duplicates: DuplicateRecord[];

    /** Global statistics */
    stats: {
        totalInvoicesProcessed: number;
        totalCorrectionsApplied: number;
        totalHumanReviewsRequested: number;
        averageConfidence: number;
    };
}

// =============================================================================
// Decision Output Types
// =============================================================================

/**
 * Audit trail entry tracking each step in the decision process
 */
export interface AuditTrailEntry {
    /** Step type in the decision process */
    step: 'recall' | 'apply' | 'decide' | 'learn';

    /** Timestamp of this step */
    timestamp: string;

    /** Description of what happened in this step */
    details: string;
}

/**
 * Proposed correction to be applied or reviewed
 */
export interface ProposedCorrection {
    /** Field being corrected */
    field: string;

    /** Original value */
    originalValue: unknown;

    /** Proposed new value */
    proposedValue: unknown;

    /** Confidence in this correction (0-1) */
    confidence: number;

    /** Reasoning for this correction */
    reasoning: string;

    /** Source of this correction (memory ID or rule name) */
    source: string;

    /** Whether this was auto-applied or needs review */
    autoApplied: boolean;
}

/**
 * Memory update to be persisted
 */
export interface MemoryUpdate {
    /** Type of update operation */
    operation: 'create' | 'update' | 'reinforce' | 'contradict' | 'decay';

    /** Type of memory being updated */
    memoryType: 'vendor' | 'correction' | 'resolution' | 'duplicate';

    /** Memory record ID (for updates) or new record (for creates) */
    recordId?: string;

    /** The memory data */
    data: Partial<MemoryRecord>;

    /** Reason for this update */
    reason: string;
}

/**
 * Final output from processing an invoice through the decision engine
 */
export interface InvoiceDecisionOutput {
    /** The normalized invoice after all processing */
    normalizedInvoice: NormalizedInvoice;

    /** List of proposed or applied corrections */
    proposedCorrections: ProposedCorrection[];

    /** Whether this invoice requires human review */
    requiresHumanReview: boolean;

    /** Human-readable reasoning for the decision */
    reasoning: string;

    /** Overall confidence score for this decision (0-1) */
    confidenceScore: number;

    /** Memory updates to be persisted */
    memoryUpdates: MemoryUpdate[];

    /** Complete audit trail for this decision */
    auditTrail: AuditTrailEntry[];
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the decision engine
 */
export interface DecisionEngineConfig {
    /** Confidence threshold below which human review is required */
    humanReviewThreshold: number;

    /** Confidence threshold for auto-applying corrections */
    autoApplyThreshold: number;

    /** Memory decay rate per day of inactivity */
    memoryDecayRate: number;

    /** Minimum reinforcement count before trusting a memory */
    minReinforcementCount: number;

    /** Maximum contradiction ratio before invalidating a memory */
    maxContradictionRatio: number;

    /** Path to memory store file */
    memoryStorePath: string;

    /** Path to audit log file */
    auditLogPath: string;
}
