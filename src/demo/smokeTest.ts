/**
 * Smoke Test
 *
 * Simple script to validate the core pipeline with a single invoice.
 * Usage: npm run smoke
 */


import * as path from 'path';
import { processInvoice } from '../core/pipeline';
import { MemoryStore } from '../memory/MemoryStore';
import { InvoiceInput } from '../types';

async function runSmokeTest() {
    const memoryStore = new MemoryStore(path.join(process.cwd(), 'data', 'memory.json'));
    await memoryStore.loadFromDisk();

    const invoice: InvoiceInput = {
        invoiceId: "SMOKE-001",
        vendor: { name: "Smoke Test Vendor" },
        invoiceNumber: "ST-100",
        invoiceDate: "2024-01-01",
        totalAmount: 100.0,
        currency: "USD",
        lineItems: [],
        metadata: {},
        rawText: "Smoke test invoice"
    };

    console.log("Processing smoke test invoice...");
    const result = await processInvoice(invoice, memoryStore);

    console.log("\nResult:");
    console.log(JSON.stringify(result, null, 2));
}

runSmokeTest().catch(console.error);
