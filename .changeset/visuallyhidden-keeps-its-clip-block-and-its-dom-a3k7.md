---
'@astryxdesign/core': patch
---

[fix] VisuallyHidden keeps its clip block and its DOM clean: `xstyle`, `className` and `style` no longer reach the element. The component's contract is that content in the accessibility tree stays invisible, so its clip block is meant to be non-overridable — but the implementation spread leftover props onto the element, which wrote the literal attribute `xstyle="[object Object]"` into the DOM, and let the same props arriving through a cast or a `{...consumerProps}` object take the last word on `position` and un-hide the node while assistive technology kept announcing it. Measured against 0.7.2 first: there the released clip block already won (`style` attribute `null`, computed `position: absolute`, `width: 1px`), so no consumer's rendering changes — only the stray attribute goes, which is why this is a behavior fix rather than a breaking correction.

`xstyle` stays declared on `VisuallyHiddenProps`, marked `@deprecated` and documented as ignored, because released 0.7.2 accepted it through `BaseProps`: removing it from the interface makes `<VisuallyHidden xstyle={…}>` stop compiling, and AST-017 FR31 and FR53 admit that narrowing only as a `[breaking]` change in a planned minor. The interface removal, with a one-line migration, is the follow-up once a minor is declared.

@aashish254
