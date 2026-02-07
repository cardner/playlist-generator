# Design System Refactor Research

This document analyzes the feasibility of refactoring the AI Playlist Generator UI to be driven by reusable design system components. It covers research on Radix UI adoption, pros and cons, identified UX/UI patterns, and recommended Cursor rules for AI agent consistency.

---

## Executive Summary

The codebase has a solid foundation: Tailwind CSS, CSS custom properties for theming, and a `cn()` utility for class merging. However, there is significant duplication and inconsistency—duplicate ChipInput implementations, divergent dialog patterns, and repeated button/input class strings. A design system refactor would reduce maintenance burden and improve consistency. Radix UI is a strong candidate for complex interactive primitives (dialogs, dropdowns, tabs) but may be overkill for simpler components; a hybrid approach is recommended.

---

## 1. Radix UI Research

### What is Radix UI?

Radix UI is a **headless** component library—it provides unstyled, accessible React primitives. Components ship with behavior and accessibility but no visual styling, allowing full control over appearance via Tailwind, CSS, or design tokens.

### Pros of Adopting Radix UI

| Benefit | Description |
|--------|-------------|
| **WAI-ARIA Compliance** | Built-in correct ARIA roles, keyboard navigation, focus management, and screen reader support. The current Modal, dialogs, and dropdowns are hand-rolled and may have gaps (e.g., focus trap, focus restoration). |
| **Accessibility Out of the Box** | Focus trapping in modals, Escape key handling, proper menu semantics, RTL support, collision-aware positioning. |
| **Composability** | Primitives can be composed into complex widgets (e.g., Dialog, Dropdown Menu, Tabs, Accordion, Slider). |
| **Bundle Efficiency** | Tree-shakeable; only import what you use. No heavy default styles. |
| **Fit with Existing Stack** | Works well with Tailwind and CSS variables. Already uses `data-theme` on root; Radix uses `data-*` attributes for styling hooks. |
| **Industry Adoption** | Used by Vercel (Next.js), shadcn/ui, and many production apps. |
| **Reduces Custom Code** | Replaces custom modal/dialog logic, dropdown logic, and complex interaction patterns. |

### Cons of Radix UI

| Drawback | Description |
|----------|-------------|
| **Learning Curve** | Unstyled means you must build the visual layer. Developers need to understand Radix's composition model and props. |
| **More Setup** | Compared to styled libraries (MUI, Chakra), requires explicit theming and styling. |
| **Design Decisions** | Teams must define variants, sizes, and tokens rather than using prebuilt defaults. |
| **Possible Overlap** | Some components (e.g., simple buttons, inputs) may not need Radix—could add unnecessary abstraction. |
| **Version Coupling** | Radix versions may lag behind React/Next; need to track compatibility. |

### Recommendation: Hybrid Adoption

- **Use Radix for**: Dialog, Dropdown Menu, Tabs, Accordion, Select, Popover, Tooltip, and other complex interactive primitives.
- **Keep custom for**: Button, Input, Badge, Card—simple components that are easy to standardize with Tailwind and tokens.
- **Phase 1**: Replace Modal + custom dialogs with `@radix-ui/react-dialog`.
- **Phase 2**: Replace dropdown-like patterns (e.g., ChipInput suggestions panel, EmojiPicker) with `@radix-ui/react-popover` or `@radix-ui/react-dropdown-menu`.
- **Phase 3**: Use `@radix-ui/react-tabs` for PlaylistTabs and similar tab UIs.

---

## 2. Design System Refactor: Pros and Cons

### Pros of Refactoring to a Design System

| Benefit | Description |
|--------|-------------|
| **Consistency** | Single source of truth for spacing, colors, typography, and component behavior. Reduces visual and UX drift. |
| **Reduced Duplication** | Eliminates duplicate implementations (e.g., ChipInput in PlaylistDisplay vs. shared ChipInput). |
| **Easier Maintenance** | Fix bugs and accessibility issues in one place. |
| **Faster Development** | New features use existing primitives instead of rebuilding patterns. |
| **AI Agent Alignment** | Clear rules and components make it easier for Cursor agents to produce consistent code. |
| **Documentation** | Centralized docs for components, variants, and usage. |
| **Testing** | Shared components can be tested in isolation. |

