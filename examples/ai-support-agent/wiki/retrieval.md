# Retrieval design

Owner: Knowledge team.

Retrieval turns the customer's words into ranked, attributable evidence. It keeps exact product terms while also searching for related wording.

{{diagram:Retrieval}}

## Input and output

| Boundary | Content |
| --- | --- |
| Input | Customer question and the active product version |
| Output | Ranked excerpts, stable source IDs, titles, and document versions |
| No useful result | An empty evidence list that [[Answer checks]] can identify |

## Why two search paths?

[[Hybrid search]] finds related wording through a vector index and exact terms through a keyword index. Both branches enter Merge results. Rerank evidence chooses the excerpts that best address the question.

For "How do I export my workspace?", preserve the words "export" and "workspace" and rank exports-01 above general workspace documentation.

## Failure behavior

An unavailable index or irrelevant result must stay visible to the caller. Do not invent a source to fill the gap. See [[Retrieval runbook]] for the operating steps and [[Response contract]] for the evidence fields.

Continue to [[Answer generation]] with the ranked excerpts.
