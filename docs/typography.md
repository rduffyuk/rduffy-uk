# Notebook typography

Tracking: VW-447. Approved smaller type scale, 15 October 2026.

`src/styles/typography.css` defines the shared type roles used by the common BaseLayout. Page styles use those tokens for their primary titles; shared role selectors align body text, headings, intro copy, archive rows and metadata across the existing Astro and React layouts. The selectors deliberately outrank legacy page rules and utility classes. New pages should use the existing roles and variables instead of adding independent size literals.

| Role | Desktop | Up to 700px |
| --- | --- | --- |
| Page title | 40px | 32px |
| Section heading | 24px | 22px |
| Subheading | 20px | 20px |
| Reading text | 16px | 16px |
| Intro | 20px | 20px |
| Compact explanation | 14px | 14px |
| Metadata | 12px | 12px |
| Controls | 13px | 13px |
| Journey workspace title | 28px | 24px |

The Journey uses compact text to retain usable map and timeline panels. Architecture diagram labels retain their graph-specific geometry and zoom behavior. Source headings inside imported ADR bodies use the section role. Typography rules apply only to screen media; the crafted CV wording and its existing print typography remain independent. Mobile search and milestone fields use 16px text. Colours, routing, source content and data are outside this change.

The scoped selectors bridge existing page markup; future markup cleanup can adopt semantic role classes without changing the scale. Avoid removing the specificity until all corresponding page utilities are migrated. The sole `!important` metadata rule handles existing important u-label utilities; the existing j-node rule also requires a matching specificity override.
