/**
 * Invoice Memory System
 *
 * A memory-driven learning layer for invoice automation.
 * Entry point for the application.
 */

import { MemoryManager } from './memory';
import { DecisionEngine } from './core';
import { logger } from './utils';

/**
 * Main entry point
 */
async function main(): Promise<void> {
    logger.info('Invoice Memory System starting...');

    // Initialize memory manager
    const memoryManager = new MemoryManager();
    await memoryManager.load();

    // Initialize decision engine
    const decisionEngine = new DecisionEngine(memoryManager);

    // Log system status
    const store = memoryManager.getStore();
    logger.info('System initialized successfully');
    logger.info(`Memory store version: ${store.schemaVersion}`);
    logger.info(`Vendors in memory: ${Object.keys(store.vendors).length}`);
    logger.info(`Total invoices processed: ${store.stats.totalInvoicesProcessed}`);
    logger.info(`Average confidence: ${(store.stats.averageConfidence * 100).toFixed(1)}%`);
    logger.info(`Decision engine ready: ${decisionEngine ? 'yes' : 'no'}`);

    // Export for external use if needed
    return;
}

// Run main function
main().catch((error) => {
    logger.error('Application failed to start', error);
    process.exit(1);
});

// Export modules for external use
export { MemoryManager } from './memory';
export { DecisionEngine } from './core';
export * from './types';
export * from './utils';
