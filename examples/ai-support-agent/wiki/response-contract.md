# Response contract

Owner: Support platform team.

[[Answer generation]], [[Answer checks]], and Customer reply link this shared page. Each component uses the same meaning for a proposed answer and its sources.

| Field | Meaning |
| --- | --- |
| question | The customer's original words |
| answer | Proposed customer-facing text |
| citations | Source IDs and the claims they support |
| outcome | ready or needs_review |
| reason | Explanation when review is required |

## Example

```json
{
  "question": "How do I export my workspace?",
  "answer": "Open Workspace settings, choose Export, then Download JSON.",
  "citations": [
    { "source_id": "exports-01", "claim": "workspace export steps" }
  ],
  "outcome": "ready",
  "reason": ""
}
```

These are illustrative fields for the fictional support system, not Merfolk's import schema. The reimportable demo uses Merfolk's version 3 diagram format.

[[Retrieval design]] supplies the evidence. [[Human handoff]] keeps the same evidence attached when a specialist must review the request.
