# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

FTC scouts and scouting leads using phones, desktop browsers, and WeChat Mini Program devices during live competitions. Their primary job is to record match and pit observations quickly, verify that data is safe, and turn submitted observations into useful event rankings and coverage decisions.

## Product Purpose

FTC Scouting Project is a bilingual competition scouting and analysis application. Success means scouts can capture accurate observations under time pressure, work through intermittent connectivity, understand synchronization state, and identify event scouting gaps without disrupting established calculations or workflows.

## Positioning

The product combines event-scoped match and pit data capture, offline-first submission, Supabase synchronization, configurable rankings, comparison, and export in one Taro codebase that serves both H5 and WeChat Mini Program environments.

## Operating Context

The application is used in noisy, time-sensitive competition venues on small touch screens and on desktop analysis stations. Connectivity may be intermittent. Scouts repeatedly enter match observations; scouting leads monitor coverage, rankings, exports, event selection, and user access.

## Capabilities and Constraints

- Preserve existing scouting calculations, game rules, data structures, ranking algorithms, authentication, permissions, exports, imports, drafts, outbox, retries, and Supabase integration.
- Chinese and English must always appear together; saved legacy language preferences must not override bilingual rendering.
- Light and dark themes must both remain supported.
- The frontend uses Taro, React, TypeScript, Sass, and Supabase and must remain compatible with H5 and WeChat Mini Program builds.
- Progress metrics must use submitted observations, event scope, unique matches, unique team numbers, reliable roster availability, and cautious offline wording.
- A locally saved draft is distinct from a queued submission and from backend-confirmed synchronization.

## Brand Commitments

The product name and bilingual content are established. The requested identity is a professional engineering dashboard with restrained navy, blue, silver, gray, neutral surfaces, and very limited cyan accents. Cybertech influence is subtle; neon decoration, excessive glow, complex animation, and visual noise are explicitly out of scope.

## Evidence on Hand

The repository contains the current application, translations, event definitions, local draft/outbox logic, Supabase data access, ranking utilities, and all major page implementations. No external marketing claims, customer evidence, or imagery should be fabricated.

## Product Principles

- Optimize for accurate, fast scouting under competition pressure.
- Make data safety and synchronization state explicit without interrupting the scout.
- Prefer trustworthy, event-scoped information over misleading completeness.
- Keep bilingual labels legible and touch targets dependable at narrow widths.
- Evolve the interface without changing established game or data behavior.

## Accessibility & Inclusion

Status must never rely on color alone. Controls need comfortable touch targets, readable contrast in both themes, visible focus and disabled states, and layouts that tolerate longer bilingual labels.