### Cons of Refactoring to a Design System

| Drawback | Description |
|----------|-------------|
| **Upfront Effort** | Significant refactor to extract and standardize components. |
| **Migration Risk** | Changing many components at once can introduce regressions. |
| **Abstraction Overhead** | Over-abstracting can make simple cases harder (e.g., one-off layouts). |
| **Design System Maintenance** | Requires ongoing upkeep as patterns evolve. |
| **Potential Over-Engineering** | Small teams may not need a full design system. |

### Recommendation

**Proceed with the refactor.** The codebase already shows duplication (ChipInput, dialog patterns) and repeated class strings. A lightweight design system—focused on primitives, not a full design system—will pay off quickly.

---

## 3. Using vs. Not Using Radix UI

### Option A: Refactor with Radix UI

| Pros | Cons |
|------|------|
| Strong accessibility for complex widgets | Additional dependency and learning |
| Less custom code for dialogs, menus, tabs | Must style all primitives |
| Battle-tested behavior (focus, keyboard, ARIA) | Slightly larger bundle (mitigated by tree-shaking) |
| Composable, flexible primitives | Radix release cycle to monitor |

### Option B: Refactor without Radix UI

| Pros | Cons |
|------|------|
| No new dependencies | Need to implement focus trap, ARIA, keyboard nav manually |
| Full control over behavior | Higher risk of accessibility gaps |
| Simpler mental model | More custom code to maintain |
| Smaller surface area | Reinventing patterns Radix already solves |

### Recommendation

**Use Radix for complex interactive primitives.** The current Modal and dialogs lack robust focus trapping and full keyboard support. Radix Dialog, Popover, and Tabs would improve accessibility and reduce custom code. For Button, Input, Badge, and similar primitives, keep custom components styled with Tailwind and design tokens.

---

## 4. Identified UX/UI Patterns

### 4.1 Component Patterns

| Pattern | Current State | Recommendation |
|---------|---------------|----------------|
| **Modal/Dialog** | `Modal.tsx` exists but `SavePlaylistDialog`, `CollectionImportDialog`, `PlaylistImportDialog` implement their own overlays with different structure (backdrop, header, footer). | Standardize on `Modal` or Radix Dialog. All dialogs should share: backdrop, header with close, scrollable body, optional footer. |
| **ChipInput** | Two implementations: full `ChipInput` in `components/` and simplified inline `ChipInput` in `PlaylistDisplay.tsx`. | Single `ChipInput` with optional simplification (e.g., `simple` prop) or composition. |
| **Buttons** | Inline classes throughout. Primary: `bg-accent-primary hover:bg-accent-hover text-white`. Secondary: `bg-app-hover hover:bg-app-surface-hover text-app-primary border border-app-border`. | Create `Button` with variants: `primary`, `secondary`, `ghost`, `danger`. |
| **Inputs** | Similar but not identical: `px-3 py-2` vs `px-4 py-2`, `focus:outline-none focus:border-accent-primary` vs `focus:ring-1 focus:ring-accent-primary` vs `focus:ring-2 focus:ring-accent-primary`. | Single `Input` and `Textarea` with consistent focus styles. |
| **Form Labels** | Mix of `text-app-tertiary text-xs uppercase tracking-wider` and other approaches. | `Label` component with consistent typography. |
| **Cards/Surfaces** | `bg-app-surface rounded-sm border border-app-border` repeated. | `Card` or `Surface` primitive. |
| **Alerts** | `bg-yellow-500/10 border border-yellow-500/20` for warning, `bg-red-500/10` for error, `bg-green-500/10` for success. | `Alert` with variants: `warning`, `error`, `success`, `info`. |

### 4.2 Visual Tokens (Already in Use)

