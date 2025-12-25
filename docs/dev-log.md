# Development Log

This document captures the development journey of the Invoice Memory System, including design decisions, problems encountered, solutions implemented, and trade-offs made.

---

## Session 1: Project Setup

**Date:** 2025-12-25

### What Was Done

1. **Project Initialization**
   - Created Node.js project with `package.json`
   - Configured TypeScript with strict mode enabled
   - Set up ESLint and Prettier for code quality
   - Created npm scripts: `build`, `start`, `dev`, `demo`

2. **Folder Structure**
   - Established clear separation of concerns:
     - `src/types/` - TypeScript interfaces
     - `src/memory/` - Persistence and memory management
     - `src/core/` - Decision engine logic
     - `src/demo/` - Demo runner scripts
     - `src/utils/` - Helper functions
   - Created `data/` for runtime persistence
   - Created `docs/` for documentation

3. **TypeScript Interfaces**
   - Defined comprehensive types for:
     - Invoice input/output structures
     - Four memory record types (Vendor, Correction, Resolution, Duplicate)
     - Decision output with audit trail
     - Configuration options

4. **Core Components (Skeleton)**
   - `MemoryManager` class with CRUD operations for all memory types
   - `DecisionEngine` class with recall-apply-decide-learn pipeline
   - Utility helpers for timestamps, IDs, hashing, and string similarity

### Assumptions Made

1. **File-Based Persistence**: Starting with JSON files for simplicity. SQLite migration can be done later if needed.

2. **Confidence Thresholds**: Used reasonable defaults:
   - Human review threshold: 0.6 (60%)
   - Auto-apply threshold: 0.85 (85%)
   
3. **Memory Decay**: Implementing time-based decay to prevent stale learnings from dominating, but specific rates will need tuning.

4. **No ML Required**: Following the spec, using heuristic-based approaches for pattern matching and confidence scoring.

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Class-based architecture | Clear encapsulation, easier to test and extend |
| Separate memory types | Each type has distinct behavior and query patterns |
| Audit trail in output | Complete traceability for every decision |
| Schema versioning | Enables future migration of persisted data |

### Next Steps

- [ ] Implement full memory reinforcement/decay logic
- [ ] Add sample invoice data for demos
- [ ] Build out field-level correction matching
- [ ] Add duplicate detection with similarity scoring

---

## Session 2: Memory Model and Persistence

**Date:** 2025-12-25

### What Was Done

1. **Confidence Module** (`src/memory/confidence.ts`)
   - `initialConfidence()`: Returns 0.3 for new memories
   - `reinforce()`: +0.15 with diminishing returns, capped at 0.95
   - `penalize()`: -0.20, floored at 0.0
   - `applyDecay()`: Time-based decay after 7-day grace period
   - `shouldDeactivate()`: Check if confidence below 0.1 threshold
   - `calculateWeightedConfidence()`: Adjusts based on reinforcement/contradiction ratio

2. **MemoryStore Class** (`src/memory/MemoryStore.ts`)
   - `loadFromDisk()` / `saveToDisk()`: JSON file persistence
   - `getVendorMemory()` / `updateVendorMemory()`: Vendor CRUD with field mappings
   - `recordCorrection()`: Pattern-based correction storage
   - `recordResolution()`: Human decision tracking
   - `recordDuplicate()`: Hash-based duplicate detection
   - `reinforceMemory()` / `penalizeMemory()`: Confidence management
   - `applyDecayToAll()`: Batch decay application

3. **Enhanced Type Definitions**
   - `FieldMapping`: Vendor-specific field translations (e.g., "Leistungsdatum" -> "serviceDate")
   - `VendorBehavior`: VAT settings, currency, payment terms, quantity mismatch strategies
   - `CorrectionPattern`: Pattern signature with type, signature, and condition
   - `HumanDecision`: Tracks approve/reject actions with timestamps
   - `MemoryStoreData`: New storage structure for MemoryStore class

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| File-based JSON persistence | Simple to debug, human-readable, sufficient for MVP. SQLite can be added later. |
| Confidence with diminishing returns | Prevents memories from becoming "too confident" too quickly |
| 7-day decay grace period | Recent learnings shouldn't decay immediately |
| Pattern signatures | Enables matching similar corrections without exact value matching |
| Separate MemoryStore class | Cleaner separation from MemoryManager (which handles higher-level logic) |

### Problems Encountered

1. **Type Conflicts**: The original `MemoryStore` interface conflicted with the new `MemoryStore` class name.
   - **Solution**: Renamed data interface to `MemoryStoreData`, kept class as `MemoryStore`.

2. **Gitignore Issue**: `docs/` was accidentally in `.gitignore`, blocking access.
   - **Solution**: Removed the erroneous entry.

3. **Circular Confidence**: Needed to prevent bad learnings from being reinforced indefinitely.
   - **Solution**: Added `shouldDeactivate()` check and contradiction tracking.

### Trade-offs

- **Memory vs Performance**: Storing all memories in a single JSON file is simple but won't scale beyond ~10k records. SQLite migration planned.
- **Decay Simplicity**: Using linear decay after grace period. Could use exponential decay for more realistic forgetting curve.

### Next Steps

- [x] Implement the recall/apply/decide/learn pipeline
- [ ] Add sample invoice data for testing
- [ ] Add CLI demo runner
- [ ] Implement vendor-specific rules

---

## Session 3: Pipeline and Audit Trail

**Date:** 2025-12-25

### What Was Done

1. **Pipeline Module** (`src/core/pipeline.ts`)
   - `processInvoice()`: Main orchestrator function
   - `recallMemories()`: Fetches vendor, correction, and duplicate memories
   - `applyMemories()`: Applies vendor normalization and corrections
   - `decideActions()`: Determines auto-accept vs escalate
   - `learnFromOutcome()`: Generates memory updates

2. **Audit Module** (`src/core/audit.ts`)
   - `createAuditEntry()`: Creates timestamped entries
   - `appendToAuditLog()`: Writes to `data/audit-log.jsonl`
   - `buildReasoningFromAudit()`: Composes human-readable reasoning

3. **Rule Stubs**
   - `src/core/rules/vendorRules.ts`: `applyVendorMemories()` for vendor normalization
   - `src/core/rules/correctionRules.ts`: `applyCorrectionMemories()` for pattern-based corrections

### Pipeline Flow

```
InvoiceInput
    |
    v
[1. RECALL] -> Fetch vendor/correction/duplicate memories
    |
    v
[2. APPLY] -> Apply vendor normalization, pattern corrections
    |
    v
[3. DECIDE] -> Calculate confidence, determine auto/escalate
    |
    v
[4. LEARN] -> Generate memory updates (reinforce/create)
    |
    v
InvoiceDecisionOutput (with auditTrail)
```

### Audit Trail Structure

Each processing generates entries like:
```json
{
  "step": "recall|apply|decide|learn",
  "timestamp": "ISO8601",
  "details": "Human-readable description"
}
```

### Confidence Calculation

- Weighted average: 60% vendor confidence + 40% correction confidence
- Penalties: Duplicate detected (-30% to -70%), pending corrections (escalate)
- Threshold: Below 60% triggers human review

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate rule modules | Allows vendor and correction logic to evolve independently |
| Audit trail in output | Complete traceability for debugging and compliance |
| JSONL audit log | Append-only, easy to parse, no locking issues |
| Weighted confidence | Vendor memory more reliable than correction patterns |

### Next Steps

- [ ] Add sample invoice data for testing
- [ ] Implement CLI demo runner
- [ ] Add vendor-specific field mapping rules
- [ ] Implement tax recomputation logic
