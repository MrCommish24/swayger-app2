const Colors = {
  dark: {
    // ── Base surfaces ──────────────────────────────────────────
    background:    "#09090B",   // Void Black — app bg, dominant base
    surface:       "#27272A",   // Zinc — card bg, elevated surfaces
    surfaceLight:  "#323236",   // bg-elevated

    // ── Text ───────────────────────────────────────────────────
    text:          "#FAFAFA",   // Signal White — primary text on dark
    textSecondary: "#A8A8B3",   // Slate — secondary text, metadata
    textMuted:     "#6B6B77",   // muted — timestamps, placeholders

    // ── Accent (Swayger Indigo) ────────────────────────────────
    tint:          "#4361EE",   // Swayger Indigo — primary accent
    tintLight:     "#5472F0",   // accent-hover
    accent:        "#4361EE",   // alias for tint
    accentHover:   "#5472F0",
    accentPress:   "#3554DC",

    // ── Tab bar ────────────────────────────────────────────────
    tabIconDefault:  "#6B6B77",
    tabIconSelected: "#4361EE",

    // ── Borders ────────────────────────────────────────────────
    border:       "#323236",   // border-default
    borderStrong: "#404044",   // border-strong

    // ── Semantic — use only for their meaning ──────────────────
    success:      "#10B981",   // Proof Green — wins, correct, confirmed
    danger:       "#EF4444",   // Heat Red — losses, wrong, urgency
    accentGold:   "#F59E0B",   // Championship Gold — finals/prizes ONLY

    // ── Legacy alias (kept so no breakage during transition) ───
    teal: "#4361EE",
  },
};

export default Colors;
