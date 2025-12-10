/**
 * PACAF Airlift Demo - Military Bases Database
 * 
 * Static database of major PACAF/AMC relevant bases.
 */

import { MilitaryBase } from './routeTypes';

export const MILITARY_BASES: MilitaryBase[] = [
  // PACAF Bases
  {
    base_id: 'HICKAM',
    name: 'Joint Base Pearl Harbor-Hickam',
    icao: 'PHIK',
    iata: 'HIK',
    latitude_deg: 21.3187,
    longitude_deg: -157.9224,
    country: 'USA',
    timezone: 'Pacific/Honolulu',
    runway_length_ft: 13000
  },
  {
    base_id: 'ANDERSEN',
    name: 'Andersen Air Force Base',
    icao: 'PGUA',
    iata: 'UAM',
    latitude_deg: 13.5840,
    longitude_deg: 144.9241,
    country: 'USA',
    timezone: 'Pacific/Guam',
    runway_length_ft: 11185
  },
  {
    base_id: 'KADENA',
    name: 'Kadena Air Base',
    icao: 'RODN',
    iata: 'DNA',
    latitude_deg: 26.3516,
    longitude_deg: 127.7695,
    country: 'Japan',
    timezone: 'Asia/Tokyo',
    runway_length_ft: 12100
  },
  {
    base_id: 'YOKOTA',
    name: 'Yokota Air Base',
    icao: 'RJTY',
    iata: 'OKO',
    latitude_deg: 35.7485,
    longitude_deg: 139.3487,
    country: 'Japan',
    timezone: 'Asia/Tokyo',
    runway_length_ft: 11000
  },
  {
    base_id: 'MISAWA',
    name: 'Misawa Air Base',
    icao: 'RJSM',
    iata: 'MSJ',
    latitude_deg: 40.7032,
    longitude_deg: 141.3686,
    country: 'Japan',
    timezone: 'Asia/Tokyo',
    runway_length_ft: 10000
  },
  {
    base_id: 'OSAN',
    name: 'Osan Air Base',
    icao: 'RKSO',
    iata: 'OSN',
    latitude_deg: 37.0906,
    longitude_deg: 127.0306,
    country: 'South Korea',
    timezone: 'Asia/Seoul',
    runway_length_ft: 9000
  },
  {
    base_id: 'KUNSAN',
    name: 'Kunsan Air Base',
    icao: 'RKJK',
    iata: 'KUB',
    latitude_deg: 35.9038,
    longitude_deg: 126.6158,
    country: 'South Korea',
    timezone: 'Asia/Seoul',
    runway_length_ft: 9000
  },
  {
    base_id: 'CLARK',
    name: 'Clark Air Base',
    icao: 'RPLC',
    iata: 'CRK',
    latitude_deg: 15.1859,
    longitude_deg: 120.5604,
    country: 'Philippines',
    timezone: 'Asia/Manila',
    runway_length_ft: 10499
  },
  // AMC Bases (CONUS)
  {
    base_id: 'TRAVIS',
    name: 'Travis Air Force Base',
    icao: 'KSUU',
    iata: 'SUU',
    latitude_deg: 38.2627,
    longitude_deg: -121.9275,
    country: 'USA',
    timezone: 'America/Los_Angeles',
    runway_length_ft: 11000
  },
  {
    base_id: 'MCCHORD',
    name: 'Joint Base Lewis-McChord',
    icao: 'KTCM',
    iata: 'TCM',
    latitude_deg: 47.1377,
    longitude_deg: -122.4764,
    country: 'USA',
    timezone: 'America/Los_Angeles',
    runway_length_ft: 10108
  },
  {
    base_id: 'CHARLESTON',
    name: 'Charleston AFB',
    icao: 'KCHS',
    iata: 'CHS',
    latitude_deg: 32.8986,
    longitude_deg: -80.0405,
    country: 'USA',
    timezone: 'America/New_York',
    runway_length_ft: 9000
  },
  {
    base_id: 'DOVER',
    name: 'Dover Air Force Base',
    icao: 'KDOV',
    iata: 'DOV',
    latitude_deg: 39.1296,
    longitude_deg: -75.4657,
    country: 'USA',
    timezone: 'America/New_York',
    runway_length_ft: 12900
  },
  // Additional Theater Bases
  {
    base_id: 'RAMSTEIN',
    name: 'Ramstein Air Base',
    icao: 'ETAR',
    iata: 'RMS',
    latitude_deg: 49.4369,
    longitude_deg: 7.6003,
    country: 'Germany',
    timezone: 'Europe/Berlin',
    runway_length_ft: 10500
  },
  {
    base_id: 'INCIRLIK',
    name: 'Incirlik Air Base',
    icao: 'LTAG',
    iata: 'UAB',
    latitude_deg: 37.0021,
    longitude_deg: 35.4259,
    country: 'Turkey',
    timezone: 'Europe/Istanbul',
    runway_length_ft: 10000
  },
  {
    base_id: 'AL_UDEID',
    name: 'Al Udeid Air Base',
    icao: 'OTBH',
    latitude_deg: 25.1174,
    longitude_deg: 51.3150,
    country: 'Qatar',
    timezone: 'Asia/Qatar',
    runway_length_ft: 12500
  },
  {
    base_id: 'DIEGO_GARCIA',
    name: 'Naval Support Facility Diego Garcia',
    icao: 'FJDG',
    iata: 'NKW',
    latitude_deg: -7.3133,
    longitude_deg: 72.4111,
    country: 'British Indian Ocean Territory',
    timezone: 'Indian/Chagos',
    runway_length_ft: 12003
  }
];

export function getBaseById(baseId: string): MilitaryBase | undefined {
  return MILITARY_BASES.find(b => b.base_id === baseId);
}

export function searchBases(query: string): MilitaryBase[] {
  const lowerQuery = query.toLowerCase();
  return MILITARY_BASES.filter(b => 
    b.base_id.toLowerCase().includes(lowerQuery) ||
    b.name.toLowerCase().includes(lowerQuery) ||
    b.icao.toLowerCase().includes(lowerQuery) ||
    (b.iata && b.iata.toLowerCase().includes(lowerQuery)) ||
    b.country.toLowerCase().includes(lowerQuery)
  );
}
