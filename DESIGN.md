---
name: FTC Scouting Project
description: A bilingual mission-control interface for fast, reliable FTC scouting.
colors:
  canvas: "#eef2f7"
  panel: "#ffffff"
  surface-subtle: "#f4f7fb"
  input: "#f8fafc"
  ink: "#132238"
  label: "#263b55"
  muted: "#5e7189"
  faint: "#7e8da0"
  primary: "#2363d1"
  primary-active: "#194fae"
  primary-contrast: "#ffffff"
  primary-soft: "#e9f1ff"
  mission-navy: "#10243e"
  technical-cyan: "#59d2e6"
  status-accent: "#168fb1"
  danger: "#b53d4c"
  warning: "#986816"
  success: "#26734d"
  info: "#356a9e"
  alliance-red: "#a93d49"
  alliance-blue: "#245fbd"
  disabled: "#e8edf3"
  border: "#d8e0ea"
  border-strong: "#bdc9d8"
  dark-canvas: "#09121e"
  dark-panel: "#111d2c"
  dark-surface-subtle: "#172638"
  dark-input: "#132235"
  dark-ink: "#eef5fd"
  dark-label: "#d2dfec"
  dark-muted: "#9eb0c4"
  dark-faint: "#8295aa"
  dark-primary: "#6b9cff"
  dark-primary-active: "#83abff"
  dark-primary-contrast: "#07111f"
  dark-primary-soft: "#1a3356"
  dark-mission-navy: "#0b1828"
  dark-technical-cyan: "#63d7e9"
  dark-status-accent: "#4ec3d8"
  dark-danger: "#ff8b98"
  dark-warning: "#e9bd67"
  dark-success: "#73d0a1"
  dark-info: "#8dbce8"
  dark-alliance-red: "#ae414d"
  dark-alliance-blue: "#2d64be"
  dark-disabled: "#182536"
  dark-border: "#293b50"
  dark-border-strong: "#3b5068"
typography:
  display:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "calc(38px * var(--font-scale))"
    fontWeight: 780
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "calc(28px * var(--font-scale))"
    fontWeight: 770
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "calc(23px * var(--font-scale))"
    fontWeight: 730
    lineHeight: 1.35
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "calc(18px * var(--font-scale))"
    fontWeight: 400
    lineHeight: 1.5
  field:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "calc(24px * var(--font-scale))"
    fontWeight: 400
    lineHeight: 1.35
  compact:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif"
    fontSize: "calc(16px * var(--font-scale))"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  compact: "8px"
  control: "10px"
  panel: "14px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "22px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-contrast}"
    rounded: "{rounded.control}"
    padding: "14px 22px"
    height: "56px"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.primary-contrast}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "22px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "13px 15px"
    height: "52px"
  chip:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "9px 14px"
  chip-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.pill}"
  counter-action:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.control}"
    height: "52px"
---

# Design System: FTC Scouting Project

## Overview

**Creative North Star: "The Competition Control Desk"**

The shipped interface is a dense but calm engineering dashboard built for repeated use under match pressure. Its authority comes from semantic status, disciplined navy and blue surfaces, tabular numbers, crisp dividers, and a small set of cyan technical marks—not from ornamental science-fiction effects.

Every operational label is designed to tolerate permanent Chinese/English display. A shared theme root carries font scaling and light/dark variables through both H5 and WeChat Mini Program component trees, while large inputs, direct actions, and compressed responsive grids preserve fast entry on either platform.

**Key Characteristics:**

- Restrained navy, blue, silver-gray, and neutral surfaces with cyan reserved for technical accents.
- Semantic light/dark theme slots rather than page-specific color choices.
- Distinct active-event status and viewed-event selection, stated in text rather than inferred from color.
- Bilingual, wrap-safe labels and numeric displays with tabular figures.
- Bordered panels, compact structural rules, and low ambient elevation.
- Direct touch controls optimized for repeated scouting actions.

## Colors

Blue carries primary action and selection, navy anchors the mission panel, and neutral surfaces carry most of the interface. Cyan appears only in short technical rules and live/status marks. Every semantic light token has an explicit dark-theme counterpart in the frontmatter.

### Primary

- **Action Blue:** The default interactive color for submission, selected controls, focus borders, values, and navigation cues.
- **Deep Action Blue:** The pressed state for primary actions.
- **Soft Action Blue:** The selected or actionable tint behind chips, counters, and pressed header controls.

