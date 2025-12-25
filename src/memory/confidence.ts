/**
 * Confidence Module
 *
 * Functions for managing confidence scores in memory records.
 * Handles initial confidence, reinforcement, penalization, and decay.
 */

/**
 * Confidence configuration constants
 */
export const CONFIDENCE_CONFIG = {
    /** Initial confidence for new memories */
    INITIAL: 0.3,

    /** Maximum confidence value */
    MAX: 0.95,

    /** Minimum confidence value */
    MIN: 0.0,

    /** Amount to add when reinforcing */
    REINFORCE_DELTA: 0.15,

    /** Amount to subtract when penalizing */
    PENALIZE_DELTA: 0.2,

    /** Confidence threshold below which memory becomes inactive */
    DEACTIVATION_THRESHOLD: 0.1,

    /** Days of inactivity before decay starts */
    DECAY_GRACE_PERIOD_DAYS: 7,

    /** Decay rate per day after grace period (percentage of current confidence) */
    DECAY_RATE_PER_DAY: 0.02,
};

/**
 * Get the initial confidence score for a new memory
 */
export function initialConfidence(): number {
    return CONFIDENCE_CONFIG.INITIAL;
}

/**
 * Reinforce a confidence score (positive feedback)
 * Increases confidence with diminishing returns as it approaches max
 *
 * @param confidence Current confidence value (0-1)
 * @returns New confidence value, capped at MAX
 */
export function reinforce(confidence: number): number {
    // Apply reinforcement with diminishing returns
    // The closer to max, the smaller the increase
    const headroom = CONFIDENCE_CONFIG.MAX - confidence;
    const effectiveDelta = CONFIDENCE_CONFIG.REINFORCE_DELTA * (headroom / CONFIDENCE_CONFIG.MAX);

    const newConfidence = confidence + Math.max(effectiveDelta, 0.01);

    return Math.min(newConfidence, CONFIDENCE_CONFIG.MAX);
}

/**
 * Penalize a confidence score (negative feedback / contradiction)
 *
 * @param confidence Current confidence value (0-1)
 * @returns New confidence value, floored at MIN
 */
export function penalize(confidence: number): number {
    const newConfidence = confidence - CONFIDENCE_CONFIG.PENALIZE_DELTA;
    return Math.max(newConfidence, CONFIDENCE_CONFIG.MIN);
}

/**
 * Check if a confidence score is below the deactivation threshold
 *
 * @param confidence Current confidence value (0-1)
 * @returns True if memory should be deactivated
 */
export function shouldDeactivate(confidence: number): boolean {
    return confidence < CONFIDENCE_CONFIG.DEACTIVATION_THRESHOLD;
}

/**
 * Apply time-based decay to a confidence score
 *
 * Memories that haven't been reinforced recently should gradually lose confidence.
 * This prevents stale or incorrect learnings from dominating.
 *
 * @param confidence Current confidence value (0-1)
 * @param lastUpdated When the memory was last updated
 * @param now Current time
 * @returns Decayed confidence value
 */
export function applyDecay(confidence: number, lastUpdated: Date, now: Date): number {
    // Calculate days since last update
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / msPerDay;

    // No decay during grace period
    if (daysSinceUpdate <= CONFIDENCE_CONFIG.DECAY_GRACE_PERIOD_DAYS) {
        return confidence;
    }

    // Calculate effective decay days (excluding grace period)
    const effectiveDecayDays = daysSinceUpdate - CONFIDENCE_CONFIG.DECAY_GRACE_PERIOD_DAYS;

    // Apply exponential decay
    // newConfidence = confidence * (1 - decayRate) ^ effectiveDecayDays
    const decayFactor = Math.pow(1 - CONFIDENCE_CONFIG.DECAY_RATE_PER_DAY, effectiveDecayDays);
    const decayedConfidence = confidence * decayFactor;

    return Math.max(decayedConfidence, CONFIDENCE_CONFIG.MIN);
}

/**
 * Calculate a weighted confidence score based on reinforcement vs contradiction ratio
 *
 * @param baseConfidence The base confidence value
 * @param reinforcementCount Number of times memory was reinforced
 * @param contradictionCount Number of times memory was contradicted
 * @returns Adjusted confidence value
 */
export function calculateWeightedConfidence(
    baseConfidence: number,
    reinforcementCount: number,
    contradictionCount: number
): number {
    const totalInteractions = reinforcementCount + contradictionCount;

    if (totalInteractions === 0) {
        return baseConfidence;
    }

    // Calculate the ratio of reinforcements to total interactions
    const reinforcementRatio = reinforcementCount / totalInteractions;

    // Weight the base confidence by the reinforcement ratio
    // High reinforcement ratio -> confidence maintained or increased
    // Low reinforcement ratio -> confidence decreased
    const weightedConfidence = baseConfidence * (0.5 + reinforcementRatio * 0.5);

    return Math.min(Math.max(weightedConfidence, CONFIDENCE_CONFIG.MIN), CONFIDENCE_CONFIG.MAX);
}
