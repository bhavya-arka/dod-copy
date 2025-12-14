# Storage Service Documentation

## Overview

The `storage.ts` file provides a Drizzle ORM-based data access layer for all persistent entities in the PACAF Airlift application. It implements the `IStorage` interface and provides user-scoped access to all data.

**File**: `apps/server/storage.ts`

## Architecture

- **ORM**: Drizzle ORM with PostgreSQL
- **Pattern**: Repository pattern with class-based implementation
- **Security**: All queries are user-scoped (multi-tenant isolation)
- **Authentication**: bcrypt for password hashing, crypto for session tokens

## Constants

```typescript
const SALT_ROUNDS = 10;           // bcrypt cost factor
const SESSION_EXPIRY_HOURS = 168; // 7 days
```

## Interface: IStorage

The `IStorage` interface defines all available storage operations.

---

## Auth Methods

### getUser

```typescript
getUser(id: number): Promise<User | undefined>
```

**Purpose**: Retrieve a user by ID.

**Parameters**:
- `id` - User's primary key

**Returns**: `User` object or `undefined` if not found

**Database Tables**: `users`

---

### getUserByEmail

```typescript
getUserByEmail(email: string): Promise<User | undefined>
```

**Purpose**: Find a user by email address.

**Parameters**:
- `email` - Email address to search

**Returns**: `User` object or `undefined`

**Database Tables**: `users`

---

### getUserByUsername

```typescript
getUserByUsername(username: string): Promise<User | undefined>
```

**Purpose**: Find a user by username.

**Parameters**:
- `username` - Username to search

**Returns**: `User` object or `undefined`

**Database Tables**: `users`

---

### createUser

```typescript
createUser(user: InsertUser): Promise<User>
```

**Purpose**: Create a new user with hashed password.

**Parameters**:
- `user` - Object containing `email`, `username`, `password`

**Returns**: Created `User` object with generated `id`

**Database Tables**: `users`

**Side Effects**:
- Hashes password with bcrypt before storing

---

### validatePassword

```typescript
validatePassword(email: string, password: string): Promise<User | null>
```

**Purpose**: Validate user credentials for login.

**Parameters**:
- `email` - User's email
- `password` - Plain text password to verify

**Returns**: `User` object if valid, `null` otherwise

**Database Tables**: `users`

**Side Effects**:
- Updates `last_login_at` timestamp on successful validation

---

### createSession

```typescript
createSession(userId: number): Promise<Session>
```

**Purpose**: Create a new authentication session.

**Parameters**:
- `userId` - ID of the user to create session for

**Returns**: `Session` object with token

**Database Tables**: `sessions`

**Side Effects**:
- Generates 32-byte random hex token
- Sets expiry to 7 days from creation

---

### getSession

```typescript
getSession(token: string): Promise<Session | undefined>
```

**Purpose**: Retrieve a valid (non-expired) session.

**Parameters**:
- `token` - Session token string

**Returns**: `Session` object or `undefined`

**Database Tables**: `sessions`

**Notes**: Only returns sessions where `expires_at > now()`

---

### deleteSession

```typescript
deleteSession(token: string): Promise<void>
```

**Purpose**: Delete a session (logout).

**Parameters**:
- `token` - Session token to delete

**Database Tables**: `sessions`

---

## Flight Plan Methods

All flight plan methods are user-scoped for multi-tenant isolation.

### getFlightPlans

```typescript
getFlightPlans(userId: number): Promise<FlightPlan[]>
```

**Purpose**: List all flight plans for a user.

**Parameters**:
- `userId` - Owner's user ID

**Returns**: Array of `FlightPlan` objects, ordered by `created_at` DESC

**Database Tables**: `flight_plans`

---

### getFlightPlan

```typescript
getFlightPlan(id: number, userId: number): Promise<FlightPlan | undefined>
```

**Purpose**: Get a specific flight plan.

**Parameters**:
- `id` - Flight plan ID
- `userId` - Owner's user ID

**Returns**: `FlightPlan` or `undefined`

**Database Tables**: `flight_plans`

---

### createFlightPlan

