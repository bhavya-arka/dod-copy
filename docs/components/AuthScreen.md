# AuthScreen

## Description

Authentication screen for user login and registration. Features a minimalist glass UI design with form validation and mode toggling between sign in and registration.

## Props Interface

```typescript
interface AuthScreenProps {
  onLogin: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onRegister: (email: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
}
```

## State Management

### Local State
```typescript
const [mode, setMode] = useState<'login' | 'register'>('login');     // Current form mode
const [email, setEmail] = useState('');                               // Email input
const [username, setUsername] = useState('');                         // Username (register only)
const [password, setPassword] = useState('');                         // Password input
const [confirmPassword, setConfirmPassword] = useState('');           // Password confirmation
const [error, setError] = useState<string | null>(null);              // Validation/API error
const [isLoading, setIsLoading] = useState(false);                    // Submit loading state
```

### Hooks Used
- `useState` - Form state and UI state management

## Frameworks/Libraries

| Library | Purpose |
|---------|---------|
| React | Core UI framework |
| Framer Motion | Entry animation |

## Dependencies

None - self-contained authentication form component.

## Key Functions

### `handleSubmit(e: React.FormEvent)`
Handles form submission for both login and registration:

**Registration Flow:**
1. Validates password match
2. Validates minimum password length (6 characters)
3. Calls `onRegister(email, username, password)`
4. Sets error if unsuccessful

**Login Flow:**
1. Calls `onLogin(email, password)`
2. Sets error if unsuccessful

Both flows:
- Set loading state during API call
- Clear error on new submission
- Handle unexpected errors

## Validation Rules

| Rule | Condition |
|------|-----------|
| Password match | `password === confirmPassword` (register only) |
| Password length | `password.length >= 6` (register only) |
| Required fields | HTML `required` attribute on all inputs |
| Email format | HTML `type="email"` validation |

## Form Fields

| Field | Mode | Type | Placeholder |
|-------|------|------|-------------|
| Email | Both | email | you@example.com |
| Username | Register | text | Your display name |
| Password | Both | password | •••••••• |
| Confirm Password | Register | password | •••••••• |

## Usage Example

```tsx
import AuthScreen from './components/AuthScreen';

function LoginPage() {
  const handleLogin = async (email: string, password: string) => {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    
    if (response.ok) {
      return { success: true };
    }
    
    const data = await response.json();
    return { success: false, error: data.message };
  };

  const handleRegister = async (email: string, username: string, password: string) => {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password }),
      credentials: 'include'
    });
    
    if (response.ok) {
      return { success: true };
    }
    
    const data = await response.json();
    return { success: false, error: data.message };
  };

  return (
    <AuthScreen
      onLogin={handleLogin}
      onRegister={handleRegister}
    />
  );
}
```

## UI Components

- **Logo**: Arka "A" logo with primary color background
- **Mode Toggle**: Pill-style tab switcher between Sign In and Register
- **Form Fields**: Glass-styled inputs with labels
- **Error Display**: Red-styled alert box for validation/API errors
- **Submit Button**: Primary button with loading spinner state
- **Footer**: Descriptive text about the application

## CSS Classes Used

| Class | Purpose |
|-------|---------|
| `glass-card` | Card with glass morphism effect |
| `glass-input` | Input with glass styling |
| `btn-primary` | Primary action button |
| `shadow-glass` | Glass-style shadow |
| `shadow-soft` | Subtle shadow for tabs |
| `gradient-mesh` | Background gradient pattern |
