# Search ordering data

`astryx search` decides **what matches**, and each match's score and reason, with the lexical ranker (`_lexical.mjs` and the files it imports). The files in this folder only decide **the order of matches inside one band of equal match strength**: they never add or drop a match, change a score, or move a match past one of another band or kind (doc or not).

## Rule

Search ordering is owned here. Inside one match-strength band, a searcher's static weights decide the order. Matches never cross bands or kinds. There is no model runtime: every number is a plain static value read at load time.

## Files

| File                                                                                           | What it holds                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tree.weights.json`                                                                            | The root classifier: for each query word or word pair, one number per class (component, hook, doc, template, theme, none). The query's tokens vote, and a topic searcher takes the query only when its class wins by the floor in `tree.mjs`. |
| `_main-searcher.weights.json`, `_doc-searcher.weights.json`, `_template-searcher.weights.json` | One weight, mean and spread per signal for each searcher (see `SIGNALS` and `PER_DOMAIN` in `_features.mjs`). A match's place inside its band is the weighted sum of its standardized signals.                                                |
| `_cards.json`                                                                                  | One card per Core component and hook: what it is, the words people use for it, and its main props, written from the item's own source. Cards feed one signal, word overlap with the card.                                                     |

The signals are counts over the query and each entry's own text: the lexical score and rank, BM25 over the entry's name, docs text and card, how many query words the entry covers, whether the query holds the entry's name, and the classifier's guess of the domain.

## Status

These files are static and reviewed. They are not computed when the CLI runs, and nothing at run time writes them.

## Refreshing

- A Core component or hook without a card is still matched and scored as usual; inside its band it is ordered by its other signals.
- When Core adds or renames items, a reviewed change adds or updates their cards and, if needed, refreshed weights.
- Any refresh must keep every test that pins search's behavior passing, including the ordering invariants in `_order.test.mjs`. It must also keep the `astryx search` output's matches, scores and reasons identical to the lexical ranker's.
