/**
 * Memory Manager
 *
 * Handles persistence and retrieval of memory records.
 * Provides methods for loading, saving, and querying the memory store.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    MemoryStore,
    VendorMemory,
    CorrectionMemory,
    ResolutionMemory,
    DuplicateRecord,
    MemoryUpdate,
    AuditTrailEntry,
} from '../types';
import { getTimestamp, generateId, logger } from '../utils';

/**
 * Default configuration for memory manager
 */
const DEFAULT_MEMORY_PATH = path.join(process.cwd(), 'data', 'memory.json');
const DEFAULT_AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'audit-log.jsonl');
const SCHEMA_VERSION = '1.0.0';

/**
 * Creates an empty memory store with the correct schema
 */
function createEmptyMemoryStore(): MemoryStore {
    return {
        schemaVersion: SCHEMA_VERSION,
        lastUpdated: getTimestamp(),
        vendors: {},
        corrections: [],
        resolutions: [],
        duplicates: [],
        stats: {
            totalInvoicesProcessed: 0,
            totalCorrectionsApplied: 0,
            totalHumanReviewsRequested: 0,
            averageConfidence: 0,
        },
    };
}

/**
 * Memory Manager class for handling persistent memory operations
 */
export class MemoryManager {
    private memoryStore: MemoryStore;
    private memoryPath: string;
    private auditLogPath: string;
    private isDirty: boolean = false;

    constructor(memoryPath?: string, auditLogPath?: string) {
        this.memoryPath = memoryPath || DEFAULT_MEMORY_PATH;
        this.auditLogPath = auditLogPath || DEFAULT_AUDIT_LOG_PATH;
        this.memoryStore = createEmptyMemoryStore();
    }

