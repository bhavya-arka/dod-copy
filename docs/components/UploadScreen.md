# UploadScreen

## Description

Home screen for the PACAF Airlift Demo with movement list upload and aircraft selection. Features a minimalist glass UI design with support for CSV, XLSX, and manual cargo entry.

## Props Interface

```typescript
interface UploadScreenProps {
  onFileUpload: (content: string, filename: string) => void; // Callback when file is uploaded
  onAircraftSelect: (type: AircraftType) => void;            // Aircraft type selection handler
  selectedAircraft: AircraftType;                             // Currently selected aircraft
  isProcessing: boolean;                                      // Show loading state
  error: string | null;                                       // Error message to display
}
```

## State Management

### Local State
```typescript
const [dragActive, setDragActive] = useState(false);           // Drag-drop highlight state
const [fileName, setFileName] = useState<string | null>(null); // Uploaded file name
const [showManualEntry, setShowManualEntry] = useState(false); // Manual entry modal visibility
const [xlsxError, setXlsxError] = useState<string | null>(null); // XLSX-specific errors
```

### Hooks Used
- `useState` - Form state and UI state management
- `useCallback` - Memoized drag/drop and file input handlers

## Frameworks/Libraries

| Library | Purpose |
|---------|---------|
| React | Core UI framework |
| Framer Motion | Enter/exit animations |
| XLSX (SheetJS) | Excel file parsing |

## Dependencies

### Components
- `ManualCargoEntry` - Modal for manual cargo item entry
- `escapeCSV` utility from `ManualCargoEntry`

### Types
- `AircraftType` from `../lib/pacafTypes`

## Key Functions

### `handleDrag(e: React.DragEvent)`
Manages drag-and-drop state for visual feedback during file dragging.

### `handleDrop(e: React.DragEvent)`
Handles file drop events, extracts the file, and passes to `handleFile`.

### `handleFileInput(e: React.ChangeEvent<HTMLInputElement>)`
Handles traditional file input selection.

### `convertXLSXtoCSV(arrayBuffer: ArrayBuffer): string`
Converts Excel files to CSV format using the SheetJS library.

### `handleFile(file: File)`
Main file processing function:
- Detects file type (XLSX/XLS vs CSV/JSON)
- For Excel: Uses FileReader with ArrayBuffer and converts to CSV
- For CSV/JSON: Uses FileReader with text encoding
- Handles errors gracefully with user-friendly messages

### `handleManualSubmit(items: CargoItem[])`
Converts manually entered cargo items to CSV format and triggers upload.

## Supported File Types

| Extension | Processing |
|-----------|------------|
| `.csv` | Direct text parsing |
| `.json` | Direct text parsing |
| `.xlsx` | Convert to CSV via SheetJS |
| `.xls` | Convert to CSV via SheetJS |

## Aircraft Options

| Aircraft | Pallet Positions | Payload |
|----------|------------------|---------|
| C-17 Globemaster III | 18 | 170,900 lb |
| C-130H/J Hercules | 6 | 42,000 lb |

## Usage Example

```tsx
import UploadScreen from './components/UploadScreen';

function UploadPage() {
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftType>('C-17');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = (content: string, filename: string) => {
    setIsProcessing(true);
    // Process the file content
    processMovementList(content, filename)
      .catch(err => setError(err.message))
      .finally(() => setIsProcessing(false));
  };

  return (
    <UploadScreen
      onFileUpload={handleUpload}
      onAircraftSelect={setSelectedAircraft}
      selectedAircraft={selectedAircraft}
      isProcessing={isProcessing}
      error={error}
    />
  );
}
```

## UI Features

- **Drag-and-drop zone**: Visual feedback during file drag
- **File input**: Hidden input triggered by clicking drop zone
- **Aircraft selection cards**: Visual selection with ring highlight
- **Processing indicator**: Animated spinner during file processing
- **Error display**: Red-styled error card with icon
- **Manual entry link**: Opens modal for manual cargo entry
- **Template download**: Placeholder for CSV template download