```typescript
createFlightPlan(plan: InsertFlightPlan): Promise<FlightPlan>
```

**Purpose**: Create a new flight plan.

**Parameters**:
- `plan` - Flight plan data including `user_id`, `name`, `allocation_data`, etc.

**Returns**: Created `FlightPlan` with generated ID

**Database Tables**: `flight_plans`

---

### updateFlightPlan

```typescript
updateFlightPlan(id: number, userId: number, data: Partial<InsertFlightPlan>): Promise<FlightPlan | undefined>
```

**Purpose**: Update an existing flight plan.

**Parameters**:
- `id` - Flight plan ID
- `userId` - Owner's user ID
- `data` - Partial update data

**Returns**: Updated `FlightPlan` or `undefined` if not found

**Database Tables**: `flight_plans`

**Side Effects**: Automatically updates `updated_at` timestamp

---

### deleteFlightPlan

```typescript
deleteFlightPlan(id: number, userId: number): Promise<void>
```

**Purpose**: Delete a flight plan.

**Parameters**:
- `id` - Flight plan ID
- `userId` - Owner's user ID

**Database Tables**: `flight_plans`

---

## Flight Schedule Methods

### getFlightSchedules

```typescript
getFlightSchedules(userId: number): Promise<FlightSchedule[]>
```

**Purpose**: List all flight schedules for a user.

**Database Tables**: `flight_schedules`

---

### getFlightSchedule

```typescript
getFlightSchedule(id: number, userId: number): Promise<FlightSchedule | undefined>
```

**Purpose**: Get a specific flight schedule.

**Database Tables**: `flight_schedules`

---

### getFlightSchedulesByPlanId

```typescript
getFlightSchedulesByPlanId(flightPlanId: number, userId: number): Promise<FlightSchedule[]>
```

**Purpose**: Get all schedules associated with a flight plan.

**Database Tables**: `flight_schedules`

---

### createFlightSchedule

```typescript
createFlightSchedule(schedule: InsertFlightSchedule): Promise<FlightSchedule>
```

**Purpose**: Create a new flight schedule.

**Database Tables**: `flight_schedules`

---

### deleteFlightSchedule

```typescript
deleteFlightSchedule(id: number, userId: number): Promise<void>
```

**Purpose**: Delete a flight schedule.

**Database Tables**: `flight_schedules`

---

### deleteFlightSchedulesByPlanId

```typescript
deleteFlightSchedulesByPlanId(flightPlanId: number, userId: number): Promise<void>
```

**Purpose**: Delete all schedules for a flight plan (used for bulk replacement).

**Database Tables**: `flight_schedules`

---

## Split Session Methods

### getSplitSessions

```typescript
getSplitSessions(userId: number): Promise<SplitSession[]>
```

**Purpose**: List all split sessions for a user.

**Database Tables**: `split_sessions`

---

### getSplitSession

```typescript
getSplitSession(id: number, userId: number): Promise<SplitSession | undefined>
```

**Purpose**: Get a specific split session.

**Database Tables**: `split_sessions`

---

### createSplitSession

```typescript
createSplitSession(session: InsertSplitSession): Promise<SplitSession>
```

**Purpose**: Create a new split session.

**Database Tables**: `split_sessions`

---

### updateSplitSession

```typescript
updateSplitSession(id: number, userId: number, data: Partial<InsertSplitSession>): Promise<SplitSession | undefined>
```

**Purpose**: Update a split session.

**Database Tables**: `split_sessions`

**Side Effects**: Automatically updates `updated_at` timestamp

---

### deleteSplitSession

```typescript
deleteSplitSession(id: number, userId: number): Promise<void>
```

**Purpose**: Delete a split session.

**Database Tables**: `split_sessions`

---

## Flight Node Methods

### getFlightNodes

```typescript
getFlightNodes(flightPlanId: number, userId: number): Promise<FlightNode[]>
```

**Purpose**: Get all nodes for a flight plan.

**Database Tables**: `flight_nodes`

---

### getFlightNode

```typescript
getFlightNode(id: number, userId: number): Promise<FlightNode | undefined>
```

**Purpose**: Get a specific flight node.