    /**
     * Load memory from persistent storage
     */
    async load(): Promise<void> {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.memoryPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Load existing memory or create new
            if (fs.existsSync(this.memoryPath)) {
                const data = fs.readFileSync(this.memoryPath, 'utf-8');
                this.memoryStore = JSON.parse(data) as MemoryStore;
                logger.info(`Memory loaded from ${this.memoryPath}`);
            } else {
                this.memoryStore = createEmptyMemoryStore();
                await this.save();
                logger.info('Initialized new memory store');
            }

            // TODO: Implement schema migration if schemaVersion differs
        } catch (error) {
            logger.error('Failed to load memory store', error);
            throw error;
        }
    }

    /**
     * Save memory to persistent storage
     */
    async save(): Promise<void> {
        try {
            const dir = path.dirname(this.memoryPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.memoryStore.lastUpdated = getTimestamp();
            const data = JSON.stringify(this.memoryStore, null, 2);
            fs.writeFileSync(this.memoryPath, data, 'utf-8');
            this.isDirty = false;
            logger.debug('Memory saved successfully');
        } catch (error) {
            logger.error('Failed to save memory store', error);
            throw error;
        }
    }

    /**
     * Get the current memory store (read-only snapshot)
     */
    getStore(): Readonly<MemoryStore> {
        return this.memoryStore;
    }

    // ===========================================================================
    // Vendor Memory Operations
    // ===========================================================================

    /**
     * Get vendor memory by canonical ID
     */
    getVendorMemory(vendorId: string): VendorMemory | undefined {
        return this.memoryStore.vendors[vendorId];
    }

    /**
     * Find vendor memory by name variation
     */
    findVendorByName(vendorName: string): VendorMemory | undefined {
        const normalizedName = vendorName.toLowerCase().trim();

        for (const vendor of Object.values(this.memoryStore.vendors)) {
            if (vendor.canonicalName.toLowerCase() === normalizedName) {
                return vendor;
            }
            if (vendor.nameVariations.some((v) => v.toLowerCase() === normalizedName)) {
                return vendor;
            }
        }

        return undefined;
    }

    /**
     * Add or update vendor memory
     */
    upsertVendorMemory(vendor: Partial<VendorMemory> & { canonicalId: string }): VendorMemory {
        const existing = this.memoryStore.vendors[vendor.canonicalId];

        if (existing) {
            // Update existing vendor
            const updated: VendorMemory = {
                ...existing,
                ...vendor,
                updatedAt: getTimestamp(),
                reinforcementCount: existing.reinforcementCount + 1,
            };
            this.memoryStore.vendors[vendor.canonicalId] = updated;
            this.isDirty = true;
            return updated;
        } else {
            // Create new vendor memory
            const newVendor: VendorMemory = {
                ...vendor,
                type: 'vendor',
                id: generateId('vendor'),
                createdAt: getTimestamp(),
                updatedAt: getTimestamp(),
                confidence: 0.5,
                reinforcementCount: 1,
                contradictionCount: 0,
                isActive: true,
                nameVariations: vendor.nameVariations || [],
                canonicalName: vendor.canonicalName || '',
                canonicalId: vendor.canonicalId,
                fieldMappings: vendor.fieldMappings || {},
                behaviors: vendor.behaviors || {},
            };
            this.memoryStore.vendors[vendor.canonicalId] = newVendor;
            this.isDirty = true;
            return newVendor;
        }
    }

    // ===========================================================================
    // Correction Memory Operations
    // ===========================================================================

    /**
     * Get all correction memories for a pattern type
     */
    getCorrectionsByPatternType(patternType: CorrectionMemory['pattern']['type']): CorrectionMemory[] {
        return this.memoryStore.corrections.filter((c) => c.pattern.type === patternType && c.isActive);
    }

    /**
     * Find a correction for a specific pattern signature
     */
    findCorrectionBySignature(signature: string): CorrectionMemory | undefined {
        return this.memoryStore.corrections.find(
            (c) => c.pattern.signature === signature && c.isActive
        );
    }

    /**
     * Add a new correction memory
     */
    addCorrection(correction: Omit<CorrectionMemory, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'reinforcementCount' | 'contradictionCount' | 'isActive'>): CorrectionMemory {
        const newCorrection: CorrectionMemory = {
            type: 'correction',
            id: generateId('corr'),
            createdAt: getTimestamp(),
            updatedAt: getTimestamp(),
            reinforcementCount: 1,
            contradictionCount: 0,
            isActive: true,
            ...correction,
        };

        this.memoryStore.corrections.push(newCorrection);
        this.isDirty = true;
        return newCorrection;
    }

    // ===========================================================================
    // Resolution Memory Operations
    // ===========================================================================

    /**
     * Find resolution memory by context hash
     */
    findResolution(contextHash: string): ResolutionMemory | undefined {
        return this.memoryStore.resolutions.find((r) => r.contextHash === contextHash && r.isActive);
    }

    /**
     * Add a new resolution memory
     */
    addResolution(resolution: Omit<ResolutionMemory, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'reinforcementCount' | 'contradictionCount' | 'isActive'>): ResolutionMemory {
        const newResolution: ResolutionMemory = {
            type: 'resolution',
            id: generateId('res'),
            createdAt: getTimestamp(),
            updatedAt: getTimestamp(),
            reinforcementCount: 1,
            contradictionCount: 0,
            isActive: true,
            ...resolution,
        };

        this.memoryStore.resolutions.push(newResolution);
        this.isDirty = true;
        return newResolution;
    }

    // ===========================================================================
    // Duplicate Detection Operations
    // ===========================================================================

    /**
     * Find duplicate record by hash
     */
    findDuplicate(duplicateHash: string): DuplicateRecord | undefined {
        return this.memoryStore.duplicates.find((d) => d.duplicateHash === duplicateHash);
    }

    /**
     * Add a new duplicate record
     */
    addDuplicate(duplicate: Omit<DuplicateRecord, 'id' | 'type' | 'createdAt' | 'updatedAt' | 'reinforcementCount' | 'contradictionCount' | 'isActive'>): DuplicateRecord {
        const newDuplicate: DuplicateRecord = {
            type: 'duplicate',
            id: generateId('dup'),
            createdAt: getTimestamp(),
            updatedAt: getTimestamp(),
            reinforcementCount: 1,
            contradictionCount: 0,
            isActive: true,
            ...duplicate,
        };

        this.memoryStore.duplicates.push(newDuplicate);
        this.isDirty = true;
        return newDuplicate;
    }

    // ===========================================================================
    // Memory Reinforcement & Decay
    // ===========================================================================

    /**
     * Reinforce a memory record (increase confidence)
     */
    reinforceMemory(recordId: string): void {
        // TODO: Implement memory reinforcement logic
        // - Find the memory record by ID across all memory types
        // - Increase reinforcement count
        // - Recalculate confidence score
        logger.debug(`Reinforcing memory: ${recordId}`);
    }

    /**
     * Contradict a memory record (decrease confidence)
     */
    contradictMemory(recordId: string): void {
        // TODO: Implement memory contradiction logic
        // - Find the memory record by ID
        // - Increase contradiction count
        // - Recalculate confidence score
        // - Deactivate if contradiction ratio exceeds threshold
        logger.debug(`Contradicting memory: ${recordId}`);
    }

    /**
     * Apply decay to all memories based on time elapsed
     */
    applyDecay(decayRate: number): void {
        // TODO: Implement memory decay logic
        // - Iterate through all memory records
        // - Calculate time since last update
        // - Apply decay factor to confidence
        // - Deactivate memories that fall below threshold
        logger.debug(`Applying decay with rate: ${decayRate}`);
    }

    // ===========================================================================
    // Batch Operations
    // ===========================================================================

    /**
     * Apply a batch of memory updates
     */
    async applyUpdates(updates: MemoryUpdate[]): Promise<void> {
        for (const update of updates) {
            // TODO: Implement batch update logic based on operation type
            logger.debug(`Applying update: ${update.operation} on ${update.memoryType}`);
        }

        if (this.isDirty) {
            await this.save();
        }
    }

    // ===========================================================================
    // Statistics
    // ===========================================================================

    /**
     * Update global statistics after processing an invoice
     */
    updateStats(corrections: number, humanReviewRequired: boolean, confidence: number): void {
        const stats = this.memoryStore.stats;
        stats.totalInvoicesProcessed += 1;
        stats.totalCorrectionsApplied += corrections;
        if (humanReviewRequired) {
            stats.totalHumanReviewsRequested += 1;
        }

        // Running average for confidence
        const totalProcessed = stats.totalInvoicesProcessed;
        stats.averageConfidence =
            (stats.averageConfidence * (totalProcessed - 1) + confidence) / totalProcessed;

        this.isDirty = true;
    }

    // ===========================================================================
    // Audit Logging
    // ===========================================================================

    /**
     * Write an audit trail entry to the audit log
     */
    writeAuditLog(invoiceId: string, entries: AuditTrailEntry[]): void {
        try {
            const dir = path.dirname(this.auditLogPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const logEntry = {
                invoiceId,
                processedAt: getTimestamp(),
                entries,
            };

            fs.appendFileSync(this.auditLogPath, JSON.stringify(logEntry) + '\n', 'utf-8');
        } catch (error) {
            logger.error('Failed to write audit log', error);
        }
    }
}
