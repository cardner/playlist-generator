# Design System

Reusable UI primitives for the AI Playlist Generator. Use these components throughout the app for consistent styling and behavior.

## Components

### Button

```tsx
import { Button } from "@/design-system/components";

<Button variant="primary">Save</Button>
<Button variant="secondary" leftIcon={<X />}>Cancel</Button>
<Button variant="ghost" size="sm">Skip</Button>
<Button variant="danger">Delete</Button>
```

- **Variants**: `primary`, `secondary`, `ghost`, `danger`
- **Sizes**: `sm`, `md`
- **Props**: `leftIcon`, `rightIcon`, `disabled`, `className`

### Input

```tsx
import { Input } from "@/design-system/components";

<Input
  label="Title"
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  placeholder="Enter title..."
  error={errors.title}
/>
```

### Textarea

```tsx
import { Textarea } from "@/design-system/components";

<Textarea
  label="Description"
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={4}
/>
```

### Label

```tsx
import { Label } from "@/design-system/components";

<Label htmlFor="my-input">Field Name</Label>
```

### Card

```tsx
import { Card } from "@/design-system/components";

<Card padding="md">Content</Card>
<Card padding="lg">More content</Card>
```

- **Padding**: `none`, `sm`, `md`, `lg`

### Alert

```tsx
import { Alert } from "@/design-system/components";

<Alert variant="warning" title="Conflict">A collection with this name exists.</Alert>
<Alert variant="error">Something went wrong.</Alert>
<Alert variant="success">Import complete.</Alert>
```

- **Variants**: `warning`, `error`, `success`, `info`

### Dialog

```tsx
import { Dialog, Button } from "@/design-system/components";

<Dialog open={isOpen} onOpenChange={setIsOpen} title="Save Playlist">
  <Dialog.Body>Content here</Dialog.Body>
  <Dialog.Footer>
    <Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
    <Button variant="primary" onClick={handleSave}>Save</Button>
  </Dialog.Footer>
</Dialog>
```

### Popover

```tsx
import { Popover } from "@/design-system/components";

<Popover
  open={isOpen}
  onOpenChange={setIsOpen}
  trigger={<button>Open</button>}
>
  Popover content
</Popover>
```

### Tabs

```tsx
import { Tabs } from "@/design-system/components";
import { Music, Sparkles } from "lucide-react";

<Tabs
  value={activeTab}
  onValueChange={setActiveTab}
  items={[
    { value: "library", label: "From Library", icon: <Music className="size-4" /> },
    { value: "discovery", label: "Discover", icon: <Sparkles className="size-4" /> },
  ]}
/>
```

### ChipInput

```tsx
import { ChipInput } from "@/design-system/components";

<ChipInput
  values={genres}
  onChange={setGenres}
  placeholder="Add genres..."
  suggestions={availableGenres}
/>
```

Re-exported from `@/components/ChipInput`. See that component for full props (async search, error, showCounts, etc.).

## Design Tokens

Use semantic tokens from `globals.css`:

- `text-app-primary`, `text-app-secondary`, `text-app-tertiary`
- `bg-app-bg`, `bg-app-surface`, `bg-app-hover`
- `border-app-border`
- `bg-accent-primary`, `hover:bg-accent-hover`

## Adding New Components

1. Create the component in `src/design-system/components/`
2. Export from `src/design-system/components/index.ts`
3. Add unit tests in `src/__tests__/design-system/`
4. Document usage in this README
