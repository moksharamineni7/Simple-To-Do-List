/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#203A34',
    tint: '#326D5B',

    // Core surfaces
    background: '#F7F6F0',
    foreground: '#203A34',

    // Cards / elevated surfaces
    card: '#FFFDF8',
    cardForeground: '#203A34',

    // Primary action color (buttons, links, active states)
    primary: '#326D5B',
    primaryForeground: '#FFFDF8',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E8E9DF',
    secondaryForeground: '#203A34',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#ECECE5',
    mutedForeground: '#7B827B',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#F1E8D9',
    accentForeground: '#203A34',

    // Destructive actions (delete, error states)
    destructive: '#B65745',
    destructiveForeground: '#FFFDF8',

    // Borders and input outlines
    border: '#E7E5DC',
    input: '#B8C5BC',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