### Secondary

- **Mission Navy:** A high-contrast operational field used for the home mission panel.
- **Technical Cyan:** A rare accent for short rules and live/status marks.
- **Alliance Red / Alliance Blue:** Professional competition semantics for selected alliance controls and compact entry badges; both have explicit dark-theme counterparts.

### Neutral

- **Cool Canvas:** The application background that separates panels without high contrast.
- **Panel White / Deep Panel:** The paired light and dark card surfaces.
- **Subtle Surface:** The quiet fill for secondary controls, status containers, and chips.
- **Engineering Ink:** The primary text role, supported by label, muted, and faint tiers.
- **Silver Borders:** Default and strong divider roles that carry most structural definition.

### Named Rules

**The Cyan Instrument Rule.** Cyan marks technical structure or status only; it never becomes the dominant action or decorative field.

**The Semantic Parity Rule.** New colors enter through reusable semantic light and dark roles; do not hard-code a one-theme-only surface.

**The Status Has Shape Rule.** Success, warning, error, and synchronization states pair color with text and a visible marker or border treatment.

**The Alliance Is Semantic Rule.** Red and blue identify FTC alliances only. Use the paired alliance tokens for selected controls and badges, with readable text labels retained.

## Typography

**Display Font:** Platform UI sans-serif with Segoe UI, PingFang SC, and Microsoft YaHei fallbacks
**Body Font:** The same platform UI sans-serif stack
**Label/Mono Font:** No separate face; numeric counters use tabular figures

**Character:** The type system is utilitarian, compact, and bilingual-first. Hierarchy comes from weight, size, and restrained negative tracking rather than a decorative display face.

### Hierarchy

- **Display** (780, scaled 38px, -0.02em): Home and authentication titles.
- **Headline** (770, scaled 28px, -0.015em): Card and form section headings.
- **Title** (730, scaled 23px): Navigation-card and subsection titles.
- **Field** (400, scaled 24px): High-legibility entry values and text areas.
- **Body** (400, scaled 18px, 1.5): Descriptions, field labels when bolded locally, notes, progress labels, and bilingual supporting copy.
- **Compact** (400, scaled 16px, 1.4): Metadata, administrative hints, status chips, entry badges, and dense control labels; components may raise its weight for emphasis.

### Named Rules

**The Bilingual Integrity Rule.** Chinese and English remain together; labels wrap instead of truncating or shrinking into illegibility.

**The Numeric Readout Rule.** Counters, progress values, and team identifiers use tabular figures for stable scanning.

**The Six-Role Scale Rule.** Reuse display, headline, title, field, body, and compact variables before introducing a one-off size; local weight changes express emphasis without creating another role.

## Layout

Page content uses 22px padding by default, narrows to 14–16px on small screens, and centers within a 980px content column from 900px upward. Home expands to 1060px; the scouting form narrows to 860px. Repeated panel gaps cluster around 18–22px, with 8–14px used inside compact control groups.

Desktop grids collapse deliberately: the home mission panel moves from a split layout to one column at 680px, two-column form fields collapse at 620px, and navigation cards become a single stack. The five-part scoring control remains one horizontal row—−1, current value, +1, +2, +4—even at narrow widths, reducing gaps and type size rather than changing the interaction model.

The compact Event Management surface uses a three-column name/season/code grid and inline active status above a divided event list. At 520px it becomes a single-column form; event rows and their activation action stack without reducing the 44px target.

**The Reachable Control Rule.** Canonical interactive controls are at least 44px tall; primary submit controls are 56px and standard fields/counters are 52px.

## Elevation & Depth

Depth is restrained and structural. Cards use a low ambient panel shadow plus a one-pixel border; the sticky header uses a slightly broader shadow, while inputs and chips remain flat. Primary submit actions receive a blue-tinted lift, and focus is shown by a three-pixel semantic ring.

### Shadow Vocabulary

- **Panel Ambient** (`0 5px 18px rgba(24, 43, 69, .08)`; dark `0 7px 22px rgba(0, 0, 0, .22)`): Reusable card and section separation.
- **Sticky Header** (`0 3px 14px var(--color-shadow)`): Keeps navigation above scrolling content.
- **Primary Lift** (`0 5px 14px var(--color-primary-shadow)`): Submit and administrative primary actions.
- **Focus Ring** (`0 0 0 3px var(--color-focus)`): Keyboard and field focus.