| Token | Purpose |
|-------|---------|
| `--app-bg` | Page background |
| `--app-primary` | Primary text |
| `--app-secondary` | Secondary/muted text |
| `--app-tertiary` | Tertiary/placeholder text |
| `--app-surface` | Elevated surfaces (cards, modals) |
| `--app-surface-hover` | Hover state for surfaces |
| `--app-border` | Borders |
| `--app-hover` | Hover background (e.g., list items) |
| `--accent-primary` | Primary accent (pink) |
| `--accent-secondary` | Darker accent |
| `--accent-hover` | Accent hover state |

### 4.3 Layout Patterns

| Pattern | Usage |
|---------|-------|
| **Container** | `container mx-auto px-4 max-w-6xl` (Navigation) |
| **Section spacing** | `space-y-4`, `space-y-6`, `p-4`, `p-6` |
| **Flex gap** | `flex items-center gap-2`, `gap-3`, `gap-4` |
| **Responsive** | `hidden md:flex`, `md:px-6`, `text-2xl md:text-3xl` |

### 4.4 Interaction Patterns

| Pattern | Current State |
|---------|---------------|
| **Close on Escape** | Implemented in Modal, Navigation (mobile menu). Dialogs vary. |
| **Click outside to close** | Modal: yes. Some dialogs: yes (backdrop click). |
| **Body scroll lock** | Modal and Navigation: yes. Some dialogs: inconsistent. |
| **Focus management** | Basic (manual). No focus trap or restore in modals. |
| **Keyboard navigation** | ChipInput: Enter add, Escape close. No arrow-key navigation in dropdowns. |

### 4.5 Typography Patterns

| Pattern | Class | Usage |
|---------|-------|-------|
| **Section title** | `text-app-primary text-lg font-semibold` | Modal/dialog headers |
| **Label** | `text-app-tertiary text-xs uppercase tracking-wider` | Form labels |
| **Body** | `text-app-primary text-sm` | General content |
| **Muted** | `text-app-secondary text-sm` | Helper text |
| **Nav** | `text-sm font-medium uppercase tracking-wider` | Navigation items |

---

## 5. Proposed Design System Structure

```
src/
├── design-system/
│   ├── components/           # Primitives
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Textarea.tsx
│   │   ├── Label.tsx
│   │   ├── Card.tsx
│   │   ├── Alert.tsx
│   │   ├── Modal.tsx         # Or @radix-ui/react-dialog wrapper
│   │   ├── ChipInput.tsx
│   │   └── ...
│   ├── tokens/               # Design tokens (if needed beyond globals.css)
│   │   └── index.ts
│   └── README.md             # Usage docs
```

### Suggested Component API Examples

```tsx
// Button
<Button variant="primary" size="md" disabled>Save</Button>
<Button variant="secondary" leftIcon={<X />}>Cancel</Button>

// Input
<Input label="Title" value={title} onChange={setTitle} error={errors.title} />

// Modal (or Radix Dialog wrapper)
<Modal open={isOpen} onClose={onClose} title="Save Playlist">
  <Modal.Body>...</Modal.Body>
  <Modal.Footer>...</Modal.Footer>
</Modal>

// Alert
<Alert variant="warning" title="Conflict">A collection with this name exists.</Alert>
```

---

## 6. Potential Cursor Rules for Design System Usage

These rules help Cursor agents use the design system consistently and avoid reintroducing ad-hoc patterns.

### 6.1 Rule: Design System Components

**File**: `.cursor/rules/design-system-components.mdc`

```markdown
# Design System Components

When implementing UI:

1. **Use design system primitives** from `src/design-system/components/`:
   - `Button` for all buttons (never raw `<button>` with inline Tailwind)
   - `Input` and `Textarea` for form fields
   - `Label` for form labels
   - `Card` or `Surface` for elevated content
   - `Alert` for warnings, errors, success messages
   - `Modal` (or Dialog) for overlay dialogs

2. **Button variants**: Use `variant="primary"` for primary actions, `variant="secondary"` for cancel/secondary, `variant="ghost"` for low-emphasis.

3. **Do not** duplicate component logic. If a pattern exists in the design system, use it. If it doesn't, propose adding it to the design system first.

4. **Do not** inline repeated class strings (e.g., `bg-accent-primary hover:bg-accent-hover text-white`). Use the design system component.
```

