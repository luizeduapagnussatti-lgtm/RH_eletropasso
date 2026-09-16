import { useState, useCallback, useEffect, useRef } from 'react';
import { OFFICE_LOCATIONS } from '../../constants';
import { hrService } from '../../services/hrService';
import { OfficeLocation } from '../../types';
import {
  GEO_CACHE_MAX_AGE_MS,
  isSecureMediaContext,
  isStandalonePwa,
  queryGeolocationPermission,
  readCachedGeo,
  writeCachedGeo,
} from '../../utils/pwaMediaPermissions';

/**
 * Geolocation hook for attendance check-in/check-out (PWA / browser only).
 *
 * - Requires HTTPS (or localhost for dev).
 * - Installed PWA has a separate permission store from the browser tab.
 * - Prefer calling detectLocation from a user gesture the first time.
 * - Last successful fix is cached in localStorage and reused briefly when GPS is slow.
 */

/** Returns attendance.json error keys for LocationDisplay to translate. */
const getLocationErrorMessage = (err: unknown): string => {
  const code = (err as GeolocationPositionError | undefined)?.code;

  switch (code) {
    case 1: // PERMISSION_DENIED
      if (isStandalonePwa()) return 'errors.locationDeniedPwa';
      return 'errors.locationDeniedBrowser';

    case 2: // POSITION_UNAVAILABLE
      return 'errors.locationUnavailableDetail';

    case 3: // TIMEOUT
      return 'errors.locationTimeout';

    default:
      return 'errors.locationGeneric';
  }
};

export const useGeoLocation = () => {
  const [location, setLocation] = useState<{
    lat: number;
    lng: number;
    address: string;
    accuracy?: number | null;
    fromCache?: boolean;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoFences, setGeoFences] = useState<OfficeLocation[]>(OFFICE_LOCATIONS);
  const watchIdRef = useRef<number | null>(null);
  const geoFencesRef = useRef(geoFences);
  geoFencesRef.current = geoFences;

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await hrService.getConfig();
        if (config.officeLocations && config.officeLocations.length > 0) {
          setGeoFences(config.officeLocations);
        }
      } catch {
        // Fallback to constants is already set
      }
    };
    void loadConfig();

    // Warm UI with a recent cached fix while a fresh request runs.
    const cached = readCachedGeo();
    if (cached) {
      setLocation({
        lat: cached.lat,
        lng: cached.lng,
        address: cached.address,
        accuracy: cached.accuracy,
        fromCache: true,
      });
    }
  }, []);

  const matchOffice = (lat: number, lng: number, fences: OfficeLocation[]): string | null => {
    for (const office of fences) {
      const latDiff = Math.abs(office.lat - lat);
      const lngDiff = Math.abs(office.lng - lng);
      if (latDiff < 0.005 && lngDiff < 0.005) {
        return office.name;
      }
    }
    return null;
  };

  const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16&addressdetails=1`,
        { headers: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.5' } },
      );
      if (!response.ok) throw new Error('Geocode failed');
      const data = await response.json();

      if (data.address) {
        const addr = data.address;
        const parts: string[] = [];
        if (addr.road || addr.pedestrian) parts.push(addr.road || addr.pedestrian);
        if (addr.neighbourhood || addr.suburb) parts.push(addr.neighbourhood || addr.suburb);
        if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
        if (parts.length > 0) return parts.join(', ');
      }

      if (data.display_name) {
        const parts = data.display_name.split(', ').slice(0, 3);
        return parts.join(', ');
      }

      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  };

  const resolveAddress = async (
    lat: number,
    lng: number,
    fences: OfficeLocation[],
  ): Promise<string> => {
    const officeName = matchOffice(lat, lng, fences);
    if (officeName) return officeName;
    return reverseGeocode(lat, lng);
  };

  const getPosition = (options: PositionOptions): Promise<GeolocationPosition> =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });

  const applyPosition = async (pos: GeolocationPosition) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy;
    const address = await resolveAddress(lat, lng, geoFencesRef.current);
    const next = { lat, lng, address, accuracy, fromCache: false as const };
    writeCachedGeo({ lat, lng, address, accuracy });
    setLocation(next);
    setError(null);
    return next;
  };

  const detectLocation = useCallback(async (force: boolean = false): Promise<boolean> => {
    setIsLocating(true);
    setError(null);

    try {
      if (!isSecureMediaContext()) {
        setError('errors.locationInsecureContext');
        return false;
      }
      if (!navigator.geolocation) {
        setError('errors.locationGeneric');
        return false;
      }

      const perm = await queryGeolocationPermission();
      if (perm === 'denied') {
        setError(
          isStandalonePwa() ? 'errors.locationDeniedPwa' : 'errors.locationDeniedBrowser',
        );
        // Still allow a recent cache so the user can punch if GPS worked minutes ago.
        const cachedDenied = readCachedGeo(GEO_CACHE_MAX_AGE_MS);
        if (cachedDenied && !force) {
          setLocation({
            lat: cachedDenied.lat,
            lng: cachedDenied.lng,
            address: cachedDenied.address,
            accuracy: cachedDenied.accuracy,
            fromCache: true,
          });
          return true;
        }
        return false;
      }

      if (!force) {
        const cached = readCachedGeo();
        if (cached) {
          setLocation({
            lat: cached.lat,
            lng: cached.lng,
            address: cached.address,
            accuracy: cached.accuracy,
            fromCache: true,
          });
        }
      }

      const maxAge = force ? 0 : 120_000;
      let pos: GeolocationPosition | null = null;
      let lastErr: unknown = null;

      const attempts: PositionOptions[] = [
        { enableHighAccuracy: true, timeout: 25_000, maximumAge: maxAge },
        { enableHighAccuracy: false, timeout: 20_000, maximumAge: maxAge },
        { enableHighAccuracy: false, timeout: 30_000, maximumAge: 300_000 },
      ];

      for (const opts of attempts) {
        try {
          pos = await getPosition(opts);
          break;
        } catch (err) {
          lastErr = err;
          const code = (err as GeolocationPositionError | undefined)?.code;
          // Hard deny: stop retrying high/low accuracy loops.
          if (code === 1 && perm === 'denied') break;
          // code 1 with "prompt"/"unknown" often means the silent request was ignored —
          // still try the next (network) attempt once.
        }
      }

      if (pos) {
        await applyPosition(pos);
        return true;
      }

      // Fresh GPS failed — keep a recent cache so punch is not blocked outdoors briefly.
      const cached = readCachedGeo(force ? 60_000 : GEO_CACHE_MAX_AGE_MS);
      if (cached) {
        setLocation({
          lat: cached.lat,
          lng: cached.lng,
          address: cached.address,
          accuracy: cached.accuracy,
          fromCache: true,
        });
        setError(null);
        return true;
      }

      throw lastErr || new Error('location_failed');
    } catch (err: unknown) {
      console.error('Geolocation detection failed:', err);
      setError(getLocationErrorMessage(err));
      return false;
    } finally {
      setIsLocating(false);
    }
  }, []);

  const watchLocation = useCallback(async () => {
    if (watchIdRef.current !== null) return;
    if (!navigator.geolocation) {
      setError('errors.locationGeneric');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      pos => {
        void applyPosition(pos);
      },
      () => setError('errors.locationGeneric'),
      { enableHighAccuracy: true, maximumAge: 30_000 },
    );
  }, []);

  const clearWatch = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  return { location, isLocating, error, detectLocation, watchLocation, clearWatch };
};
