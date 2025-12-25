/**
 * Demo Runner
 *
 * Script to demonstrate the Invoice Memory System functionality.
 * This file will be expanded with sample invoices and interactive demos.
 */

import { MemoryManager } from '../memory';
import { DecisionEngine } from '../core';
import { InvoiceInput } from '../types';
import { logger } from '../utils';

/**
 * Sample invoice data for demonstration
 */
const SAMPLE_INVOICES: InvoiceInput[] = [
    // TODO: Add sample invoice data for demonstration
    // These will be added in a future update
];

/**
 * Run the demonstration
 */
async function runDemo(): Promise<void> {
    logger.info('=== Invoice Memory System Demo ===');
    logger.info('');

    // Initialize memory manager
    const memoryManager = new MemoryManager();
    await memoryManager.load();
    logger.info('Memory manager initialized');

    // Initialize decision engine
    const decisionEngine = new DecisionEngine(memoryManager);
    logger.info('Decision engine initialized');

    // Check if we have sample invoices
    if (SAMPLE_INVOICES.length === 0) {
        logger.warn('No sample invoices configured. Add invoices to SAMPLE_INVOICES array.');
        logger.info('');
        logger.info('To add sample invoices, edit src/demo/demo-runner.ts');
        logger.info('Or create JSON files in data/samples/ and load them here.');
        return;
    }

    // Process each sample invoice
    for (const invoice of SAMPLE_INVOICES) {
        logger.info(`\nProcessing invoice: ${invoice.invoiceId}`);
        logger.info('-'.repeat(50));

        try {
            const result = await decisionEngine.processInvoice(invoice);

            logger.info(`Confidence Score: ${(result.confidenceScore * 100).toFixed(1)}%`);
            logger.info(`Requires Human Review: ${result.requiresHumanReview}`);
            logger.info(`Reasoning: ${result.reasoning}`);
            logger.info(`Corrections Applied: ${result.proposedCorrections.filter((c) => c.autoApplied).length}`);
            logger.info(`Corrections Pending: ${result.proposedCorrections.filter((c) => !c.autoApplied).length}`);

            // Log audit trail
            logger.info('\nAudit Trail:');
            for (const entry of result.auditTrail) {
                logger.info(`  [${entry.step}] ${entry.details}`);
            }
        } catch (error) {
            logger.error(`Failed to process invoice ${invoice.invoiceId}`, error);
        }
    }

    // Save any memory updates
    await memoryManager.save();
    logger.info('\nMemory saved. Demo complete.');
}

// Run the demo if executed directly
runDemo().catch((error) => {
    logger.error('Demo failed', error);
    process.exit(1);
});