### 6.2 Rule: Design Tokens

**File**: `.cursor/rules/design-tokens.mdc`

```markdown
# Design Tokens

When styling components:

1. **Colors**: Use semantic tokens, not raw colors:
   - `text-app-primary`, `text-app-secondary`, `text-app-tertiary`
   - `bg-app-bg`, `bg-app-surface`, `bg-app-hover`
   - `border-app-border`
   - `bg-accent-primary`, `hover:bg-accent-hover` for accent actions

2. **Do not** use arbitrary colors (e.g., `#e91e63`, `rgb(...)`) in components. Use Tailwind classes that map to `globals.css` variables.

3. **Radius**: Use `rounded-sm` for consistent border radius (maps to `--radius`).

4. **Spacing**: Prefer `gap-2`, `gap-3`, `gap-4`, `p-4`, `p-6` for consistency.
```

### 6.3 Rule: Accessibility

**File**: `.cursor/rules/accessibility.mdc`

```markdown
# Accessibility

1. **Interactive elements**: Always include `aria-label` for icon-only buttons.

2. **Modals/Dialogs**: Use the design system Modal/Dialog component (which uses Radix or implements focus trap). Do not create custom modal overlays.

3. **Forms**: Associate labels with inputs via `htmlFor`/`id` or use the design system `Label` and `Input` components.

4. **Keyboard**: Ensure Escape closes overlays, Enter submits forms. Use design system components for complex interactions (dropdowns, menus) to inherit keyboard behavior.
```

### 6.4 Rule: No Duplicate Implementations

**File**: `.cursor/rules/no-duplicate-components.mdc`

```markdown
# No Duplicate Component Implementations

1. **Before creating a new component** that resembles an existing one (e.g., chip input, dialog, dropdown), check:
   - `src/design-system/components/`
   - `src/components/` for shared components

2. **If a similar component exists**: Extend it with props or composition. Do not create a parallel implementation.

3. **If creating a new primitive**: Add it to the design system and document it in `src/design-system/README.md`.
```

### 6.5 Rule: Dialog/Modal Consistency

**File**: `.cursor/rules/dialog-patterns.mdc`

```markdown
# Dialog and Modal Patterns

1. **All overlays** (confirmation dialogs, forms in overlays, imports) must use the design system `Modal` or `Dialog` component.

2. **Structure**: Header (title + close), scrollable body, optional footer with actions.

3. **Do not** implement custom backdrop, body scroll lock, or Escape handling. The design system handles this.

4. **Footer actions**: Primary action on the right, Cancel/secondary on the left. Use `Button variant="primary"` and `Button variant="secondary"`.
```

---

## 7. Migration Phases

### Phase 1: Foundation (Design System Setup)

1. Create `src/design-system/` structure.
2. Extract `Button`, `Input`, `Label`, `Card`, `Alert` from existing patterns.
3. Add design system README.
4. Add Cursor rules.

### Phase 2: Modal/Dialog Consolidation

1. Add `@radix-ui/react-dialog` (or enhance existing `Modal`).
2. Migrate `SavePlaylistDialog`, `CollectionImportDialog`, `PlaylistImportDialog` to use shared Modal/Dialog.
3. Remove duplicate overlay logic.

### Phase 3: ChipInput and Form Components

1. Consolidate ChipInput (remove duplicate from PlaylistDisplay).
2. Migrate forms to use `Input`, `Textarea`, `Label`.

### Phase 4: Broader Component Migration

1. Replace inline button/input classes across components.
2. Introduce `Alert` for warning/error/success blocks.
3. Introduce `Card` for surface patterns.

---

## 8. References

- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Radix UI Accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)
- [shadcn/ui](https://ui.shadcn.com/) – Example of Radix + Tailwind design system
- [ARCHITECTURE.md](./ARCHITECTURE.md) – Current app architecture
- [globals.css](../src/app/globals.css) – Current theme tokens
- [tailwind.config.ts](../tailwind.config.ts) – Current Tailwind config
