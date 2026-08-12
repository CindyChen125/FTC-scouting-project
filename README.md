# FTC Scouting App (DECODE 2025-2026)

Scouting + team-ranking tool for Cindy's FTC team. Built with **Taro v4.2.1** (React + TypeScript + Sass, webpack5), so the same codebase can later ship as both a website and a WeChat Mini Program without a rewrite.

## Status as of 2026-08-11

**Working:**
- Project scaffolded, `npm install` succeeds, `npm run dev:h5` runs a working dev server.
- **Home page** (`src/pages/index/index.tsx`) with three buttons: Start Scouting / See Current Data / Settings.
- **Match-scouting form** moved to `src/pages/scout/index.tsx` (was originally at `pages/index`): three tabs (Auto / Teleop / Endgame), styled like ftcscout.org's match-scouting UI. All field data auto-saves to browser `localStorage` (keyed by match ID + team number) as the scout types — offline-first, nothing lost mid-match.
- **Current Data page** (`src/pages/data/index.tsx`): lists all saved scouting entries, with a search box (toggled via the header's 🔍 icon) that filters by match ID or team number.
- **Settings page** (`src/pages/settings/index.tsx`): Light/Dark mode toggle and a font-size slider (85%–130%), both apply app-wide instantly and persist across sessions. Also has "Clear all scouting data."
- **Shared AppHeader** (`src/components/AppHeader/`) on every page: sticky top bar with page title, a back arrow on sub-pages (`Taro.navigateBack()`), and the search icon.
- **Theming**: `src/theme/ThemeContext.tsx` provides `theme`/`fontScalePercent` via React context, persisted to Taro storage. All colors in every page's `.scss` use CSS variables defined in `src/app.scss` (`--color-bg`, `--color-text`, `--color-primary`, etc.), swapped via a `.theme-dark` class on `<html>`. All font sizes use `calc(Npx * var(--font-scale))` (NOT `rem` — see gotcha below).
- **Custom slider** (`src/components/RangeSlider/`): Taro's built-in `<Slider>` only wires up touch events on H5 (no mouse support at all, so it's unusable with a mouse/trackpad on desktop). Replaced with a hand-rolled slider using a `View` ref + native `mousedown/mousemove/mouseup` + `touchstart/touchmove/touchend` listeners, so it works with both mouse and touch. Used for the Settings font-size control.
- **Rankings tab** on the Current Data page (`src/pages/data/index.tsx`): a "My Scouting Data" / "Rankings" tab toggle. Rankings shows all 48 teams with quals results from the reference event (Canadian Rockies Premier @ KDays, `FPEROC`), pulled live from ftcscout.org's GraphQL API (`api.ftcscout.org/graphql`, CORS-enabled) and baked into a static snapshot at `src/data/fperocResults.json` — historical event data doesn't need a live fetch. Per-team component scores (Auto/Teleop/Endgame) come from ftcscout's own OPR decomposition (`opr.autoPoints` / `opr.dcPoints` / `opr.dcBasePoints`), which estimates each team's individual contribution to alliance-level scores via linear regression — this is the standard way to get per-team numbers out of alliance-only official scoring. Consistency uses `dev.totalPoints` (std deviation, inverted — lower is better). Defense uses `avg.penaltyPointsByOpp` (points awarded from opponent fouls) as a placeholder proxy, since ftcscout doesn't track true defensive plays. Ranking math lives in `src/utils/ranking.ts` (`computeRankings`, `RANKING_WEIGHTS`) — each component is min-max normalized to 0–100 across the team set, then combined with the weights below. Note: ftcscout's official scores only have lumped near+far goal totals, not the near/far split — your own scouts' near/far accuracy data (in "My Scouting Data") is still the only source for shot-placement/specialization insight.

**Gotcha worth knowing:** Taro's H5 runtime sets `document.documentElement.style.fontSize` inline (its own viewport-scaling mechanism), which silently overrides any `html { font-size: ... }` CSS rule. An earlier `rem`-based font-scaling approach broke because of this — stick with `calc(Npx * var(--font-scale))`, not `rem`, for anything that needs to respect the font-size setting.

**Not yet built:**
- No real backend — data only lives on whichever device entered it, nothing syncs between scouts yet. Next step: wire up Firebase (needs Cindy to create a free Firebase project when we get there).
- No pit/pre-event scouting form yet (team capability profile — color-sort, lift mechanism, near/far preference). Only match-by-match scouting exists so far.
- Scout assignment view ("my ~10 teams") not built.
- WeChat Mini Program build untested (should work via `npm run build:weapp` once we're ready, but not yet verified). The new AppHeader/RangeSlider/theme components only use cross-platform Taro APIs (`View`, `Text`, refs, storage) so they *should* port, but this hasn't been checked on `weapp`.

## Key decisions (see project memory for full context/why)

- Ranking will be a custom weighted composite, not OPR: Auto 30%, Teleop 35%, Endgame 20%, Consistency 10%, Defense 5% (placeholder weights, adjustable later once real data exists).
- Artifact scoring is tracked as lumped "goals" (near/far), not split into CLASSIFIED/OVERFLOW/DEPOT — simpler for scouts to enter live; revisit only if this distorts rankings.
- Data model has two tiers: one-time **pit/pre-event profile** per team + repeated **per-match scouting entry** per team per match (matches the team's existing Excel sheet structure).

## Known environment quirk

`npx @tarojs/cli init`'s interactive wizard crashes in this dev environment regardless of which prompts are chosen (a native-binding bug, not a config mistake). This project was hand-assembled from Taro's own bundled default template files instead. If you ever need to scaffold another Taro project here, skip `taro init` and copy this project's config files as a starting point.

## Running it

```
npm install
npm run dev:h5      # website, http://localhost:10086
npm run build:weapp # WeChat Mini Program (untested so far)
```
