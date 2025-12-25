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

- [x] Add vendor-specific field mapping rules
- [x] Implement tax recomputation logic
- [ ] Add sample invoice data for testing
- [ ] Implement CLI demo runner

---

## Session 4: Vendor and Correction Rules

**Date:** 2025-12-25

### What Was Done

1. **Enhanced Type Definitions**
   - Added `serviceDate`, `rawText`, `paymentTerms` to `InvoiceInput`
   - Added `serviceDate`, `netAmount`, `taxAmount`, `taxRate`, `paymentTerms` to `NormalizedInvoice`

2. **Vendor Rules** (`src/core/rules/vendorRules.ts`)
   - **Supplier GmbH**:
     - Field mapping: "Leistungsdatum" -> `serviceDate`
     - PO matching suggestions based on line item analysis
   - **Parts AG**:
     - VAT included detection ("MwSt. inkl.", "Prices incl. VAT")
     - Tax recomputation with net/gross separation
     - Currency extraction from rawText
   - **Freight & Co**:
     - Skonto term detection (e.g., "2% Skonto within 14 days")
     - SKU mapping: "Seefracht"/"Shipping" -> FREIGHT

3. **Correction Rules** (`src/core/rules/correctionRules.ts`)
   - Heuristic corrections (currency, date format, SKU suggestions)
   - Pattern-based memory matching
   - Resolution memory integration (`recordHumanDecision()`)

### Vendor-Specific Rules Summary

| Vendor | Rule | Implementation |
|--------|------|----------------|
| Supplier GmbH | Leistungsdatum mapping | Extracts from metadata, maps to serviceDate |
| Supplier GmbH | PO matching | Analyzes line items for product codes |
| Parts AG | VAT detection | Regex patterns for "inkl.", "brutto", etc. |
| Parts AG | Currency extraction | Parses rawText for EUR/USD/CHF/GBP |
| Freight & Co | Skonto detection | Extracts discount %, days from text |
| Freight & Co | FREIGHT SKU | Maps shipping descriptions to SKU |

### Problems Encountered

1. **Type Extensions**: Needed additional fields (`rawText`, `serviceDate`) in InvoiceInput.
   - **Solution**: Extended types with optional fields for backward compatibility.

2. **VAT Rate Ambiguity**: Different regions use different VAT rates (19%, 20%, etc.).
   - **Solution**: Default to 19% for German patterns, 20% for UK patterns.

3. **Currency Extraction Accuracy**: Multiple currencies might appear in rawText.
   - **Solution**: Use first match, boost confidence if vendor memory confirms.

### Edge Cases

- Invoices without rawText rely solely on memory/metadata
- Date format normalization handles DD.MM.YYYY and DD/MM/YYYY
- Skonto detection requires structured text patterns

### Next Steps

- [x] Implement demo runner
- [ ] Add unit tests for rule modules
- [ ] Create CLI interface for single invoice processing

---

## Session 6: Demo Runner & Scenarios

**Date:** 2025-12-25

### What Was Done

1.  **Demo Runner Implementation** (`src/demo/demoRunner.ts`):
    -   Created a script to simulate learning over time.
    -   Implemented 4 scenarios:
        1.  **Supplier GmbH**: Initial low confidence -> Human correction (field mapping) -> Learning -> Auto-apply on next invoice.
        2.  **Parts AG**: Missing VAT/Currency -> Human correction -> Learned via reinforcement.
        3.  **Freight & Co**: SKU mapping ("Seefracht" -> "FREIGHT") -> Learned from corrections.
        4.  **Duplicates**: Verified hash-based duplicate detection logic.

2.  **Sample Data Integration**:
    -   Successfully loaded `invoices/` JSON files for the demo.
    -   Simulated "human-in-the-loop" feedback by applying canned corrections.

3.  **End-to-End Verification**:
    -   Verified that `requiresHumanReview` flags behaves correctly (True initially, False after learning).
    -   Confirmed confidence scores increase with learning.
    -   Confirmed duplicate detection works as expected.

### Key Observation: Learning Loop
The demo clearly shows the system's ability to "one-shot learn" simple mappings. For example, once `Leistungsdatum` is mapped to `serviceDate` for Supplier GmbH, the next invoice (INV-A-003) automatically applies this mapping with high confidence.

### Next Steps

- [ ] Add unit tests for individual rule modules to ensure robustness.
- [ ] Refine the CLI for file-based processing.


**Date:** 2025-12-25

### What Was Done

1. **Configuration Module** (`src/config.ts`)
   - `CONFIDENCE_THRESHOLDS`: AUTO_APPLY (0.85), HUMAN_REVIEW (0.6), UNRELIABLE (0.5), DEACTIVATION (0.1)
   - `CONFIDENCE_DELTAS`: INITIAL (0.3), REINFORCEMENT (+0.15), PENALTY (-0.2), HARD_REJECTION (-0.35)
   - `DUPLICATE_DETECTION`: DATE_WINDOW (7 days), AMOUNT_TOLERANCE (2%), CONFIDENCE_PENALTY (50%)
   - `BAD_MEMORY_PROTECTION`: REJECTION_COUNT (3), CONTRADICTION_RATIO (40%)

2. **Duplicate Detection** (`src/core/duplicates.ts`)
   - `checkForDuplicate()`: Hash-based duplicate lookup
   - `generateDuplicateHash()`: Vendor + invoice number + month
   - `recordDuplicate()`: Store for future detection
   - `recordInvoiceForDuplicateDetection()`: Track processed invoices

3. **Bad Memory Protection** (`src/core/protection.ts`)
   - `checkMemoryQuality()`: Assess reliability based on confidence and contradictions
   - `applyBadMemoryProtection()`: Block auto-apply for low-confidence corrections
   - `processHumanDecision()`: Apply reinforcement/penalty
   - `shouldRequireHumanReview()`: Force review for unreliable memories
   - `calculateAdjustedConfidence()`: Weight by reinforcement count

4. **Pipeline Integration** (`src/core/pipeline.ts`)
   - Duplicate check after recall, before apply
   - Skip learning for duplicates
   - Apply confidence penalty for duplicates
   - Force human review for duplicates

### Duplicate Detection Flow

```
Invoice -> Generate Hash -> Lookup in Memory
              |                    |
              v                    v
         [Not Found]          [Found Match]
              |                    |
              v                    v
         Continue           Skip Learning
         Processing         Flag for Review
```

### Thresholds Summary

| Threshold | Value | Purpose |
|-----------|-------|---------|
| Auto-Apply | 85% | Corrections applied without review |
| Human Review | 60% | Force escalation |
| Unreliable | 50% | Mark memory as questionable |
| Deactivation | 10% | Disable memory entirely |
| Hard Rejection Penalty | -35% | Applied after 3+ rejections |

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Hash-based detection | Fast O(1) lookup for exact matches |
| Skip learning on duplicate | Prevent reinforcing from same data |
| Config-based thresholds | Easy tuning without code changes |
| Contradiction ratio | Tracks disagreement between sources |

### Next Steps

- [ ] Add sample invoice data for testing
- [ ] Create CLI demo runner with test scenarios
- [ ] Add unit tests for rule modules
