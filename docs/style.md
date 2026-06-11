# AgentMint Design Tokens

## Colors
| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0b1120` | Page background |
| `--surface` | `#141e30` | Card/panel backgrounds |
| `--code-bg` | `#0d1117` | Terminal, code blocks, hash displays |
| `--border` | `#1e3a5f` | Card borders, dividers |
| `--code-border` | `#1e3a5f` | Code block borders |
| `--blue` | `#3b82f6` | Primary accent, CTAs, links |
| `--green` | `#10b981` | Verified, attestation, status |
| `--red` | `#ef4444` | Terminal dot (decorative only) |
| `--yellow` | `#fbbf24` | Seal, gaps, warnings |
| `--fg` | `#e2e8f0` | Primary text |
| `--text-secondary` | `#94a3b8` | Body copy, descriptions |
| `--text-tertiary` | `#475569` | Labels, captions, metadata |

## Typography
| Role | Family | Variable |
|---|---|---|
| Mono | JetBrains Mono 400/500/600/700 | `--font-mono` |
| Serif | Source Serif 4 400/600/700 normal+italic | `--font-serif` |

Mono is used for: wordmark, labels, nav, field names, code, stamps, kickers, step numbers, byline, footer.
Serif is used for: body copy, hero serif headline, offer price, all paragraph text.

## Layout
| Token | Value |
|---|---|
| `--gutter` | `20px` (16px below 360px) |
| `--content-max` | `1200px` |
| `--prose-max` | `800px` |

Container formula: `min(var(--content-max), calc(100% - (var(--gutter) + var(--gutter))))`

## Mobile Breakpoints
| Width | Key behavior |
|---|---|
| `≤ 900px` | Hero grid collapses to single column |
| `≤ 720px` | Cards get 20px padding, CTAs full-width, grids single-column |
| `≤ 640px` | Tables become stacked cards, nav CTA shrinks |
| `≤ 480px` | Nav CTA shortens, offer grid single-column, headline clamp reduces |
| `≤ 390px` | Reduced top padding, tighter nav CTA padding |
| `≤ 359px` | Gutter narrows to 16px |
