/**
 * Configuration Module
 *
 * Central configuration for thresholds and system parameters.
 */

/**
 * Confidence thresholds
 */
export const CONFIDENCE_THRESHOLDS = {
    /** Minimum confidence to auto-apply a correction without human review */
    AUTO_APPLY_THRESHOLD: 0.85,

    /** Minimum confidence to even suggest a correction */
    SUGGESTION_THRESHOLD: 0.3,

    /** Below this confidence, memory is considered unreliable */
    UNRELIABLE_THRESHOLD: 0.5,

    /** Below this confidence, memory should be deactivated */
    DEACTIVATION_THRESHOLD: 0.1,

    /** Confidence threshold to escalate to human review */
    HUMAN_REVIEW_THRESHOLD: 0.6,
};

/**
 * Penalty and reinforcement values
 */
export const CONFIDENCE_DELTAS = {
    /** Base confidence for new memories */
    INITIAL_CONFIDENCE: 0.3,

    /** Confidence increase on reinforcement */
    REINFORCEMENT_DELTA: 0.15,

    /** Confidence decrease on normal penalty */
    PENALTY_DELTA: 0.2,

    /** Confidence decrease for hard rejection (repeated failures) */
    HARD_REJECTION_PENALTY: 0.35,

    /** Maximum confidence achievable */
    MAX_CONFIDENCE: 0.95,

    /** Minimum confidence floor */
    MIN_CONFIDENCE: 0.0,
};

/**
 * Duplicate detection parameters
 */
export const DUPLICATE_DETECTION = {
    /** Maximum days difference to consider potential duplicate */
    DATE_WINDOW_DAYS: 7,

    /** Amount tolerance percentage (0.02 = 2%) */
    AMOUNT_TOLERANCE_PERCENT: 0.02,

    /** Minimum similarity score to flag as duplicate */
    SIMILARITY_THRESHOLD: 0.8,

    /** Confidence reduction for duplicate invoices */
    DUPLICATE_CONFIDENCE_PENALTY: 0.5,
};

/**
 * Bad memory protection parameters
 */
export const BAD_MEMORY_PROTECTION = {
    /** Number of rejections before hard penalty */
    REJECTION_COUNT_THRESHOLD: 3,

    /** Contradiction ratio to trigger deactivation */
    CONTRADICTION_RATIO_THRESHOLD: 0.4,

    /** Number of days before applying decay */
    DECAY_GRACE_PERIOD_DAYS: 7,

    /** Daily decay rate after grace period */
    DECAY_RATE_PER_DAY: 0.02,
};

/**
 * Processing options
 */
export const PROCESSING = {
    /** Whether to skip learning for duplicate invoices */
    SKIP_LEARNING_FOR_DUPLICATES: true,

    /** Whether to require human review for low-confidence corrections */
    REQUIRE_REVIEW_FOR_LOW_CONFIDENCE: true,

    /** Whether to auto-deactivate memories below threshold */
    AUTO_DEACTIVATE_BAD_MEMORIES: true,
};

/**
 * Get all configuration as a single object
 */
export function getConfig() {
    return {
        confidenceThresholds: CONFIDENCE_THRESHOLDS,
        confidenceDeltas: CONFIDENCE_DELTAS,
        duplicateDetection: DUPLICATE_DETECTION,
        badMemoryProtection: BAD_MEMORY_PROTECTION,
        processing: PROCESSING,
    };
}

/**
 * Type for configuration override
 */
export type ConfigOverride = Partial<ReturnType<typeof getConfig>>;