**The Bordered Before Floating Rule.** Use a border and tonal separation first; reserve shadows for panels, sticky navigation, focus, and primary commitment actions.

## Shapes

The form language uses gently engineered corners: 14px for panels, 10px for controls, and 8px for compact badges and narrow-width counters. Fully rounded 999px geometry is reserved for multi-select chips. Circles are reserved for status marks and slider thumbs. One- and two-pixel rules provide technical structure inside otherwise quiet surfaces.

**The Two-Tier Radius Rule.** New surfaces use the 14px panel or 10px control radius unless they are explicitly a compact badge, chip, or circular status mark.

## Components

### Buttons

- **Shape:** Gently curved controls (10px) with a 44px global minimum; primary submit actions are 56px tall.
- **Primary:** Action blue with contrast text, heavy label weight, and a restrained blue lift.
- **Hover / Focus:** Fast 160ms state transitions, one-pixel pressed translation, active-blue fill, and a three-pixel focus ring.
- **Danger:** Transparent at rest with a semantic red border and text; fills red only while active.

### Chips

- **Style:** Fully rounded, subtle-surface multi-select controls with muted text.
- **State:** Active chips use soft blue, a blue border, blue text, and increased weight. Status and team badges use compact 8px corners rather than pill geometry.
- **Alliance State:** Match-entry red and blue choices remain neutral while unselected, then fill with the corresponding alliance token and white text when selected. Entry badges reuse the same semantic pair.

### Cards / Containers

- **Corner Style:** Panel radius (14px).
- **Background:** Semantic panel over semantic canvas; mission panels use navy.
- **Shadow Strategy:** Low ambient elevation with a one-pixel border.
- **Internal Padding:** Usually 22px; 16–18px on narrow screens and 24–28px for prominent dashboard panels.

### Inputs / Fields

- **Style:** Strong one-pixel border, input-surface fill, 10px radius, and 52px minimum height.
- **Focus:** Primary border plus three-pixel semantic focus ring.
- **Error / Disabled:** Semantic text and borders communicate error; disabled controls use the disabled surface, faint text, and reduced opacity without shadow.

### Navigation

The application header is sticky, centered, bordered, and shadowed, with balanced side rails. Back and search controls use bilingual text, subtle surfaces, and engineered CSS arrows rather than ornamental glyphs. Home navigation uses panel cards with a single slim blue rule as the directional cue.

### Event Context

The central active event is a shared application status, cached for resilient entry and shown with explicit bilingual Active text. The data dashboard's viewed event is a separate remembered browsing choice; it may differ from the active event and is labeled Viewed event, with the active item annotated rather than silently forcing selection. Admin Event Management presents creation fields, a success-bordered active chip, divided event rows, and a direct Activate action.

### Sync Status

Synchronization uses a bordered subtle-surface container, explicit bilingual status text, and a circular marker. Local, queued, synced, and error states map to info, warning, success, and danger colors; queued and synced states alter the marker geometry so color is never the only signal.

### Scoring Counter

Each scoring field is one five-column row: −1, value, +1, +2, +4. Action cells use soft blue with blue borders; the value cell uses a neutral panel and tabular numeric type. Disabled decrement uses disabled fill and faint text while preserving the row geometry.

## Do's and Don'ts

### Do:

- **Do** route new visual values through the existing semantic theme variables and preserve light/dark parity.
- **Do** distinguish the central active event from a user's remembered viewed event with explicit bilingual context labels.
- **Do** keep Chinese and English visible together and allow labels to wrap safely.
- **Do** use the 14px panel, 10px control, 8px compact, and 999px chip roles intentionally.
- **Do** preserve the single-row five-part scoring counter and minimum 44px canonical touch target.
- **Do** use borders, short rules, tabular numbers, and status geometry for the subtle control-desk character.

### Don't:

- **Don't** use gradients, glass effects, neon glow, or ornamental science-fiction decoration.
- **Don't** promote cyan into a dominant button, large background, or decorative field.
- **Don't** introduce glyph icons, invented kickers, or a display typeface outside the shipped platform sans-serif system.
- **Don't** rely on color alone for synchronization, validation, warning, or completion states.
- **Don't** use alliance red or blue as generic status, decoration, or primary-action color.
- **Don't** replace direct match-entry controls with hidden menus or multi-step interactions.
