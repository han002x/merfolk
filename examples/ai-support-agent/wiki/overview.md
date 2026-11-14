# Support agent overview

Harbor Notes is a fictional workspace app. This example explains how its support agent answers a customer using product documentation, with a human handoff when an answer needs review. All content is synthetic.

## Follow one question

> How do I export my workspace?

1. [[Retrieval design]] finds relevant documentation.
2. [[Answer generation]] drafts an answer from the retrieved sources.
3. [[Answer checks]] decides whether to send the answer or start a [[Human handoff]].
4. Both paths finish at Customer reply.

## Example source

| Source ID | Title | Approved content |
| --- | --- | --- |
| exports-01 | Export a workspace | Open Workspace settings, choose Export, then Download JSON. |
| exports-02 | Export contents | A JSON export contains the workspace's projects and notes. |

The normal path should answer: "Open Workspace settings, choose Export, then Download JSON. The export includes your projects and notes."

## Explore the map

Start with Retrieve knowledge, Generate answer, Check answer, and Human handoff folded. Unfold Retrieve knowledge, then Hybrid search to see the query split into semantic and keyword search.

[[Response contract]] is shared by generation, checking, and the final reply. [[Retrieval runbook]] gives a concrete example of an unsuccessful lookup.

This file describes a system. Merfolk's pulse animation illustrates its connections; the demo contains no API credentials or live integrations.
