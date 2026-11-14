# Hybrid search

Owner: Search team.

Run both searches for the same rewritten question. Merge their results before reranking.

{{diagram:Search}}

| Branch | Purpose | Example |
| --- | --- | --- |
| Embed query, then Vector index | Match related wording | "Save a copy of my workspace" can match an export article. |
| Keyword index | Preserve exact terms | "Download JSON" should match the documented command. |
| Merge results | Deduplicate by source ID | exports-01 appears once even when both branches find it. |

This group is nested inside Retrieve knowledge. Folding it preserves the incoming semantic and exact-term connections as a combined crease. Unfold it to inspect the two paths again.

Return merged candidates to [[Retrieval design]]. Keep each excerpt's provenance for [[Response contract]].
