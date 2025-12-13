---

### ✅ FILE GENERATED:

**Filename:**
`API_WEATHER_VALIDATION_SPEC.md`

---

```markdown
# 🌤 API Weather Validation Specification
> **For:** Flight Manager — Airbase Node Weather Integration  
> **Source:** [National Weather Service API](https://api.weather.gov)  
> **Maintained by:** Flight Ops Backend / Weather Integration Service  

---

## 🎯 Objective
Ensure that **all Airbase nodes** in the **Flight Manager flowchart UI**:
1. Query accurate, location-specific weather data from the official **NWS API** (`https://api.weather.gov`).
2. Adjust endpoints dynamically if the airbase coordinates are unknown or incomplete.
3. Retrieve and validate key atmospheric metrics — **visibility, temperature, wind, sky conditions**, and **alerts**.

---

## 🧭 API Overview

**Base URL:**  
```

[https://api.weather.gov](https://api.weather.gov)

```

**Headers (required):**
```

User-Agent: (yourappname.com, [contact@yourapp.com](mailto:contact@yourapp.com))
Accept: application/geo+json

```

**Rate Limits:**  
Open access — no authentication required. Moderate rate limit per IP (auto resets ~5 seconds).

---

## 🌍 Endpoint Requirements

### 1. Primary Forecast Endpoint
```

GET /points/{latitude},{longitude}

```

**Returns:**  
- The forecast office serving that location  
- URLs for current observations, hourly forecasts, and alerts  

**Example:**
```

GET [https://api.weather.gov/points/47.6062,-122.3321](https://api.weather.gov/points/47.6062,-122.3321)

```

**Response fields used:**
| Field | Description |
|--------|--------------|
| `properties.forecast` | URL for 7-day forecast |
| `properties.forecastHourly` | URL for hourly forecast |
| `properties.observationStations` | List of stations nearby |
| `properties.relativeLocation` | Nearest city metadata |

---

### 2. Observation Data (Airbase Weather Snapshot)
```

GET /stations/{stationId}/observations/latest

```

**Purpose:** Get current weather conditions for the closest station to the airbase.

**Expected Fields:**
| Field | Description |
|--------|--------------|
| `temperature.value` | Celsius |
| `windSpeed.value` | m/s |
| `visibility.value` | meters |
| `textDescription` | Cloud & condition summary |
| `relativeHumidity.value` | % humidity |

---

### 3. Alerts (for regional or national conditions)
```

GET /alerts/active?point={latitude},{longitude}

````

**Purpose:** Retrieve local alerts (storm warnings, severe visibility issues, etc.)

---

## 🧠 Logic: Airbase Node Data Resolution

Each **Airbase Node** in the Flight Manager flow should follow this logic:

1. **Check Airbase Metadata**
   - If airbase has known coordinates → use `GET /points/{lat},{lon}`
   - Else, use a fallback search or static mapping table (based on ICAO code, name, or region)

2. **Get Observation Station**
   - Use `properties.observationStations[0]` from the `/points` response
   - Call `/stations/{stationId}/observations/latest`

3. **Extract Data**
   - Parse `temperature`, `visibility`, `windSpeed`, and `textDescription`
   - Convert visibility to nautical miles (optional)
   - Normalize into internal format:
     ```json
     {
       "airbaseId": "ABC123",
       "temperatureC": 17.3,
       "visibilityM": 10000,
       "windSpeedMps": 3.5,
       "condition": "Clear",
       "updatedAt": "2025-12-12T16:00Z"
     }
     ```

4. **If Coordinates Unknown**
   - Call internal endpoint `/api/airbases/resolve` to fetch or infer lat/lon.
   - If still unavailable, mark node as **“Weather Data Unavailable”** but allow manual override.

---

## 📡 Internal Endpoints to Validate

| Path | Method | Auth | Description |
|------|--------|------|-------------|
| `/api/airbases` | GET | ✅ | List all known airbases |
| `/api/airbases/:id` | GET | ✅ | Fetch details of one airbase |
| `/api/airbases/resolve` | POST | ✅ | Resolve coordinates if missing |
| `/api/weather/now/:id` | GET | ✅ | Fetch live weather for airbase |
| `/api/weather/update` | POST | ✅ | Trigger refresh for all weather nodes |
| `/api/weather/status` | GET | ✅ | Check system-wide weather health |

---

## 🧩 Validation Rules

| Check | Expected Result |
|--------|----------------|
| Airbase has lat/lon | Must call NWS `/points/{lat},{lon}` |
| Unknown coordinates | Must call internal `/api/airbases/resolve` |
| Weather API failure | Retry with exponential backoff (max 3) |
| Response content type | `application/geo+json` |
| Missing fields | Log warning and skip update, don’t crash node |
| Data freshness | Update every ≤ 10 minutes |

---

## 🔧 Integration Notes

- **Visibility conversion:**  
  `visibility_nm = visibility_m / 1852`
- **Temperature:**  
  Convert from Celsius → Fahrenheit if needed:
  ```js
  tempF = (tempC * 9/5) + 32
````

* **Caching:**
  Cache last 10 results per station to reduce API load.
* **Logging:**
  Each node should log:

  * API URL used
  * Response code
  * Extracted metrics

---

## 🧱 Example Combined Flow

```mermaid
flowchart TD
  A[Airbase Node Loaded] --> B{Has Coordinates?}
  B -->|Yes| C[Call NWS /points/{lat},{lon}]
  B -->|No| D[POST /api/airbases/resolve]
  C --> E[Fetch nearest station ID]
  E --> F[GET /stations/{id}/observations/latest]
  F --> G[Parse visibility, wind, temp]
  G --> H[POST /api/weather/update]
  D --> I[Return fallback weather data or empty object]
  H --> J[Update Flight Manager dashboard]
```

---

## ✅ Verification Checklist

| Item                                     | Status | Description                      |
| ---------------------------------------- | ------ | -------------------------------- |
| Airbase nodes call `/points/{lat},{lon}` | ☐      | Verified endpoint                |
| Visibility and wind values parsed        | ☐      | Units correct                    |
| Fallback `/resolve` endpoint functional  | ☐      | Auto-locates missing coordinates |
| `/weather/update` triggers refresh       | ☐      | Updates cached state             |
| Rate limit compliance                    | ☐      | 429 handling tested              |
| User-Agent header set properly           | ☐      | Identifies app correctly         |

---

## 📜 References

* **NWS API Documentation:** [https://www.weather.gov/documentation/services-web-api](https://www.weather.gov/documentation/services-web-api)
* **GeoJSON Spec:** [https://geojson.org/](https://geojson.org/)
* **NOAA Email for operational issues:** `nco.ops@noaa.gov`
* **GitHub Questions:** [https://github.com/weather-gov/api](https://github.com/weather-gov/api)

---
