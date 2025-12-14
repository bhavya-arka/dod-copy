# EditableSpreadsheet

## Description

A versatile spreadsheet component providing Excel-like inline cell editing for cargo manifests and ICODES data. Supports keyboard navigation, multi-cell selection, various cell types (text, number, select, checkbox), and data validation.

## Props Interface

```typescript
interface EditableSpreadsheetProps {
  columns: SpreadsheetColumn[];                    // Column definitions
  data: SpreadsheetRow[];                          // Row data
  onDataChange?: (data: SpreadsheetRow[]) => void; // Callback when data changes
  onRowAdd?: () => SpreadsheetRow;                 // Factory function for new rows
  onRowDelete?: (id: string | number) => void;    // Callback when row is deleted
  title?: string;                                  // Optional title displayed in toolbar
  editable?: boolean;                              // Enable editing mode (default: true)
  showToolbar?: boolean;                           // Show toolbar (default: true)
  showRowNumbers?: boolean;                        // Show row numbers (default: true)
  stickyHeader?: boolean;                          // Sticky header row (default: true)
  maxHeight?: string;                              // Max container height (default: '600px')
  emptyMessage?: string;                           // Message when no data (default: 'No data available')
}
```

## Exported Types

```typescript
export interface SpreadsheetColumn {
  key: string;                        // Unique column identifier
  label: string;                      // Display label
  width?: number;                     // Column width in pixels
  type?: 'text' | 'number' | 'select' | 'checkbox';  // Cell type
  options?: string[];                 // Options for select type
  editable?: boolean;                 // Whether column is editable (default: true)
  format?: (value: any) => string;    // Custom value formatter
  validate?: (value: any) => boolean; // Custom validation function
}

export interface SpreadsheetRow {
  id: string | number;                // Unique row identifier
  [key: string]: any;                 // Dynamic cell values
}
```

## State Management

### Hooks Used
- `useState` - UI and editing state
- `useCallback` - Memoized event handlers
- `useRef` - Input and table element references
- `useEffect` - Data sync and input focus
- `useMemo` - Computed editable column count

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `editMode` | `boolean` | Whether editing mode is active |
| `editingCell` | `CellPosition \| null` | Currently editing cell position |
| `editValue` | `string` | Current edit input value |
| `selectedCells` | `Set<string>` | Set of selected cell keys |
| `localData` | `SpreadsheetRow[]` | Local copy of data for editing |

### Internal Types
```typescript
interface CellPosition {
  rowIndex: number;
  colKey: string;
}
```

## Frameworks/Libraries Used

| Library | Purpose |
|---------|---------|
| React | Core framework |
| framer-motion | Animations (motion) |
| lucide-react | Icons (Edit2, Save, X, Plus, Trash2, Download, Copy, Table, Grid3X3) |

## Key Functions

| Function | Purpose |
|----------|---------|
| `getCellKey(rowIndex, colKey)` | Generates unique cell identifier |
| `handleCellClick(rowIndex, colKey, e)` | Handles cell selection with Ctrl/Meta for multi-select |
| `handleCellDoubleClick(rowIndex, colKey)` | Enters cell editing mode |
| `handleCellChange(value)` | Updates edit input value |
| `commitEdit()` | Saves edit and updates data |
| `cancelEdit()` | Discards edit changes |
| `handleKeyDown(e)` | Handles keyboard navigation (Enter, Escape, Tab) |
| `handleAddRow()` | Adds new row using factory function |
| `handleDeleteRow(id)` | Removes row by ID |
| `handleCopySelected()` | Copies selected cells to clipboard |
| `toggleEditMode()` | Toggles between view and edit mode |
| `formatCellValue(value, column)` | Formats cell value for display |

## Keyboard Controls

| Key | Action |
|-----|--------|
| Enter | Commit edit and exit cell |
| Escape | Cancel edit and exit cell |
| Tab | Commit edit, move to next editable cell |
| Shift+Tab | Commit edit, move to previous editable cell |
| Ctrl/Cmd+Click | Toggle cell in multi-selection |

## Cell Types

| Type | Behavior |
|------|----------|
| `text` | Standard text input |
| `number` | Numeric input with parsing |
| `select` | Dropdown selection (options required) |
| `checkbox` | Boolean toggle checkbox |

## Usage Example

```tsx
import EditableSpreadsheet, { SpreadsheetColumn, SpreadsheetRow } from './components/EditableSpreadsheet';

function CargoManifest() {
  const columns: SpreadsheetColumn[] = [
    { key: 'position', label: 'Pos', type: 'number', width: 60, editable: false },
    { key: 'tcn', label: 'TCN', width: 120 },
    { key: 'description', label: 'Description', width: 200 },
    { key: 'weight', label: 'Weight (lbs)', type: 'number', width: 100,
      format: (v) => v?.toLocaleString() || '-',
      validate: (v) => v > 0 && v < 100000
    },
    { key: 'hazmat', label: 'HAZMAT', type: 'checkbox', width: 80 },
  ];

  const [data, setData] = useState<SpreadsheetRow[]>([
    { id: 1, position: 1, tcn: 'TCN001', description: 'Equipment', weight: 2500, hazmat: false },
    { id: 2, position: 2, tcn: 'TCN002', description: 'Supplies', weight: 1800, hazmat: true },
  ]);

  const handleAddRow = () => ({
    id: Date.now(),
    position: data.length + 1,
    tcn: '',
    description: '',
    weight: 0,
    hazmat: false,
  });

  return (
    <EditableSpreadsheet
      columns={columns}
      data={data}
      onDataChange={setData}
      onRowAdd={handleAddRow}
      onRowDelete={(id) => console.log('Deleted:', id)}
      title="Cargo Manifest"
      editable={true}
      showToolbar={true}
      showRowNumbers={true}
      stickyHeader={true}
      maxHeight="500px"
      emptyMessage="No cargo items"
    />
  );
}
```

## Features

1. **Inline Cell Editing** - Double-click to edit cells
2. **Multi-Cell Selection** - Ctrl/Cmd+click for multi-select
3. **Keyboard Navigation** - Tab through editable cells
4. **Row Operations** - Add and delete rows
5. **Copy to Clipboard** - Copy selected cells
6. **Custom Formatting** - Format functions per column
7. **Validation** - Custom validators per column
8. **Sticky Header** - Header stays visible on scroll
9. **Row Numbers** - Optional row numbering
10. **Cell Types** - Text, number, select, checkbox

## Toolbar Actions

In edit mode:
- **Copy** - Copy selected cells (when cells are selected)
- **Add Row** - Add new row (when onRowAdd provided)
- **Edit/Done** - Toggle edit mode

## Styling

- Glass-card style with neutral color palette
- Blue ring highlight for selected cells
- Edit mode indicator in footer
- Responsive with max-height scrolling
