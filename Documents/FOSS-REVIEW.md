# AdBoard — FOSS Review (Licensing & Compliance)

_Review date: 5 July 2026 · Scope: full npm dependency tree · Overall risk: **LOW**_

> A formatted copy of this review is available as
> [AdBoard-FOSS-Review.docx](AdBoard-FOSS-Review.docx). This markdown version is
> kept in-repo so the findings are readable and diffable.

---

## 1. Executive summary

AdBoard is released under the **MIT License** (© 2026 Sanjay KS). Its entire
installed dependency tree — **378 packages** (direct + transitive), of which
**190 are production/shipped** — resolves to permissive, business-friendly
licenses. **No GPL, LGPL, or AGPL license is present anywhere in the tree.**
The only weak-copyleft components (MPL-2.0) are build-time tooling that is not
redistributed with the application.

| Finding | Detail |
|---|---|
| Project license | MIT — free commercial, private, and modified use with attribution |
| Dependency licenses | 100% permissive: MIT, Apache-2.0, ISC, BSD-2/3, 0BSD, Blue Oak |
| Copyleft (GPL/AGPL family) | **None detected** |
| Weak copyleft (MPL-2.0) | 2 packages (`lightningcss`) — dev/build only, not shipped |
| Attribution | Satisfied by [THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt) |
| Overall risk | **LOW** — suitable for proprietary & commercial distribution |

## 2. Method

- License identifiers read from each installed package's `package.json`
  (`license` / legacy `licenses` field) under `node_modules`.
- Full recursive scan: **378 packages** tallied; non-MIT licenses individually
  identified.
- Production subset resolved via `npm ls --omit=dev --all` (**190 packages**)
  — this is what distribution obligations attach to.

## 3. License distribution (all 378 installed packages)

| License | Packages | Category | Copyleft? |
|---|---:|---|---|
| MIT | 257 | Permissive | No |
| Apache-2.0 | 70 | Permissive (+ patent grant) | No |
| ISC | 26 | Permissive | No |
| BSD-3-Clause | 14 | Permissive | No |
| BSD-2-Clause | 6 | Permissive | No |
| MPL-2.0 | 2 | Weak copyleft (file-level) | Weak |
| CC-BY-4.0 | 1 | Data attribution | No* |
| BlueOak-1.0.0 | 1 | Permissive | No |
| 0BSD | 1 | Public-domain-equivalent | No |

\* CC-BY-4.0 covers the `caniuse-lite` browser-support **dataset** used at
build time — attribution only, no code obligations.

**Production (shipped) tree:** MIT ×115, Apache-2.0 ×52, BSD-3-Clause ×11,
ISC ×11, 0BSD ×1 — all permissive.

## 4. Direct runtime dependencies

| Package | License | Role |
|---|---|---|
| react / react-dom | MIT | UI |
| react-router-dom | MIT | Routing |
| @supabase/supabase-js | MIT | Supabase client |
| firebase | Apache-2.0 | Firebase client |
| express | MIT | Self-hosted server |
| multer | MIT | Upload handling |
| lucide-react | ISC | Icons |
| qrcode | MIT | 2FA QR codes |

Dev/build tooling (Vite, TypeScript, esbuild, Tailwind, tsx, type stubs) is
MIT/Apache-2.0 and not distributed.

## 5. Notable licenses & what they require

- **Apache-2.0** (`firebase`, `typescript`, ~70 transitive): permissive with an
  express patent grant. Retain the license text and reproduce any NOTICE files
  when redistributing; state significant changes if you modify Apache sources.
- **MPL-2.0** (`lightningcss`, `lightningcss-win32-x64-msvc`): file-level weak
  copyleft. These are **build-time** CSS tools pulled in by the Tailwind/Vite
  toolchain and are **not part of the shipped bundle**, so no obligations are
  triggered by normal distribution. Only modifying lightningcss's own files
  would require publishing those file changes.
- **CC-BY-4.0** (`caniuse-lite`): attribution for a data file; not code.
- **ISC / BSD / 0BSD / Blue Oak**: MIT-equivalent in practice — keep notices
  (0BSD requires nothing).

## 6. Compliance obligations (summary)

1. Retain the project's MIT notice in copies (`LICENSE`).
2. Ship [THIRD-PARTY-NOTICES.txt](../THIRD-PARTY-NOTICES.txt) with releases —
   it lists all 190 production packages, their copyrights, and license texts.
3. Preserve Apache-2.0 NOTICE contents (kept inside each package; incorporated
   by reference in the notices file).
4. **No source-code disclosure is required** by any license in the tree.

## 7. Risk assessment

| Dimension | Rating | Rationale |
|---|---|---|
| License compatibility | Low | All mutually compatible, MIT-distributable |
| Copyleft exposure | Low | None shipped; MPL limited to build tools |
| Patent risk | Low | Apache-2.0 carries an explicit patent grant |
| Attribution effort | Low | Automated notices file committed in-repo |
| Commercial use | Low | Fully permissive |
| Maintenance | Low–Med | Large tree (378 pkgs): keep `npm audit` clean |

## 8. Recommendations

- Regenerate `THIRD-PARTY-NOTICES.txt` when dependencies change.
- Add a CI license gate (e.g. fail on `GPL;AGPL;UNKNOWN`).
- Run `npm audit` regularly — security, not licensing, is the ongoing risk.
- Re-run this review before any public or commercial release.

## 9. Statement of intent

AdBoard is built **as a hobby project** and shared in the spirit of open
source: **no telemetry is collected**, no data leaves your deployment, and
anyone may **host it as they need and improve it as they need** under the MIT
License. See [PRIVACY.md](../PRIVACY.md) for the full usage & privacy policy.

---

_This is an engineering-level assessment based on declared SPDX identifiers;
it is not legal advice._
