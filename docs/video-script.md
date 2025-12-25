# Invoice Memory System - Demo Video Script (3 Minutes)

## INTRO (0:00 - 0:20)
**[Screen: README.md or Title Slide]**

> "Hi, I'm demonstrating the Invoice Memory System - a memory-driven learning layer for invoice automation.
>
> The problem: Companies process hundreds of invoices daily, but corrections are wasted - the system doesn't learn.
>
> My solution: A memory layer that stores insights, applies them to future invoices, and improves automation over time."

---

## ARCHITECTURE OVERVIEW (0:20 - 0:40)
**[Screen: architecture.md diagram or code structure]**

> "The system has four stages:
> 1. **Recall** - Fetch relevant memories for the vendor
> 2. **Apply** - Normalize fields, suggest corrections
> 3. **Decide** - Auto-accept or escalate based on confidence
> 4. **Learn** - Store new insights with an audit trail
>
> I've implemented three memory types: Vendor Memory, Correction Memory, and Resolution Memory."

---

## DEMO PART 1: BEFORE LEARNING (0:40 - 1:20)
**[Screen: Terminal running `npm run demo`]**

> "Let's run the demo. First, I process Invoice #1 from Supplier GmbH.
>
> **[Point to output]**
> Notice: `requiresHumanReview: YES`, confidence is only 62%.
> The system doesn't know how to handle 'Leistungsdatum' yet.
>
> Now I simulate a human correction - mapping 'Leistungsdatum' to 'serviceDate'.
> **[Point to 'Applying Human Corrections' in output]**
> The system learns this pattern."

---

## DEMO PART 2: AFTER LEARNING (1:20 - 1:50)
**[Screen: Terminal showing Invoice #2 processing]**

> "Now I process Invoice #2 from the same vendor.
>
> **[Point to output]**
> Look: The system **automatically** applies the Leistungsdatum mapping!
> Confidence has increased, and fewer flags are raised.
>
> This is the learning loop in action - one-shot learning from human feedback."

---

## ADDITIONAL SCENARIOS (1:50 - 2:20)
**[Screen: Terminal showing Parts AG and Freight scenarios]**

> "The demo also covers:
> - **Parts AG**: Detecting 'VAT included' and recomputing tax with clear reasoning
> - **Freight & Co**: Mapping 'Seefracht' to SKU 'FREIGHT' with increasing confidence
> - **Duplicate Detection**: Flagging duplicate invoices and skipping learning to prevent bad data"

---

## OUTPUT CONTRACT & AUDIT TRAIL (2:20 - 2:40)
**[Screen: JSON output or code showing auditTrail]**

> "Every decision produces a complete audit trail:
> - `normalizedInvoice`, `proposedCorrections`, `confidenceScore`
> - Step-by-step reasoning for why decisions were made
> - Memory updates that will be persisted for future invoices
>
> This makes the system fully explainable and auditable."

---

## CONCLUSION (2:40 - 3:00)
**[Screen: README or GitHub page]**

> "In summary:
> - The system **learns** from human corrections
> - It **protects** against bad memories with confidence thresholds
> - It **explains** every decision with a detailed audit trail
>
> The code is on GitHub with full documentation. Thank you for watching!"

---

## RECORDING TIPS

1. **Screen Setup**: Have VS Code open with the project, terminal ready to run `npm run demo`
2. **Font Size**: Increase terminal font to at least 16pt for visibility
3. **Pace**: Speak slowly and clearly, pause briefly between sections
4. **Highlight**: Use your mouse to point at key output values as you explain
5. **Practice**: Run through the script once before recording to ensure smooth flow
