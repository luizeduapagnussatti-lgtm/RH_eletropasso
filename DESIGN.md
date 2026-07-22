---
name: RH_Eletropasso
description: App de RH da Eletropasso — shell com sidebar, tema de acento dinâmico e branding Eletropasso
colors:
  brand-red: "#c41e24"
  brand-red-mirror: "#e23d42"
  brand-black: "#111111"
  chrome-bg: "#182230"
  chrome-border: "#243044"
  primary: "#4a6fa5"
  primary-hover: "#3b5d8c"
  primary-light: "#d4e4f7"
  surface: "#fcfdfe"
  surface-elevated: "#ffffff"
  ink: "#0f172a"
  muted: "#64748b"
  border: "#e2e8f0"
  dark-bg: "#0a0e17"
  dark-surface: "#1e293b"
  dark-ink: "#e2e8f0"
typography:
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  heading:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "#ffffff"
  header-brand-pill:
    backgroundColor: "{colors.brand-black}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    padding: "6px 12px"
  card-surface:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
---

## Overview

RH_Eletropasso is a **product** UI (dashboard / app shell), not a marketing site. Visual language is utility-first: Inter, slate neutrals, a themeable CSS `--primary` accent, and fixed Eletropasso brand marks. Light surface default `#fcfdfe`; dark mode via `html.dark` overrides in `src/index.css`. Org-selectable themes inject `--primary` / `--primary-hover` / `--primary-light` at runtime (`ThemeContext`). PWA / install chrome uses brand red `#c41e24`.

## Colors

- **Brand red** (`#c41e24`): logo / PWA; **mirror** (`#e23d42`) for icons and active nav on dark chrome.
- **Chrome** (`#182230` + border `#243044`): sidebar + top header shell (always — light or dark content).
- **Brand black** (`#111111`): header wordmark pill background behind the Eletropasso store logo.
- **Theme primary**: defaults to Arctic Frost `#4a6fa5`; org may pick from the THEMES list. Always drive CTAs and focus rings through `var(--primary)`, not hard-coded blues.
- **Surfaces**: `#fcfdfe` page, white elevated panels, slate borders/text hierarchy (`slate-900` → `slate-400`).
- **Dark**: `#0a0e17` page canvas (solid, low-chroma — avoids banding of former slate-900 `#0f172a`), `#1e293b` elevated panels, nested notice panels `#243044`. Muted copy maps to `#94a3b8` / `#cbd5e1` (never `#64748b`/`#475569` on dark surfaces).

Do not invent a second competing accent; keep semantic status colors (green / amber / rose) for leave/attendance/review states only.

## Typography

Single family: **Inter** (`--font-sans` / `body`). Product density — semibold section titles (~`text-lg`/`font-semibold`), regular body, medium captions. No display/serif pairing in the authenticated app. Prefer `text-wrap: balance` on short headings when adding new ones.

## Elevation

Keep elevation quiet: `shadow-sm` / `shadow-md` for sticky header, modals, and dropdowns. Prefer border + surface change over heavy layered shadows. Dark mode already remaps shadow opacity — stay within those utilities.

## Components

- **App shell**: `MainLayout` + `Sidebar` — chrome `#182230` with brand-red mirror icons; RH circular icon beside user identity in the sidebar; store wordmark in the top header pill (never the reverse).
- **Login**: dark branded entry surface using a flat solid `#0a0e17` canvas and neutral, shadow-free `#181818` card to prevent 8-bit chromatic banding around the red CTA; Eletropasso red remains reserved for the primary action. Store wordmark only; no circular RH icon.
- **Buttons**: primary filled with `bg-primary` / hover `bg-primary-hover`; secondary outline or muted solid on slate.
- **Cards / widgets**: flat white (or dark surface) with light border; avoid nested cards.
- **Forms / tables**: Tailwind form controls; dark overrides already cover inputs. Dense tables are acceptable in Reports / Directories — keep header sticky and actions obvious.
- **Motion**: existing `slideUp` (~0.3s ease-out) for entrances; respect reduced motion for any new animation.

## Do's and Don'ts

**Do**

- Route new UI through theme CSS variables for accent color.
- Reuse shell patterns (header, sidebar, content padding) for consistency.
- Keep pt-BR strings in i18n namespaces; design work must not hardcode English chrome.
- Preserve safe-area padding for PWA standalone.

**Don't**

- Place the circular RH icon on the login screen or replace the header wordmark with it.
- Introduce purple/indigo “AI SaaS” gradients or cream-paper magazine aesthetics into the app shell.
- Nest cards inside cards or add side-stripe accent borders as decoration.
- Ship critical status as color-only without label/icon.
