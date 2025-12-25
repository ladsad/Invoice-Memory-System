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
│   │   └── index.ts
│   ├── memory/               # Memory persistence layer
│   │   ├── memory-manager.ts
│   │   └── index.ts
│   ├── core/                 # Decision engine logic
│   │   ├── decision-engine.ts
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

## Memory Types

1. **Vendor Memory** - Canonical names, patterns, payment terms
2. **Correction Memory** - Field-level corrections with confidence
3. **Resolution Memory** - How ambiguities were resolved
4. **Duplicate Records** - Invoice hashes for duplicate detection

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
