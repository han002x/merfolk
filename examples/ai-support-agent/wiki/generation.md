# Answer generation

Owner: Assistant team.

Build a draft from the question, ranked excerpts, and support instructions. The draft remains subject to [[Answer checks]].

{{diagram:Generation}}

## Responsibilities

| Step | Responsibility |
| --- | --- |
| Build context | Include the question, relevant excerpts, source IDs, and versions. |
| Apply instructions | Ask for direct steps and require a source for factual claims. |
| Draft answer | Return the proposed reply and its citations using [[Response contract]]. |

## Example draft

> Open Workspace settings, choose Export, then Download JSON. Your export includes your projects and notes.

The steps cite exports-01. The statement about contents cites exports-02. Both sources appear in [[Support agent overview]].

## Insufficient evidence

If [[Retrieval design]] finds no relevant article, return an unresolved draft with an empty citation list. Leave the unsupported question for [[Human handoff]].
