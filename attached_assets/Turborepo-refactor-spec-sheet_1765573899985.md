```markdown
# 🧱 Full Refactor Specification — Turborepo + React + Tailwind + TypeScript + Drizzle ORM + Replit Setup

> **Goal:**  
> Refactor this project into a clean, modular **Turborepo** with:
> - React + Tailwind + TypeScript frontend  
> - Node.js + Express + TypeScript backend  
> - Drizzle ORM (with temporary Replit DB, future AWS RDS)  
> - JWT authentication  
> - Proper `.env` management  
> - Replit Builder–ready configuration

---

## 🚀 1. Monorepo Structure

```

/
├── apps/
│   ├── client/                # React + Tailwind + TypeScript frontend
│   └── server/                # Node.js + Express + TypeScript backend
├── packages/
│   ├── ui/                    # Shared UI components
│   ├── utils/                 # Shared helpers
│   └── config/                # ESLint, tsconfig, prettier
├── .replit
├── replit.nix
├── .env
├── turbo.json
├── package.json
├── tsconfig.json
└── README.md

````

---

## 🧩 2. Environment Variables

### Root `.env`
```env
# JWT
JWT_SECRET=supersecretkey
JWT_EXPIRES=1h

# Temporary Replit DB
REPLIT_DB_URL=https://kv.replit.com/v0/your-db-key

# Future AWS RDS
DATABASE_URL=postgresql://user:password@rds-host:5432/mydb

# Ports
CLIENT_PORT=5173
SERVER_PORT=3000
````

### Client `.env.local`

```env
VITE_API_URL=http://localhost:3000/api
```

### Server `.env.local`

```env
PORT=3000
```

---

## 📦 3. Root Package

### `package.json`

```json
{
  "name": "my-turbo-app",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "start": "turbo run start"
  },
  "devDependencies": {
    "turbo": "^1.10.0",
    "typescript": "^5.7.0"
  }
}
```

---

## 🎨 4. Client (Frontend)

### `apps/client/package.json`

```json
{
  "name": "client",
  "version": "1.0.0",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "start": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "axios": "^1.6.7"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.21",
    "autoprefixer": "^10.4.16",
    "vite": "^5.0.0"
  }
}
```

### Tailwind Setup

`apps/client/tailwind.config.ts`

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

---

## ⚙️ 5. Server (Backend)

### `apps/server/package.json`

```json
{
  "name": "server",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "jsonwebtoken": "^9.0.0",
    "drizzle-orm": "^0.30.0",
    "@vercel/postgres": "^0.9.0",
    "dotenv": "^16.0.0",
    "cors": "^2.8.5",
    "replit-database": "^2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "ts-node": "^10.9.1",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.5"
  }
}
```

---

## 🧠 6. Drizzle ORM Setup

### `apps/server/src/db/drizzle.config.ts`

```ts
import { drizzle } from "drizzle-orm/vercel-postgres";
import { sql } from "@vercel/postgres";

export const db = drizzle(sql);
```

### `apps/server/src/db/schema.ts`

```ts
import { pgTable, text, serial } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  password: text("password").notNull(),
});
```

### `apps/server/src/utils/replit-db.ts`

```ts
import Database from "replit-database";
export const replitDb = new Database(process.env.REPLIT_DB_URL);
```

---

## 🔐 7. JWT Auth + Express Setup

### `apps/server/src/middleware/auth.ts`

```ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    (req as any).user = jwt.verify(token, process.env.JWT_SECRET!);
    next();
  } catch {
    res.status(403).json({ error: "Invalid token" });
  }
}
```

### `apps/server/src/routes/auth.ts`

```ts
import express from "express";
import jwt from "jsonwebtoken";
import { replitDb } from "../utils/replit-db.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  // Example validation logic (temporary)
  const user = await replitDb.get(username);
  if (!user || user.password !== password) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ username }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES,
  });

  res.json({ token });
});

router.post("/signup", async (req, res) => {
  const { username, password } = req.body;
  await replitDb.set(username, { username, password });
  res.json({ message: "User created" });
});

export default router;
```

### `apps/server/src/index.ts`

```ts
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import { authMiddleware } from "./middleware/auth.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/secure", authMiddleware, (req, res) => {
  res.json({ message: "Authorized", user: (req as any).user });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));
```

---

## ⚡ 8. Turborepo Configuration

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "dev": {
      "dependsOn": ["^dev"],
      "cache": false
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "start": {
      "dependsOn": ["build"]
    }
  }
}
```

---

## 🧪 9. Run Commands

### All apps

```bash
npm run dev
```

### Individual apps

```bash
cd apps/client && npm run dev
cd apps/server && npm run dev
```

---

## 🧰 10. Replit Configuration

### `.replit`

```ini
run = "npm run dev"
entrypoint = "apps/server/src/index.ts"

[nix]
require = true

[env]
NODE_ENV = "development"
```

### `replit.nix`

```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.python3
    pkgs.openssl
    pkgs.git
  ];

  # Turbo / Vite builds faster with these tools available
  env = {
    PATH = "${pkgs.nodejs_22}/bin:${pkgs.git}/bin:${pkgs.openssl}/bin";
  };
}
```

This configuration will:

* Install **Node.js 22**, **Turbo**, and **Vite**
* Automatically launch both frontend and backend with `npm run dev`
* Enable environment variables from `.env`
* Support **Drizzle ORM** and **Replit DB** seamlessly inside Replit

---

## ✅ 11. Recap

| Feature                                | Status |
| -------------------------------------- | ------ |
| Turbo Monorepo                         | ✅      |
| React + Tailwind + TypeScript Frontend | ✅      |
| Node + TypeScript Backend              | ✅      |
| JWT Auth                               | ✅      |
| Drizzle ORM + Replit DB                | ✅      |
| AWS RDS Ready                          | ✅      |
| Proper Envs                            | ✅      |
| Replit + Nix Config                    | ✅      |