**Database Tables**: `flight_nodes`

---

### getFlightNodeChildren

```typescript
getFlightNodeChildren(parentNodeId: number, userId: number): Promise<FlightNode[]>
```

**Purpose**: Get child nodes of a parent node.

**Database Tables**: `flight_nodes`

---

### createFlightNode

```typescript
createFlightNode(node: InsertFlightNode): Promise<FlightNode>
```

**Purpose**: Create a new flight node.

**Database Tables**: `flight_nodes`

---

### updateFlightNode

```typescript
updateFlightNode(id: number, userId: number, data: Partial<InsertFlightNode>): Promise<FlightNode | undefined>
```

**Purpose**: Update a flight node.

**Database Tables**: `flight_nodes`

---

### deleteFlightNode

```typescript
deleteFlightNode(id: number, userId: number): Promise<void>
```

**Purpose**: Delete a flight node.

**Database Tables**: `flight_nodes`

---

## Flight Edge Methods

### getFlightEdges

```typescript
getFlightEdges(flightPlanId: number, userId: number): Promise<FlightEdge[]>
```

**Purpose**: Get all edges for a flight plan.

**Database Tables**: `flight_edges`

---

### getFlightEdge

```typescript
getFlightEdge(id: number, userId: number): Promise<FlightEdge | undefined>
```

**Purpose**: Get a specific flight edge.

**Database Tables**: `flight_edges`

---

### createFlightEdge

```typescript
createFlightEdge(edge: InsertFlightEdge): Promise<FlightEdge>
```

**Purpose**: Create a new flight edge.

**Database Tables**: `flight_edges`

---

### updateFlightEdge

```typescript
updateFlightEdge(id: number, userId: number, data: Partial<InsertFlightEdge>): Promise<FlightEdge | undefined>
```

**Purpose**: Update a flight edge.

**Database Tables**: `flight_edges`

---

### deleteFlightEdge

```typescript
deleteFlightEdge(id: number, userId: number): Promise<void>
```

**Purpose**: Delete a flight edge.

**Database Tables**: `flight_edges`

---

## Port Inventory Methods

### getPortInventory

```typescript
getPortInventory(flightPlanId: number, airbaseId: string, userId: number): Promise<PortInventory | undefined>
```

**Purpose**: Get inventory for a specific airbase in a flight plan.

**Database Tables**: `port_inventory`

---

### getPortInventories

```typescript
getPortInventories(flightPlanId: number, userId: number): Promise<PortInventory[]>
```

**Purpose**: Get all port inventories for a flight plan.

**Database Tables**: `port_inventory`

---

### upsertPortInventory

```typescript
upsertPortInventory(inventory: InsertPortInventory): Promise<PortInventory>
```

**Purpose**: Create or update port inventory (upsert pattern).

**Database Tables**: `port_inventory`

**Side Effects**: 
- If record exists, updates it and sets `updated_at`
- If record doesn't exist, creates new record

---

## Exported Instance

```typescript
export const storage = new DatabaseStorage();
```

The module exports a singleton instance of `DatabaseStorage` for use throughout the application.

---

## Database Tables Accessed

| Table | Methods |
|-------|---------|
| `users` | getUser, getUserByEmail, getUserByUsername, createUser, validatePassword |
| `sessions` | createSession, getSession, deleteSession |
| `flight_plans` | getFlightPlans, getFlightPlan, createFlightPlan, updateFlightPlan, deleteFlightPlan |
| `flight_schedules` | getFlightSchedules, getFlightSchedule, getFlightSchedulesByPlanId, createFlightSchedule, deleteFlightSchedule, deleteFlightSchedulesByPlanId |
| `split_sessions` | getSplitSessions, getSplitSession, createSplitSession, updateSplitSession, deleteSplitSession |
| `flight_nodes` | getFlightNodes, getFlightNode, getFlightNodeChildren, createFlightNode, updateFlightNode, deleteFlightNode |
| `flight_edges` | getFlightEdges, getFlightEdge, createFlightEdge, updateFlightEdge, deleteFlightEdge |
| `port_inventory` | getPortInventory, getPortInventories, upsertPortInventory |
