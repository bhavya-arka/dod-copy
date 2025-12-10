# API Reference

## Authentication Endpoints

### POST /api/auth/register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "username": "username"
}
```

**Response:**
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "username"
}
```

### POST /api/auth/login
Authenticate user and create session.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### POST /api/auth/logout
End current session.

### GET /api/auth/me
Get current authenticated user.

## Flight Plans Endpoints

### GET /api/flight-plans
Get all flight plans for authenticated user.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Pacific Deployment",
    "created_at": "2025-12-09T00:00:00Z",
    "updated_at": "2025-12-09T00:00:00Z"
  }
]
```

### POST /api/flight-plans
Create a new flight plan.

**Request Body:**
```json
{
  "name": "Pacific Deployment",
  "movement_data": "...",
  "settings": {}
}
```

### GET /api/flight-plans/:id
Get specific flight plan details.

### PUT /api/flight-plans/:id
Update flight plan.

### DELETE /api/flight-plans/:id
Delete flight plan.

## Session Management

### GET /api/sessions
Get all user sessions.

### POST /api/sessions
Create new planning session.

### GET /api/sessions/:id
Get session details including allocation results.

### PUT /api/sessions/:id
Update session data.

### DELETE /api/sessions/:id
Delete session.

## Route Planning

### POST /api/routes/calculate
Calculate route distance and fuel.

**Request Body:**
```json
{
  "origin": "KADW",
  "destination": "RODN",
  "aircraft_type": "C-17",
  "payload_weight": 50000
}
```

**Response:**
```json
{
  "distance_nm": 7245,
  "distance_km": 13416,
  "flight_time_hr": 14.5,
  "fuel_required_lb": 145000,
  "can_complete_nonstop": true
}
```

### GET /api/bases
Get list of available military bases.

**Response:**
```json
[
  {
    "icao": "KADW",
    "name": "Joint Base Andrews",
    "latitude_deg": 38.8108,
    "longitude_deg": -76.867,
    "region": "CONUS"
  }
]
```

## Error Responses

All endpoints return standard error format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Not authenticated |
| `FORBIDDEN` | 403 | Not authorized for resource |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `SERVER_ERROR` | 500 | Internal server error |
