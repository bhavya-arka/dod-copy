const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const GEOCODING_API = 'https://maps.googleapis.com/maps/api/geocode/json';
const DIRECTIONS_API = 'https://maps.googleapis.com/maps/api/directions/json';
const DISTANCE_MATRIX_API = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const PLACES_AUTOCOMPLETE_API = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_API = 'https://maps.googleapis.com/maps/api/place/details/json';

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_API_KEY environment variable is not set');
  }
  return key;
}

export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
} | null> {
  try {
    const apiKey = getApiKey();
    const params = new URLSearchParams({
      address,
      key: apiKey,
    });

    const response = await fetch(`${GEOCODING_API}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results?.[0]) {
      console.error('[GoogleMaps] Geocode failed:', data.status, data.error_message);
      return null;
    }

    const result = data.results[0];
    return {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
      formattedAddress: result.formatted_address,
    };
  } catch (error) {
    console.error('[GoogleMaps] Geocode error:', error);
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const apiKey = getApiKey();
    const params = new URLSearchParams({
      latlng: `${lat},${lng}`,
      key: apiKey,
    });

    const response = await fetch(`${GEOCODING_API}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' || !data.results?.[0]) {
      console.error('[GoogleMaps] Reverse geocode failed:', data.status, data.error_message);
      return null;
    }

    return data.results[0].formatted_address;
  } catch (error) {
    console.error('[GoogleMaps] Reverse geocode error:', error);
    return null;
  }
}

export async function calculateRoute(
  origin: string | { lat: number; lng: number },
  destination: string | { lat: number; lng: number },
  options?: {
    waypoints?: string[];
    avoidTolls?: boolean;
    avoidHighways?: boolean;
    vehicleType?: 'truck' | 'car';
  }
): Promise<{
  distance: { value: number; text: string };
  duration: { value: number; text: string };
  polyline: string;
  legs: Array<{
    startAddress: string;
    endAddress: string;
    distance: { value: number; text: string };
    duration: { value: number; text: string };
  }>;
} | null> {
  try {
    const apiKey = getApiKey();
    
    const originStr = typeof origin === 'string' 
      ? origin 
      : `${origin.lat},${origin.lng}`;
    const destinationStr = typeof destination === 'string'
      ? destination
      : `${destination.lat},${destination.lng}`;

    const params = new URLSearchParams({
      origin: originStr,
      destination: destinationStr,
      key: apiKey,
    });

    if (options?.waypoints && options.waypoints.length > 0) {
      params.set('waypoints', options.waypoints.join('|'));
    }

    const avoid: string[] = [];
    if (options?.avoidTolls) avoid.push('tolls');
    if (options?.avoidHighways) avoid.push('highways');
    if (avoid.length > 0) {
      params.set('avoid', avoid.join('|'));
    }

    if (options?.vehicleType === 'truck') {
      params.set('traffic_model', 'pessimistic');
    }

    const response = await fetch(`${DIRECTIONS_API}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' || !data.routes?.[0]) {
      console.error('[GoogleMaps] Directions failed:', data.status, data.error_message);
      return null;
    }

    const route = data.routes[0];
    
    let totalDistance = 0;
    let totalDuration = 0;
    const legs = route.legs.map((leg: any) => {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
      return {
        startAddress: leg.start_address,
        endAddress: leg.end_address,
        distance: {
          value: leg.distance.value,
          text: leg.distance.text,
        },
        duration: {
          value: leg.duration.value,
          text: leg.duration.text,
        },
      };
    });

    return {
      distance: {
        value: totalDistance,
        text: formatDistance(totalDistance),
      },
      duration: {
        value: totalDuration,
        text: formatDuration(totalDuration),
      },
      polyline: route.overview_polyline?.points || '',
      legs,
    };
  } catch (error) {
    console.error('[GoogleMaps] Directions error:', error);
    return null;
  }
}

export async function getDistanceMatrix(
  origins: string[],
  destinations: string[]
): Promise<{
  rows: Array<{
    elements: Array<{
      distance: { value: number; text: string };
      duration: { value: number; text: string };
      status: string;
    }>;
  }>;
} | null> {
  try {
    const apiKey = getApiKey();
    
    const params = new URLSearchParams({
      origins: origins.join('|'),
      destinations: destinations.join('|'),
      key: apiKey,
    });

    const response = await fetch(`${DISTANCE_MATRIX_API}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('[GoogleMaps] Distance matrix failed:', data.status, data.error_message);
      return null;
    }

    const rows = data.rows.map((row: any) => ({
      elements: row.elements.map((element: any) => ({
        distance: element.status === 'OK' 
          ? { value: element.distance.value, text: element.distance.text }
          : { value: 0, text: 'N/A' },
        duration: element.status === 'OK'
          ? { value: element.duration.value, text: element.duration.text }
          : { value: 0, text: 'N/A' },
        status: element.status,
      })),
    }));

    return { rows };
  } catch (error) {
    console.error('[GoogleMaps] Distance matrix error:', error);
    return null;
  }
}

export async function placeAutocomplete(
  input: string,
  sessionToken?: string
): Promise<Array<{
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
}> | null> {
  try {
    const apiKey = getApiKey();
    
    const params = new URLSearchParams({
      input,
      key: apiKey,
    });

    if (sessionToken) {
      params.set('sessiontoken', sessionToken);
    }

    const response = await fetch(`${PLACES_AUTOCOMPLETE_API}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[GoogleMaps] Autocomplete failed:', data.status, data.error_message);
      return null;
    }

    if (!data.predictions) {
      return [];
    }

    return data.predictions.map((prediction: any) => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text || prediction.description,
      secondaryText: prediction.structured_formatting?.secondary_text || '',
    }));
  } catch (error) {
    console.error('[GoogleMaps] Autocomplete error:', error);
    return null;
  }
}

export async function getPlaceDetails(placeId: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string;
  name: string;
} | null> {
  try {
    const apiKey = getApiKey();
    
    const params = new URLSearchParams({
      place_id: placeId,
      fields: 'geometry,formatted_address,name',
      key: apiKey,
    });

    const response = await fetch(`${PLACE_DETAILS_API}?${params}`);
    const data = await response.json();

    if (data.status !== 'OK' || !data.result) {
      console.error('[GoogleMaps] Place details failed:', data.status, data.error_message);
      return null;
    }

    const result = data.result;
    return {
      lat: result.geometry?.location?.lat,
      lng: result.geometry?.location?.lng,
      formattedAddress: result.formatted_address || '',
      name: result.name || '',
    };
  } catch (error) {
    console.error('[GoogleMaps] Place details error:', error);
    return null;
  }
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  const km = meters / 1000;
  if (km < 100) {
    return `${km.toFixed(1)} km`;
  }
  return `${Math.round(km)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) {
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
  return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} min`;
}
