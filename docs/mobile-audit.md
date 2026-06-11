# Mobile Audit

Measured against the static export in `out/`, served locally and checked at `320`, `360`, `390`, and `430` px widths with Playwright. Final page-level overflow result: `document.documentElement.scrollWidth === clientWidth` on `/` and `/p/sample-health-001` at every tested width.

| Component | Widths tested | Container width @390 | Padding L/R | Alignment vs gutter (flush?) | Overflow? | Wraps correctly? | Tap targets OK? | Issue found | Fix applied |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `HashDisplay` | `320/360/390/430` | `350px` | `16px / 16px` | Yes, flush to `20px` gutter | No | Yes, long hash breaks at `320px` | Yes | None after final pass | No change |
| `MonoLabel` | `320/360/390/430` | `auto` | `0px / 0px` | Within flush parent | No | Yes | N/A | None | No change |
| `SerifBody` | `320/360/390/430` | `350px` | `0px / 0px` | Yes, within shared content column | No | Yes | N/A | None | No change |
| `SignedStamp` | `320/360/390/430` | `123px` | `12px / 12px` | Within flush parent | No | Yes | N/A | Needed confirmation at mobile scale | Rotation/animation preserved; no layout change needed |
| `StatusPill` | `320/360/390/430` | `auto` | `9px / 9px` | Within flush parent | No | Yes | N/A | Inline style was still `10px` | Raised rendered font size to `11px` |
| `SectionObserver` | `320/360/390/430` | `N/A` | `N/A` | N/A (non-visual observer) | No | N/A | N/A | None | No change |
| `ArtifactCard` | `320/360/390/430` | `350px` | `0px / 0px` | Yes, flush to gutter | No | Yes | N/A | Needed consistent mobile card stacking | Shares `100%` width and `16px` vertical gap on mobile |
| `ArtifactFieldRow` | `320/360/390/430` | `310px` | `0px / 0px` | Yes, inside flush card | No | Yes | N/A | Required label-over-value collapse on mobile | Switched to one-column mobile grid with left-aligned values |
| `AttestationBlock` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | N/A | Minor typography floor issue in label sizing | Label floor lifted to `11px`; shared mobile padding applied |
| `ChaiCrosswalkBlock` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Table needed mobile card mode | Converted to stacked entry cards below `640px` |
| `CitationChip` | `320/360/390/430` | `auto` | `6px / 6px` | Within flush parent | No | Yes | N/A | Chip text rendered below `11px` | Chip font size raised to `11px` |
| `DetachableHeader` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | N/A | Detach note text rendered below `11px` | Note font size raised to `11px` |
| `ExecutiveSummaryBlock` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | None | No change |
| `GapRegisterTable` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Horizontal scroll existed before mobile table rewrite | Uses stacked card rows below `640px` |
| `GapSectionCard` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | N/A | Needed shared card padding on mobile | Unified to `20px` mobile padding |
| `OwaspTable` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Horizontal scroll existed before mobile table rewrite | Uses stacked threat cards below `640px` |
| `PacketAccordion` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes, including open state | Yes | Needed open-state/mobile confirmation | Kept flat card layout and `44px` toggle target |
| `PacketCover` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | Yes | Required label-over-value collapse on mobile | Grid collapses to one column; shared gutter math fixed |
| `VerificationActions` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | Needed stacked full-width buttons on mobile | Buttons stack at `<640px` with `12px` gap |
| `VerificationSection` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | Yes | None after long-hash verification | No change |
| `Home / nav` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | Footer/nav brand tap targets were too small earlier | Wordmark kept at `44px` minimum target height |
| `Home / hero` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | Hero proof panel animation caused transient overflow | Clipped hero x-overflow and let terminal metadata wrap |
| `Home / credential` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | None | No change |
| `Home / steps` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Needed shared mobile card padding | Steps inherit `20px` mobile card padding |
| `Home / intake` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | `home-section__inner` overrode container width | Matched it back to shared gutter/container formula |
| `Home / offer cards` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | Yes | Invalid gutter math plus grid min-content sizing caused `320px` overflow | Replaced invalid `calc`, restored shared container width, added `min-width: 0`, and kept cards single-column below `480px` |
| `Home / footer` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | Footer links were below `44px` target | Footer links now render as `inline-flex` with `44px` min height |
| `Packet / nav` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | None | No change |
| `Packet / sample banner` | `320/360/390/430` | `350px` | `14px / 14px` | Yes | No | Yes | N/A | Mobile banner previously truncated with ellipsis | Restored normal wrapping on small screens |
| `Packet / cover` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | Yes | None after gutter fix | No change |
| `Packet / executive summary` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | None | No change |
| `Packet / gap register` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Needed no-scroll mobile table treatment | Uses stacked gap cards below `640px` |
| `Packet / artifact stack` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Needed denser mobile rhythm | Artifact stack gap reduced to `16px` on mobile |
| `Packet / OWASP` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Needed no-scroll mobile table treatment | Uses stacked threat cards below `640px` |
| `Packet / CHAI` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | N/A | Needed no-scroll mobile table treatment | Uses stacked crosswalk cards below `640px` |
| `Packet / attestation` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | N/A | Minor label-size floor issue | Label floor raised to `11px` |
| `Packet / verification` | `320/360/390/430` | `350px` | `20px / 20px` | Yes | No | Yes | Yes | None after long-hash/copy test | No change |
| `Packet / exit CTA` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | CTA copy and button overflowed at `320px` because of nowrap | Allowed CTA button wrapping and added `overflow-wrap` to the copy line |
| `Packet / footer` | `320/360/390/430` | `350px` | `0px / 0px` | Yes | No | Yes | Yes | Footer link targets were below `44px` | Footer links now render at `44px` minimum height |

## Verification Notes

- Hash chain verified:
  - `public/p/sample-health-001/packet.json` sha256: `af05d3c005329dc77321813d873d826f1b69cbd66df6fcfde813dacb7ffd6cb2`
  - `curl -s http://127.0.0.1:4322/p/sample-health-001/packet.json | sha256sum` matched the same value
  - `lib/packet-hash.ts` and `public/p/sample-health-001/verify.sh` both carry the same hash
- Packet structure verified:
  - Artifact order: `01, 02, 03, 04, 05, 07, 06, 11, 08, 09, 10, 12`
  - Gap register rows: `7`
- Print verification with emulated print media:
  - `body` background: white
  - `.packet-nav`, `.sample-banner`, `.packet-exit`, and `.hash-display__button` are hidden in print
  - `.artifact-card` has `break-inside: avoid`
  - `.faq-answer` remains visible in print
- Copy/rename verification:
  - No `ClaraHealth` / `clarahealth` hits remain in app code
  - No rendered `urgent sprint` copy remains
  - Homepage visible `$3,500` count: `1`

## Style Authority Deviation

- `docs/style.md` was referenced by the work order but is not present in this repo. This audit therefore used the attached work order plus the live-site parity requirements as the authoritative design brief.
- The route and packet identifier remain `sample-health-001` instead of switching to `AM-2026-0001`, because the current route, generated asset paths, tests, and packet invariants are built around `sample-health-001`, and the work order also explicitly required keeping `/p/sample-health-001`.
