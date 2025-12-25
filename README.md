# Invoice Memory System

A memory-driven learning layer for invoice automation built with TypeScript and Node.js.

## Overview

This system receives pre-extracted invoice data and uses persistent memory to:

- Learn vendor-specific patterns and corrections
- Apply previously learned corrections with confidence scoring
- Detect potential duplicates
- Provide reasoning for every decision
- Track an audit trail for complete traceability

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run the application
npm start

# Run in development mode (with ts-node)
npm run dev

# Run the demo
npm run demo
```

## Project Structure

```
invoice-memory-system/
├── src/
│   ├── index.ts              # Application entry point
│   ├── types/                # TypeScript interfaces
│   │   └── index.ts          # All type definitions
│   ├── memory/               # Memory persistence layer
│   │   ├── memory-manager.ts # High-level memory operations
│   │   ├── MemoryStore.ts    # Persistence class with CRUD
│   │   ├── confidence.ts     # Confidence scoring functions
│   │   └── index.ts
│   ├── core/                 # Decision engine logic
│   │   ├── pipeline.ts       # Main processInvoice() function
│   │   ├── audit.ts          # Audit trail helpers
│   │   ├── decision-engine.ts
│   │   ├── rules/            # Rule modules
│   │   │   ├── vendorRules.ts
│   │   │   └── correctionRules.ts
│   │   └── index.ts
│   ├── demo/                 # Demo runner scripts
│   │   └── demo-runner.ts
│   └── utils/                # Helper functions
│       ├── helpers.ts
│       └── index.ts
├── data/                     # Runtime data (gitignored)
│   └── .gitkeep
├── docs/                     # Documentation
│   ├── dev-log.md           # Development journal
│   └── architecture.md      # Architecture overview
├── package.json
├── tsconfig.json
└── README.md
```

## Processing Pipeline

Each invoice is processed through 4 phases:

```
InvoiceInput -> [RECALL] -> [APPLY] -> [DECIDE] -> [LEARN] -> InvoiceDecisionOutput
```

| Phase | Description |
|-------|-------------|
| **Recall** | Fetch vendor, correction, and duplicate memories |
| **Apply** | Normalize invoice, propose corrections based on memory |
| **Decide** | Calculate confidence, auto-accept or escalate to human |
| **Learn** | Generate memory updates (reinforce/create/penalize) |

## Vendor-Specific Rules

The system includes specialized rules for known vendors:

| Vendor | Rule | Implementation |
|--------|------|----------------|
| **Supplier GmbH** | Field mapping | `Leistungsdatum` -> `serviceDate` |
| **Supplier GmbH** | PO matching | Analyzes line items for product codes |
| **Parts AG** | VAT detection | Detects "MwSt. inkl.", "brutto", "Prices incl. VAT" |
| **Parts AG** | Tax recomputation | Extracts net amount from gross (19% DE, 20% UK) |
| **Parts AG** | Currency extraction | Parses rawText for EUR/USD/CHF/GBP |
| **Freight & Co** | Skonto detection | Extracts discount %, days from payment terms |
| **Freight & Co** | SKU mapping | "Seefracht"/"Shipping" -> SKU `FREIGHT` |

## Output Format

For each processed invoice, the system outputs:

```json
{
  "normalizedInvoice": { ... },
  "proposedCorrections": [ ... ],
  "requiresHumanReview": boolean,
  "reasoning": string,
  "confidenceScore": number,
  "memoryUpdates": [ ... ],
  "auditTrail": [
    { "step": "recall|apply|decide|learn", "timestamp": string, "details": string }
  ]
}
```

## Duplicate Detection

Prevents double-processing and learning from duplicate data:

- **Hash-based detection**: Vendor + Invoice Number + Month
- **Skip learning**: Duplicates don't reinforce or create memory
- **Confidence penalty**: 50% reduction for detected duplicates
- **Forces human review**: All duplicates require review

## Bad Memory Protection

Safeguards against incorrect or low-confidence memory:

| Threshold | Value | Effect |
|-----------|-------|--------|
| Auto-Apply | 85% | Corrections applied without human review |
| Human Review | 60% | Force escalation to human |
| Unreliable | 50% | Mark memory as questionable |
| Deactivation | 10% | Disable memory entirely |
| Hard Rejection | -35% | Penalty after 3+ rejections |

## Memory Types

1. **Vendor Memory** - Canonical names, field mappings, behaviors (VAT, currency, payment terms)
2. **Correction Memory** - Pattern-based corrections with signatures and conditions
3. **Resolution Memory** - Human decisions (approve/reject) for reinforcement learning
4. **Duplicate Records** - Hash-based duplicate detection with similarity scoring

## Confidence System

The memory system uses confidence scoring to determine when to auto-apply vs request human review:

| Function | Effect |
|----------|--------|
| `initialConfidence()` | New memories start at 0.3 |
| `reinforce()` | +0.15 with diminishing returns (max 0.95) |
| `penalize()` | -0.20 (min 0.0) |
| `applyDecay()` | Time-based decay after 7-day grace period |

Memories with confidence below 0.1 are automatically deactivated.

## Documentation

- [Development Log](./docs/dev-log.md) - Design decisions and progress
- [Architecture](./docs/architecture.md) - System architecture overview

## Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run the compiled application |
| `npm run dev` | Run with ts-node (development) |
| `npm run demo` | Run the demonstration script |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

## License

MIT
