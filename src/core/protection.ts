/**
 * Bad Memory Protection Module
 *
 * Safeguards against incorrect or low-confidence memory dominating decisions.
 */

import { CorrectionMemory, VendorMemory } from '../types';
import { MemoryStore } from '../memory';
import {
    CONFIDENCE_THRESHOLDS,
    CONFIDENCE_DELTAS,
    BAD_MEMORY_PROTECTION,
} from '../config';

/**
 * Result of memory quality check
 */
export interface MemoryQualityResult {
    /** Whether the memory is reliable enough to use */
    isReliable: boolean;

    /** Whether the memory can be auto-applied */
    canAutoApply: boolean;

    /** Whether the memory should be deactivated */
    shouldDeactivate: boolean;

    /** Reason for the quality assessment */
    reason: string;

    /** Adjusted confidence after quality check */
    adjustedConfidence: number;
}

/**
 * Check memory quality and determine if it should be used
 */
export function checkMemoryQuality(
    memory: VendorMemory | CorrectionMemory
): MemoryQualityResult {
    let adjustedConfidence = memory.confidence;
    const reasons: string[] = [];

    // Check base confidence threshold
    if (memory.confidence < CONFIDENCE_THRESHOLDS.UNRELIABLE_THRESHOLD) {
        reasons.push(`Confidence ${(memory.confidence * 100).toFixed(0)}% below reliability threshold`);
    }

    // Check contradiction ratio
    const contradictionRatio =
        memory.contradictionCount / (memory.reinforcementCount + memory.contradictionCount || 1);

    if (contradictionRatio > BAD_MEMORY_PROTECTION.CONTRADICTION_RATIO_THRESHOLD) {
        adjustedConfidence *= 1 - contradictionRatio;
        reasons.push(`High contradiction ratio (${(contradictionRatio * 100).toFixed(0)}%)`);
    }

    // Ensure confidence is within bounds
    adjustedConfidence = Math.max(adjustedConfidence, CONFIDENCE_DELTAS.MIN_CONFIDENCE);
    adjustedConfidence = Math.min(adjustedConfidence, CONFIDENCE_DELTAS.MAX_CONFIDENCE);

    // Determine reliability
    const isReliable = adjustedConfidence >= CONFIDENCE_THRESHOLDS.UNRELIABLE_THRESHOLD;
    const canAutoApply = adjustedConfidence >= CONFIDENCE_THRESHOLDS.AUTO_APPLY_THRESHOLD;
    const shouldDeactivate = adjustedConfidence < CONFIDENCE_THRESHOLDS.DEACTIVATION_THRESHOLD;

    return {
        isReliable,
        canAutoApply,
        shouldDeactivate,
        reason: reasons.length > 0 ? reasons.join('; ') : 'Memory is reliable',
        adjustedConfidence,
    };
}

/**
 * Apply protection to a set of proposed corrections
 */
export function applyBadMemoryProtection(
    corrections: Array<{ memoryId?: string; confidence: number; autoApplied: boolean }>
): Array<{ memoryId?: string; confidence: number; autoApplied: boolean; qualityIssue?: string }> {
    return corrections.map((correction) => {
        // Check if confidence is too low for auto-apply
        if (correction.confidence < CONFIDENCE_THRESHOLDS.AUTO_APPLY_THRESHOLD && correction.autoApplied) {
            return {
                ...correction,
                autoApplied: false,
                qualityIssue: `Confidence ${(correction.confidence * 100).toFixed(0)}% below auto-apply threshold`,
            };
        }

        // Check if confidence is unreliable
        if (correction.confidence < CONFIDENCE_THRESHOLDS.UNRELIABLE_THRESHOLD) {
            return {
                ...correction,
                autoApplied: false,
                qualityIssue: `Memory unreliable: confidence ${(correction.confidence * 100).toFixed(0)}%`,
            };
        }

        return correction;
    });
}

/**
 * Process human decision and apply appropriate penalties/reinforcements
 */
export function processHumanDecision(
    memoryStore: MemoryStore,
    memoryId: string,
    approved: boolean
): void {
    if (approved) {
        memoryStore.reinforceMemory(memoryId);
    } else {
        memoryStore.penalizeMemory(memoryId);
    }
}

/**
 * Check if an invoice should require human review based on confidence
 */
export function shouldRequireHumanReview(
    baseConfidence: number,
    usedMemoryConfidences: number[]
): { requiresReview: boolean; reasons: string[] } {
    const reasons: string[] = [];

    // Check base confidence
    if (baseConfidence < CONFIDENCE_THRESHOLDS.HUMAN_REVIEW_THRESHOLD) {
        reasons.push(`Overall confidence ${(baseConfidence * 100).toFixed(0)}% below threshold`);
    }

    // Check each used memory confidence
    for (const confidence of usedMemoryConfidences) {
        if (confidence < CONFIDENCE_THRESHOLDS.UNRELIABLE_THRESHOLD) {
            reasons.push(`Low confidence memory used: ${(confidence * 100).toFixed(0)}%`);
            break; // Only add one such reason
        }
    }

    return {
        requiresReview: reasons.length > 0,
        reasons,
    };
}

/**
 * Calculate adjusted confidence considering memory quality
 */
export function calculateAdjustedConfidence(
    baseConfidence: number,
    memories: Array<{ confidence: number; contradictionCount: number; reinforcementCount: number }>
): number {
    if (memories.length === 0) {
        return baseConfidence;
    }

    let totalWeight = 0;
    let weightedSum = 0;

    for (const memory of memories) {
        const contradictionRatio =
            memory.contradictionCount / (memory.reinforcementCount + memory.contradictionCount || 1);
        const adjustedConfidence = memory.confidence * (1 - contradictionRatio);
        const weight = memory.reinforcementCount + 1;

        weightedSum += adjustedConfidence * weight;
        totalWeight += weight;
    }

    const memoryAdjustment = totalWeight > 0 ? weightedSum / totalWeight : 1;
    return baseConfidence * memoryAdjustment;
}
