# **Turborepo Monorepo Refactor Specification**

This document defines the full specification for refactoring the current application into a **Turborepo monorepo** with modernized frontend + backend, upgraded UI system, and full documentation standards optimized for **Replit Builder** and **Anthropic models**.

---

## **1. Monorepo Structure (Turborepo)**

```
/
├── apps/
│   ├── web/            # React + TypeScript + Vite + Tailwind frontend
│   └── server/         # Express.js + TypeScript backend
│
├── packages/
│   ├── ui/             # Shared UI components (optional)
│   ├── config/         # Shared tsconfig, tailwind, eslint configs
│   └── utils/          # Shared utility functions
│
├── docs/               # Documentation (per-feature markdown files)
│   ├── feature-a.md
│   ├── feature-b.md
│   └── ...
│
├── turbo.json          # Turborepo configuration
└── package.json        # root workspace config
```

### **Turborepo Requirements**

* Enable incremental builds and caching.
* Set up pipelines: `build`, `dev`, `lint`, `test`.
* Ensure shared TypeScript configs (`packages/config/*`).

---

## **2. Frontend Specification (apps/web)**

### **Modern React Requirements**

* Use **React TypeScript** with **function components only**.
* Use **React Context API** for global state — no prop drilling.
* Use **modular context providers** under `src/contexts/`.
* Use **React Router v6+** for clear routing structure.
* Use **custom hooks** to encapsulate logic.
* Use **Suspense + lazy()** for route-based code splitting.
* Use **TanStack Query (react-query)** where applicable for async state.
* Fully typed components with clear interfaces.
* Colocate components + styles + tests.
* Avoid unnecessary re-renders using memoization (`React.memo`, `useMemo`, `useCallback`) when appropriate.
* Use **Error Boundaries** for critical UI isolation.

### **3D Component Requirements**

* Any 3D-related features must:

  * Use **react-three-fiber** or similar if applicable.
  * Separate rendering logic from UI logic.
  * Use **`useFrame`** efficiently with cleanup to avoid leaks.
  * Optimize mesh and texture loading (compression, DRACO, lazy loading).
  * Maintain clarity and readability — minimal clutter.
  * Provide clear camera controls and smooth transitions.
  * Use dedicated folder `src/3d/` for all 3D components.

### **Folder Structure**

````
/apps/web/
├── src/
│   ├── components/
│   ├── contexts/         # React context providers
│   ├── routes/           # central routing definitions
│   ├── pages/
│   ├── layouts/
│   ├── hooks/
│   ├── 3d/               # optimized 3D components
│   ├── lib/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css         # Tailwind + custom theme
└── vite.config.ts
``` (apps/web)**

### **Framework & Tooling**
- **React + TypeScript**
- **Vite** (fast dev + build)
- **TailwindCSS** (with custom theme in one index.css)

### **Folder Structure**
````

/apps/web/
├── src/
│   ├── components/
│   ├── pages/
│   ├── layouts/
│   ├── hooks/
│   ├── lib/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css       # Tailwind + custom theme
└── vite.config.ts

```

### **UI Requirements**
- Minimalist, glassy, fluid UI.
- White backgrounds, soft neutral tones.
- High readability: black or near-black text.
- Subtle shadows, rounded edges, transparency layers.
- Enhanced accessibility & contrast.
- Make components reusable & documented.

### **Tailwind Customization (index.css)**
- Declare theme extensions: colors, shadows, radius.
- Define global smoothing:
  - fluid spacing scales
  - improved typography presets
  - custom glass effect utility (backdrop-blur + opacity)

---

## **3. Backend Specification (apps/server)**

### **Tech Stack**
- **Node.js (Express)**
- **TypeScript**
- Optional: Firebase / Firestore / Prisma / PostgreSQL depending on current app config.

### **Folder Structure**
```

/apps/server/
├── src/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middleware/
│   ├── utils/
│   ├── app.ts
│   └── index.ts
└── tsconfig.json

```

### **API Requirements**
- Fully typed route handlers.
- Use DTO-style function signatures.
- Consistent error models.
- Add structured logging.
- Add CORS, compression, helmet.

