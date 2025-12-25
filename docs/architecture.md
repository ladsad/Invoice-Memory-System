# Invoice Memory System - Architecture

This document describes the high-level architecture of the Invoice Memory System.

---

## Overview

The Invoice Memory System is a memory-driven learning layer for invoice automation. It receives pre-extracted invoice data and uses persistent memory to learn vendor-specific patterns and apply corrections.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Invoice Input                             │
│                   (Pre-extracted JSON data)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Decision Engine                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Recall  │─▶│  Apply   │─▶│  Decide  │─▶│  Learn   │        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Memory Store   │  │  Audit Trail    │  │  Decision Output│
│  (Persistent)   │  │  (JSONL Log)    │  │  (JSON Response)│
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## Core Components

### 1. Decision Engine (`src/core/decision-engine.ts`)

The central processing unit that orchestrates invoice processing through four stages:

| Stage | Purpose |
|-------|---------|
| **Recall** | Retrieve relevant memories (vendor patterns, corrections, duplicates) |
| **Apply** | Generate proposed corrections based on recalled memories |
| **Decide** | Determine confidence score and whether human review is needed |
| **Learn** | Generate memory updates for persistence |

### 2. Memory Manager (`src/memory/memory-manager.ts`)

Handles persistence and retrieval of four memory types:

- **Vendor Memory**: Canonical names, name variations, typical patterns
- **Correction Memory**: Field-level corrections with confidence
- **Resolution Memory**: How ambiguities were previously resolved
- **Duplicate Records**: Invoice hashes for duplicate detection

### 3. Types (`src/types/index.ts`)

Comprehensive TypeScript interfaces ensuring type safety across:

- Invoice input/output structures
- Memory record schemas
- Configuration options
- Audit trail entries

---

## Data Flow

TODO: Add detailed data flow diagram

---

## Memory Lifecycle

TODO: Document memory reinforcement and decay mechanics

---

## Configuration

TODO: Document configuration options and defaults

---

## Persistence Strategy

TODO: Document file-based persistence and future SQLite migration path
