/**
 * Audit Trail Module
 *
 * Helpers for creating and persisting audit trail entries.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AuditTrailEntry } from '../types';
import { getTimestamp, logger } from '../utils';

/**
 * Default path for audit log
 */
const DEFAULT_AUDIT_LOG_PATH = path.join(process.cwd(), 'data', 'audit-log.jsonl');

/**
 * Audit step types
 */
export type AuditStep = 'recall' | 'apply' | 'decide' | 'learn';

/**
 * Create an audit trail entry
 */
export function createAuditEntry(step: AuditStep, details: string): AuditTrailEntry {
    return {
        step,
        timestamp: getTimestamp(),
        details,
    };
}

/**
 * Create a series of audit entries for a phase
 */
export function createPhaseAuditEntries(
    step: AuditStep,
    startMessage: string,
    endMessage: string,
    details: string[]
): AuditTrailEntry[] {
    const entries: AuditTrailEntry[] = [createAuditEntry(step, startMessage)];

    for (const detail of details) {
        entries.push(createAuditEntry(step, detail));
    }

    entries.push(createAuditEntry(step, endMessage));
    return entries;
}

/**
 * Audit log entry for persistence
 */
export interface AuditLogRecord {
    invoiceId: string;
    processedAt: string;
    entries: AuditTrailEntry[];
    summary: {
        totalSteps: number;
        requiresHumanReview: boolean;
        confidenceScore: number;
    };
}

/**
 * Append audit entries to the audit log file (JSONL format)
 */
export function appendToAuditLog(
    invoiceId: string,
    entries: AuditTrailEntry[],
    requiresHumanReview: boolean,
    confidenceScore: number,
    auditLogPath?: string
): void {
    const logPath = auditLogPath || DEFAULT_AUDIT_LOG_PATH;

    try {
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const record: AuditLogRecord = {
            invoiceId,
            processedAt: getTimestamp(),
            entries,
            summary: {
                totalSteps: entries.length,
                requiresHumanReview,
                confidenceScore,
            },
        };

        fs.appendFileSync(logPath, JSON.stringify(record) + '\n', 'utf-8');
        logger.debug(`Audit log entry written for invoice ${invoiceId}`);
    } catch (error) {
        logger.error('Failed to write audit log', error);
    }
}

/**
 * Build a reasoning string from audit entries
 */
export function buildReasoningFromAudit(
    entries: AuditTrailEntry[],
    requiresHumanReview: boolean
): string {
    const recallEntries = entries.filter((e) => e.step === 'recall');
    const applyEntries = entries.filter((e) => e.step === 'apply');
    const decideEntries = entries.filter((e) => e.step === 'decide');

    const parts: string[] = [];

    // Summarize recall phase
    if (recallEntries.length > 0) {
        const lastRecall = recallEntries[recallEntries.length - 1];
        parts.push(`Recall: ${lastRecall.details}`);
    }

    // Summarize apply phase
    if (applyEntries.length > 0) {
        const corrections = applyEntries.filter((e) => e.details.includes('correction'));
        if (corrections.length > 0) {
            parts.push(`Applied ${corrections.length} memory-based correction(s)`);
        }
    }

    // Summarize decision
    if (decideEntries.length > 0) {
        const lastDecide = decideEntries[decideEntries.length - 1];
        parts.push(`Decision: ${lastDecide.details}`);
    }

    // Final status
    if (requiresHumanReview) {
        parts.push('Status: Requires human review');
    } else {
        parts.push('Status: Auto-processed successfully');
    }

    return parts.join('. ');
}
