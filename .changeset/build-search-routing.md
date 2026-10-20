---
'@astryxdesign/cli': patch
---

[chore] build and search now answer through a small routing step shared by both commands: a dispatcher picks which searcher answers, and today each command has one searcher, its existing ranker. Results are unchanged.

@josephfarina
