# ManualCargoEntry Component

## Description
Modal form interface for manually adding cargo items one by one. Supports both cargo items with dimensions/weight and PAX-only entries. Includes validation and error display.

## Props Interface

```typescript
interface ManualCargoEntryProps {
  onSubmit: (items: CargoItem[]) => void;  // Callback with validated items
  onCancel: () => void;                     // Callback to close modal
}
```

## Exported Types

```typescript
interface CargoItem {
  id: string;
  description: string;
  length: string;
  width: string;
  height: string;
  weight: string;
  leadTcn: string;
  pax: string;
  isPaxOnly: boolean;
}
```

## State Management

### Hooks Used
- `useState` - Items list and validation errors

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `items` | `CargoItem[]` | List of cargo items being entered |
| `errors` | `Record<string, string[]>` | Validation errors per item |

## Frameworks/Libraries Used
- **React** - Core UI framework
- **Framer Motion** - Modal and item animations
- **Lucide React** - Icons (X, Plus, Trash2)

## Constants

```typescript
const EMPTY_ITEM: Omit<CargoItem, 'id'> = {
  description: '',
  length: '',
  width: '',
  height: '',
  weight: '',
  leadTcn: '',
  pax: '',
  isPaxOnly: false
};
```

## Key Functions

| Function | Purpose |
|----------|---------|
| `addItem()` | Adds new empty cargo item |
| `removeItem(id)` | Removes item (minimum 1 required) |
| `updateItem(id, field, value)` | Updates specific item field |
| `validateItems()` | Validates all items, returns boolean |
| `handleSubmit()` | Validates and submits if valid |
| `escapeCSV(value)` | Escapes string for CSV export |

### Validation Rules
**For regular cargo:**
- Description required
- Length, Width, Height required (positive numbers)
- Weight required (positive number)

**For PAX-only:**
- Description required
- PAX count required (1-500)

## Usage Example

```tsx
import ManualCargoEntry, { CargoItem } from './components/ManualCargoEntry';

function UploadScreen() {
  const [showManualEntry, setShowManualEntry] = useState(false);

  const handleCargoSubmit = (items: CargoItem[]) => {
    console.log('Submitted items:', items);
    // Process items for load planning
    setShowManualEntry(false);
  };

  return (
    <>
      <button onClick={() => setShowManualEntry(true)}>
        Manual Cargo Entry
      </button>
      
      {showManualEntry && (
        <ManualCargoEntry
          onSubmit={handleCargoSubmit}
          onCancel={() => setShowManualEntry(false)}
        />
      )}
    </>
  );
}
```

## Form Fields

### All Items
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `description` | text | Yes | Cargo description (e.g., "MHU-226 W/ BINS/EM") |
| `isPaxOnly` | checkbox | No | Toggle for personnel-only entry |

### Cargo Items (isPaxOnly = false)
| Field | Type | Required | Placeholder |
|-------|------|----------|-------------|
| `length` | number | Yes | 108 (inches) |
| `width` | number | Yes | 88 (inches) |
| `height` | number | Yes | 96 (inches) |
| `weight` | number | Yes | 5000 (lbs) |
| `leadTcn` | text | No | FYSHP... |

### PAX-Only Items (isPaxOnly = true)
| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `pax` | number | Yes | 1-500 personnel |

## UI Features
- Modal overlay with backdrop blur
- Animated item cards
- Error highlighting on invalid items
- Add item button with dashed border
- Item count display
- Responsive grid layout (1/2/4 columns)
