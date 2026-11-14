# Retrieval runbook

Owner: Knowledge team.

Use this page when retrieval returns no useful evidence or an index is unavailable. Retrieve knowledge links this runbook as its second page, after [[Retrieval design]].

## Investigate

- [ ] Record the customer's question and the product version.
- [ ] Check that semantic and keyword searches used the same document version.
- [ ] Inspect both result lists before Merge results.
- [ ] Verify that Rerank evidence kept the original source IDs.
- [ ] Pass an empty evidence list to [[Answer checks]] if no excerpt answers the question.
- [ ] Follow [[Human handoff]] when an answer requires unsupported information.

## Reproduce the exception

Ask: "Can you restore a workspace that I deleted last year?"

The demo's approved sources cover exports only. They provide no restoration policy. A draft that promises restoration should fail the source check and create a support ticket.

## Recovery

Add an approved restoration article to the knowledge source, rebuild both indexes, and retry the question. A recovered search should return the new source ID and version in the [[Response contract]].
