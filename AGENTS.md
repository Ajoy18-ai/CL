# UI/UX Design System & Architectural Guidelines

This project strictly adheres to the following Professional UI/UX Design Framework for evaluating, building, and refining user interfaces:

## 1. Affordances & Signifiers
- Every interactive UI element must clearly communicate its function through distinct containers, states (hover, active/pressed, focus-visible, disabled), and helpful tooltip/aria labels.
- Interactive controls must have clear touch targets (minimum 44x44px to 48x48px on mobile) and clear visual affordances.

## 2. Visual Hierarchy
- Use size, color contrast, and positioning to guide the eye intuitively.
- Place primary actions and key data at the top/prominent positions.
- Use bold, high-contrast elements for primary calls-to-action (CTA).
- Incorporate imagery and media strategically with clean framing to break up text and optimize scanning.

## 3. Layout & Spacing
- Maintain a strict 4-point / 8-point grid system (multiples of 4px / 8px) for all margin and padding rules.
- Prioritize generous negative space and rhythmic grouping to reduce cognitive load.

## 4. Typography
- Standardize on a single, clean sans-serif typeface (Geist / Inter).
- Headers: tightened tracking/letter-spacing (-0.02em to -0.03em / `-2%` to `-3%`) with tight leading (line-height 110% to 120%).
- Restrict the typography scale to a maximum of six harmonious font sizes across the application.

## 5. Color Theory
- Establish one primary brand color with computed lighter and darker tonal tints/shades for active/hover states.
- Semantic feedback colors:
  - **Blue**: Information & Neutral Trust
  - **Red**: Critical errors, Destructive actions & Alerts
  - **Green**: Success, confirmations & completed status
  - **Yellow / Amber**: Cautionary warnings & non-blocking notices

## 6. Dark Mode & Depth
- Express Z-axis depth in dark themes using lighter container surfaces (`#121215`, `#18181b`, `#27272a`) rather than heavy drop shadows.
- Ensure optimal legibility (WCAG AA 4.5:1+) while dimming non-essential metadata saturation.

## 7. Shadows & Polish
- Subtle, diffused ambient shadows with increased blur and low opacity.
- Gradient scrim overlays (linear gradients or progressive blurs) when overlaying typography on posters and background imagery.

## 8. Interaction & Feedback
- Comprehensive interactive states for all buttons and interactive controls: `Default`, `Hover`, `Active / Pressed`, and `Disabled`.
- Micro-interactions (motion-based transitions, spring/cubic-bezier curves, toast confirmations, skeleton loaders) to provide immediate tactile feedback.
