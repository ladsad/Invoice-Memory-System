/**
 * Memory Store
 *
 * Dedicated persistence layer for the memory system.
 * Handles loading, saving, and CRUD operations for all memory types.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    MemoryStoreData,
    VendorMemory,
    CorrectionMemory,
    ResolutionMemory,
    DuplicateRecord,
    FieldMapping,
    VendorBehavior,
    CorrectionPattern,
    HumanDecision,
} from '../types';
import { getTimestamp, generateId, generateHash, logger } from '../utils';
import {
    initialConfidence,
    reinforce,
    penalize,
    applyDecay,
    shouldDeactivate,
} from './confidence';

/**
 * Default paths for memory storage
 */
const DEFAULT_MEMORY_PATH = path.join(process.cwd(), 'data', 'memory.json');
const SCHEMA_VERSION = '2.0.0';

/**
 * Creates an empty memory store with the correct schema
 */
function createEmptyStore(): MemoryStoreData {
    return {
        schemaVersion: SCHEMA_VERSION,
        lastUpdated: getTimestamp(),
        vendorMemories: {},
        correctionMemories: [],
        resolutionMemories: [],
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
 * MemoryStore class - dedicated persistence layer
 */
export class MemoryStore {
    private data: MemoryStoreData;
    private filePath: string;
    private isDirty: boolean = false;

    constructor(filePath?: string) {
        this.filePath = filePath || DEFAULT_MEMORY_PATH;
        this.data = createEmptyStore();
    }

    // ===========================================================================
    // Persistence Operations
    // ===========================================================================

    /**
     * Load memory store from disk
     */
    async loadFromDisk(): Promise<void> {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf-8');
                const loaded = JSON.parse(raw) as MemoryStoreData;

                // Handle schema migration if needed
                if (loaded.schemaVersion !== SCHEMA_VERSION) {
                    logger.warn(`Schema version mismatch: ${loaded.schemaVersion} -> ${SCHEMA_VERSION}`);
                    this.data = this.migrateSchema(loaded);
                } else {
                    this.data = loaded;
                }

                logger.info(`Memory store loaded from ${this.filePath}`);
            } else {
                this.data = createEmptyStore();
                await this.saveToDisk();
                logger.info('Initialized new memory store');
            }
        } catch (error) {
            logger.error('Failed to load memory store', error);
            throw error;
        }
    }

    /**
     * Save memory store to disk
     */
    async saveToDisk(): Promise<void> {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.data.lastUpdated = getTimestamp();
            const json = JSON.stringify(this.data, null, 2);
            fs.writeFileSync(this.filePath, json, 'utf-8');
            this.isDirty = false;
            logger.debug('Memory store saved successfully');
        } catch (error) {
            logger.error('Failed to save memory store', error);
            throw error;
        }
    }

    /**
     * Migrate from older schema versions
     */
    private migrateSchema(oldData: MemoryStoreData): MemoryStoreData {
        // TODO: Implement actual migration logic when schema changes
        logger.info('Migrating memory store schema...');

        // For now, preserve existing data and update version
        return {
            ...createEmptyStore(),
            ...oldData,
            schemaVersion: SCHEMA_VERSION,
            lastUpdated: getTimestamp(),
        };
    }

    /**
     * Get raw store data (read-only)
     */
    getData(): Readonly<MemoryStoreData> {
        return this.data;
    }

    // ===========================================================================
    // Vendor Memory Operations
    // ===========================================================================

    /**
     * Get vendor memory by ID
     */
    getVendorMemory(vendorId: string): VendorMemory | undefined {
        return this.data.vendorMemories[vendorId];
    }

    /**
     * Find vendor memory by name (checks canonical name and variations)
     */
    findVendorByName(vendorName: string): VendorMemory | undefined {
        const normalized = vendorName.toLowerCase().trim();

        for (const vendor of Object.values(this.data.vendorMemories)) {
            if (!vendor.isActive) continue;

            if (vendor.canonicalName.toLowerCase() === normalized) {
                return vendor;
            }
            if (vendor.nameVariations.some((v) => v.toLowerCase() === normalized)) {
                return vendor;
            }
        }
        return undefined;
    }

    /**
     * Create or update vendor memory
     */
    updateVendorMemory(
        vendorId: string,
        updates: {
            canonicalName?: string;
            nameVariation?: string;
            fieldMapping?: FieldMapping;
            behavior?: Partial<VendorBehavior>;
            taxId?: string;
        }
    ): VendorMemory {
        const existing = this.data.vendorMemories[vendorId];

        if (existing) {
            // Update existing vendor
            if (updates.nameVariation && !existing.nameVariations.includes(updates.nameVariation)) {
                existing.nameVariations.push(updates.nameVariation);
            }
            if (updates.fieldMapping) {
                existing.fieldMappings[updates.fieldMapping.sourceField] = updates.fieldMapping;
            }
            if (updates.behavior) {
                existing.behaviors = { ...existing.behaviors, ...updates.behavior };
            }
            if (updates.canonicalName) {
                existing.canonicalName = updates.canonicalName;
            }
            if (updates.taxId) {
                existing.taxId = updates.taxId;
            }

            existing.updatedAt = getTimestamp();
            existing.confidence = reinforce(existing.confidence);
            existing.reinforcementCount += 1;

            this.isDirty = true;
            return existing;
        } else {
            // Create new vendor memory
            const newVendor: VendorMemory = {
                type: 'vendor',
                id: generateId('vendor'),
                createdAt: getTimestamp(),
                updatedAt: getTimestamp(),
                confidence: initialConfidence(),
                reinforcementCount: 1,
                contradictionCount: 0,
                isActive: true,
                canonicalId: vendorId,
                canonicalName: updates.canonicalName || vendorId,
                nameVariations: updates.nameVariation ? [updates.nameVariation] : [],
                fieldMappings: updates.fieldMapping
                    ? { [updates.fieldMapping.sourceField]: updates.fieldMapping }
                    : {},
                behaviors: updates.behavior || {},
                taxId: updates.taxId,
            };

            this.data.vendorMemories[vendorId] = newVendor;
            this.isDirty = true;
            return newVendor;
        }
    }

    /**
     * Add a field mapping to a vendor
     */
    addVendorFieldMapping(vendorId: string, mapping: FieldMapping): void {
        const vendor = this.data.vendorMemories[vendorId];
        if (vendor) {
            vendor.fieldMappings[mapping.sourceField] = mapping;
            vendor.updatedAt = getTimestamp();
            this.isDirty = true;
        }
    }

    // ===========================================================================
    // Correction Memory Operations
    // ===========================================================================

    /**
     * Record a new correction pattern
     */
    recordCorrection(params: {
        pattern: CorrectionPattern;
        suggestedAction: string;
        vendorId?: string;
        humanApproved?: boolean;
    }): CorrectionMemory {
        // Check if similar correction already exists
        const existing = this.findSimilarCorrection(params.pattern);

        if (existing) {
            // Reinforce existing correction
            existing.confidence = reinforce(existing.confidence);
            existing.reinforcementCount += 1;
            existing.updatedAt = getTimestamp();
            this.isDirty = true;
            return existing;
        }

        // Create new correction memory
        const correction: CorrectionMemory = {
            type: 'correction',
            id: generateId('corr'),
            createdAt: getTimestamp(),
            updatedAt: getTimestamp(),
            confidence: params.humanApproved ? 0.7 : initialConfidence(),
            reinforcementCount: 1,
            contradictionCount: 0,
            isActive: true,
            pattern: params.pattern,
            suggestedAction: params.suggestedAction,
            vendorId: params.vendorId,
            humanApproved: params.humanApproved || false,
        };

        this.data.correctionMemories.push(correction);
        this.isDirty = true;
        return correction;
    }

    /**
     * Find corrections matching a pattern signature
     */
    findCorrections(patternType: CorrectionPattern['type'], vendorId?: string): CorrectionMemory[] {
        return this.data.correctionMemories.filter(
            (c) =>
                c.isActive &&
                c.pattern.type === patternType &&
                (vendorId === undefined || c.vendorId === vendorId || c.vendorId === undefined)
        );
    }

    /**
     * Find a similar existing correction
     */
    private findSimilarCorrection(pattern: CorrectionPattern): CorrectionMemory | undefined {
        return this.data.correctionMemories.find(
            (c) =>
                c.isActive &&
                c.pattern.type === pattern.type &&
                c.pattern.signature === pattern.signature
        );
    }

    // ===========================================================================
    // Resolution Memory Operations
    // ===========================================================================

    /**
     * Record a human resolution decision
     */
    recordResolution(params: {
        decision: HumanDecision;
        relatedMemoryId?: string;
        contextHash?: string;
    }): ResolutionMemory {
        const now = getTimestamp();
        const contextHash = params.contextHash || generateHash({
            type: params.decision.decisionType,
            action: params.decision.action,
        });

        // Check for existing resolution with same context
        const existing = this.data.resolutionMemories.find(
            (r) => r.isActive && r.contextHash === contextHash
        );

        if (existing) {
            // Update with new decision
            existing.decisions.push(params.decision);
            existing.confidence = reinforce(existing.confidence);
            existing.reinforcementCount += 1;
            existing.updatedAt = now;
            this.isDirty = true;
            return existing;
        }

        // Create new resolution memory
        const resolution: ResolutionMemory = {
            type: 'resolution',
            id: generateId('res'),
            createdAt: now,
            updatedAt: now,
            confidence: 0.6, // Human decisions start with higher confidence
            reinforcementCount: 1,
            contradictionCount: 0,
            isActive: true,
            decisions: [params.decision],
            relatedMemoryId: params.relatedMemoryId,
            contextHash,
        };

        this.data.resolutionMemories.push(resolution);

        // If this resolution contradicts an existing memory, penalize it
        if (params.relatedMemoryId && params.decision.action === 'rejected') {
            this.penalizeMemory(params.relatedMemoryId);
        }

        this.isDirty = true;
        return resolution;
    }

    /**
     * Find resolution by context hash
     */
    findResolution(contextHash: string): ResolutionMemory | undefined {
        return this.data.resolutionMemories.find(
            (r) => r.isActive && r.contextHash === contextHash
        );
    }

    // ===========================================================================
    // Duplicate Detection Operations
    // ===========================================================================

    /**
     * Record a potential duplicate
     */
    recordDuplicate(params: {
        vendorId: string;
        invoiceNumber: string;
        invoiceDate: string;
        amount: number;
        invoiceId: string;
    }): { isDuplicate: boolean; record: DuplicateRecord } {
        // Generate duplicate detection hash
        const duplicateHash = generateHash({
            vendorId: params.vendorId,
            invoiceNumber: params.invoiceNumber.toLowerCase().trim(),
            // Include date with some fuzzing (same month)
            dateKey: params.invoiceDate.substring(0, 7),
        });

        // Check for existing duplicate
        const existing = this.data.duplicates.find((d) => d.duplicateHash === duplicateHash);

        if (existing) {
            // This is a potential duplicate
            const similarity = this.calculateDuplicateSimilarity(existing, params);

            if (similarity > 0.8) {
                existing.duplicateInvoiceIds.push(params.invoiceId);
                existing.updatedAt = getTimestamp();
                existing.confidence = reinforce(existing.confidence);
                this.isDirty = true;

                return { isDuplicate: true, record: existing };
            }
        }

        // Create new duplicate record (first occurrence)
        const record: DuplicateRecord = {
            type: 'duplicate',
            id: generateId('dup'),
            createdAt: getTimestamp(),
            updatedAt: getTimestamp(),
            confidence: initialConfidence(),
            reinforcementCount: 1,
            contradictionCount: 0,
            isActive: true,
            duplicateHash,
            originalInvoiceId: params.invoiceId,
            duplicateInvoiceIds: [],
            vendorId: params.vendorId,
            invoiceNumber: params.invoiceNumber,
            amount: params.amount,
            confirmedDuplicate: false,
            resolution: 'pending',
        };

        this.data.duplicates.push(record);
        this.isDirty = true;

        return { isDuplicate: false, record };
    }

    /**
     * Calculate similarity between existing record and new invoice
     */
    private calculateDuplicateSimilarity(
        existing: DuplicateRecord,
        params: { invoiceNumber: string; amount: number }
    ): number {
        let score = 0;

        // Invoice number match
        if (existing.invoiceNumber.toLowerCase() === params.invoiceNumber.toLowerCase()) {
            score += 0.5;
        }

        // Amount match (within 1% tolerance)
        const amountDiff = Math.abs(existing.amount - params.amount) / existing.amount;
        if (amountDiff < 0.01) {
            score += 0.5;
        } else if (amountDiff < 0.05) {
            score += 0.3;
        }

        return score;
    }

    /**
     * Find duplicate by hash
     */
    findDuplicate(hash: string): DuplicateRecord | undefined {
        return this.data.duplicates.find((d) => d.duplicateHash === hash);
    }

    // ===========================================================================
    // Confidence Management
    // ===========================================================================

    /**
     * Reinforce a memory by ID (increases confidence)
     */
    reinforceMemory(memoryId: string): void {
        const memory = this.findMemoryById(memoryId);
        if (memory) {
            memory.confidence = reinforce(memory.confidence);
            memory.reinforcementCount += 1;
            memory.updatedAt = getTimestamp();
            this.isDirty = true;
        }
    }

    /**
     * Penalize a memory by ID (decreases confidence)
     */
    penalizeMemory(memoryId: string): void {
        const memory = this.findMemoryById(memoryId);
        if (memory) {
            memory.confidence = penalize(memory.confidence);
            memory.contradictionCount += 1;
            memory.updatedAt = getTimestamp();

            // Check if memory should be deactivated
            if (shouldDeactivate(memory.confidence)) {
                memory.isActive = false;
                logger.info(`Memory ${memoryId} deactivated due to low confidence`);
            }

            this.isDirty = true;
        }
    }

    /**
     * Apply decay to all memories based on time elapsed
     */
    applyDecayToAll(): void {
        const now = new Date();

        // Apply decay to all memory types
        const allMemories = [
            ...Object.values(this.data.vendorMemories),
            ...this.data.correctionMemories,
            ...this.data.resolutionMemories,
            ...this.data.duplicates,
        ];

        for (const memory of allMemories) {
            if (!memory.isActive) continue;

            const lastUpdated = new Date(memory.updatedAt);
            const newConfidence = applyDecay(memory.confidence, lastUpdated, now);

            if (newConfidence !== memory.confidence) {
                memory.confidence = newConfidence;
                this.isDirty = true;

                if (shouldDeactivate(newConfidence)) {
                    memory.isActive = false;
                    logger.debug(`Memory ${memory.id} deactivated due to decay`);
                }
            }
        }
    }

    /**
     * Find any memory by ID across all types
     */
    private findMemoryById(
        memoryId: string
    ): VendorMemory | CorrectionMemory | ResolutionMemory | DuplicateRecord | undefined {
        // Check vendors
        for (const vendor of Object.values(this.data.vendorMemories)) {
            if (vendor.id === memoryId) return vendor;
        }

        // Check corrections
        const correction = this.data.correctionMemories.find((c) => c.id === memoryId);
        if (correction) return correction;

        // Check resolutions
        const resolution = this.data.resolutionMemories.find((r) => r.id === memoryId);
        if (resolution) return resolution;

        // Check duplicates
        const duplicate = this.data.duplicates.find((d) => d.id === memoryId);
        if (duplicate) return duplicate;

        return undefined;
    }

    // ===========================================================================
    // Statistics
    // ===========================================================================

    /**
     * Update processing statistics
     */
    updateStats(params: {
        corrections?: number;
        humanReviewRequired?: boolean;
        confidence?: number;
    }): void {
        const stats = this.data.stats;

        stats.totalInvoicesProcessed += 1;

        if (params.corrections) {
            stats.totalCorrectionsApplied += params.corrections;
        }

        if (params.humanReviewRequired) {
            stats.totalHumanReviewsRequested += 1;
        }

        if (params.confidence !== undefined) {
            // Running average
            const n = stats.totalInvoicesProcessed;
            stats.averageConfidence =
                (stats.averageConfidence * (n - 1) + params.confidence) / n;
        }

        this.isDirty = true;
    }

    /**
     * Get store statistics
     */
    getStats(): MemoryStoreData['stats'] {
        return { ...this.data.stats };
    }

    /**
     * Save if there are pending changes
     */
    async saveIfDirty(): Promise<void> {
        if (this.isDirty) {
            await this.saveToDisk();
        }
    }
}