---

## **4. Documentation Standards (Optimized for Replit Builder + Anthropic Models)**

Every **feature**, **module**, **component**, and **function** must have a corresponding Markdown file in `/docs`.

### **Each Markdown Spec File Must Include:**

#### **1. Overview**
- Purpose
- Where it fits in the architecture

#### **2. API / Component Signature**
- TypeScript signature
- Parameter definitions
- Return types

#### **3. Usage Examples**
- Minimal examples
- Expanded examples

#### **4. Internal Logic Explanation**
- Step-by-step explanation of what the function does
- All side effects
- Edge cases

#### **5. File Locations**
- Direct file paths inside the monorepo

#### **6. Dependencies**
- Internal packages
- External libraries

#### **7. Notes for Replit Builder / Anthropic**
- Include deterministic explanations
- List clear constraints
- Structured formatting for parsers

---

## **5. UI Component Documentation Template (for /docs)**
```

# Component Name

## Overview

Short description of purpose.

## Props

| Prop | Type | Required | Description |
| ---- | ---- | -------- | ----------- |

## Usage

```tsx
<ComponentName propA="..." />
```

## Behavior Details

Explain step-by-step how the component functions.

## File Location

`packages/ui/components/ComponentName.tsx`

## Dependencies

* Tailwind classes
* Utilities (if any)

```

---

## **6. Backend Function Documentation Template**
```

# Function Name

## Purpose

Explain what this function accomplishes.

## Signature

```ts
function example(param: string): Promise<ResponseType>
```

## Parameters

| Name | Type | Description |
| ---- | ---- | ----------- |

## Returns

Describe return value structure.

## Example

```ts
await example("value");
```

## Logic Breakdown

Step-by-step explanation.

## File Path

`apps/server/src/services/example.ts`

```

---

## **7. Build & Dev Commands**

### **Root**
```

yarn dev         # runs both frontend + backend
yarn build       # builds all apps

```

### **Frontend**
```

yarn dev -F web

```

### **Backend**
```

yarn dev -F server

```

---

## **8. Deployment Expectations**
- Monorepo should deploy cleanly to Replit.
- Both apps must have independent build outputs.
- Must support Docker-based deployment.

---

## **8. Naming & File Organization Standards**

### **General Naming Rules**
- Use **consistent, descriptive names** for files, variables, components, and functions.
- Follow modern conventions:
  - Components: `PascalCase` (e.g., `UserCard.tsx`)
  - Hooks: `useSomething.ts`
  - Contexts: `SomethingContext.ts`, `SomethingProvider.tsx`
  - Utility functions: `camelCase`
  - Constant files: `SNAKE_CASE.ts`
- Avoid ambiguous names like `data`, `stuff`, `util`, `helper` — be explicit.

### **File-Splitting Requirements**
- Every component gets:
  - Its own directory if it has children, styles, or tests.
  - `index.ts` re-exports for cleaner imports.
- Split large components:
  - Separate UI layout from logic using hooks.
  - Move reusable logic to `/hooks`.
  - Move API calls to `/lib` or service modules.
  - Move types to `/types`.
- Separate responsibility layers:
  - UI Components (presentation)
  - Context Providers (state)
  - Hooks (logic)
  - Services (external interaction)
  - Pages (route-level composition)

### **Maintainability Standards**
- No file should exceed **300–400 lines** — refactor when needed.
- Prefer **composition over inheritance**.
- Avoid deeply nested trees — break down UI.
- Never store unrelated logic inside the same file.
- Use **barrel files** (`index.ts`) to simplify imports.
- Keep folder structure shallow and meaningful.

---

## **9. Deliverables**
- Fully refactored Turborepo project
- Updated UI
- Tailwind custom theme
- Full Markdown documentation for all modules
- Build + dev + deployment workflows**
- Fully refactored Turborepo project
- Updated UI
- Tailwind custom theme
- Full Markdown documentation for all modules
- Build + dev + deployment workflows

---

## **End of Spec Sheet**

```
