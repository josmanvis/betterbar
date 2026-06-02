# BetterBar Extensions API

Extensions are third-party React components that render directly on the BetterBar dock. They live in `~/.betterbar/extensions/<name>/main.tsx`.

## Quick Start

Create `~/.betterbar/extensions/my-extension/main.tsx`:

```tsx
export const name = "My Extension";

export default function MyExtension() {
  return <span>Hello</span>;
}
```

Enable it in Settings → CONTENT → SECTIONS → Extensions, then toggle the extension on.

## File Structure

```
~/.betterbar/extensions/
  my-extension/
    main.tsx        # ← extension entry point (required)
```

## API

### Default Export (required)

Your default export must be a React component. It receives no props.

```tsx
export default function MyWidget() {
  return <div>...</div>;
}
```

### Named Exports

| Export   | Type     | Default | Description                              |
|----------|----------|---------|------------------------------------------|
| `name`   | `string` | dir name | Display name shown in Settings & tooltip |

```tsx
export const name = "My Widget";
```

### Styling

Use Tailwind classes. The bar uses a dark theme with these CSS variables:

| Variable         | Purpose                  |
|------------------|--------------------------|
| `--bb-accent`    | Accent color (user-set)   |
| `--bb-text`      | Primary text color        |
| `--bb-dim`       | Dim/muted text            |
| `--bb-mute`      | Very muted text           |
| `--bb-line`      | Border color              |
| `--bb-pane`      | Surface background        |

### Sizing

Your component renders inside a fixed-size container: `max(20px, barSize - 8px)` square. Keep your content compact — 9–11px text size is typical.

## Sample Extension

See `~/.betterbar/extensions/simple-weather/main.tsx` for a complete example that fetches weather data from Open-Meteo.
