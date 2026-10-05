"use client";

import { Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { MapFocus, Point } from "./store-location-map";

const StoreLocationMap = dynamic(() => import("./store-location-map"), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-lg border bg-muted" />,
});

type Place = Point & { name: string };

/** OpenStreetMap's geocoder. Its usage policy allows about one request per second and no search-as-you-type. */
async function searchPlaces(query: string): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const results = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  return results.map((result) => ({ name: result.display_name, latitude: Number(result.lat), longitude: Number(result.lon) }));
}

type StoreLocationPickerProps = {
  position: Point | null;
  radiusKm: number | null;
  onPick: (point: Point) => void;
};

export function StoreLocationPicker({ position, radiusKm, onPick }: StoreLocationPickerProps) {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState<"search" | "locate" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  function moveTo(point: Point) {
    onPick(point);
    setFocus({ ...point, id: Date.now() });
    setPlaces(null);
  }

  async function search() {
    const text = query.trim();
    if (!text || busy) return;
    setBusy("search");
    setMessage(null);
    try {
      const found = await searchPlaces(text);
      if (found.length === 1) moveTo(found[0]);
      else setPlaces(found);
      if (found.length === 0) setMessage("No places found. Try the area or a nearby landmark, or click on the map.");
    } catch {
      setMessage("Search isn't available right now. Click on the map or type the coordinates instead.");
    } finally {
      setBusy(null);
    }
  }

  function locate() {
    if (!navigator.geolocation) {
      setMessage("This browser can't share its location.");
      return;
    }
    setBusy("locate");
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(null);
        moveTo({ latitude: coords.latitude, longitude: coords.longitude });
      },
      () => {
        setBusy(null);
        setMessage("Couldn't get this device's location. Allow location access, or search instead.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              search();
            }}
            placeholder="Search for the store's address or area"
            aria-label="Search for a place"
            className="pl-9"
          />
        </div>
        <Button type="button" variant="outline" onClick={search} disabled={busy !== null || !query.trim()}>
          {busy === "search" ? <Loader2 className="animate-spin" /> : <Search />}
          Search
        </Button>
        <Button type="button" variant="outline" onClick={locate} disabled={busy !== null} title="Use this device's location">
          {busy === "locate" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          <span className="sr-only sm:not-sr-only">My location</span>
        </Button>
      </div>

      {places && places.length > 0 && (
        <ul className="divide-y rounded-lg border bg-popover text-sm shadow-sm">
          {places.map((place) => (
            <li key={`${place.latitude},${place.longitude}`}>
              <button type="button" onClick={() => moveTo(place)} className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-accent">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>{place.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      <StoreLocationMap position={position} radiusKm={radiusKm} focus={focus} onPick={onPick} />
      <p className="text-xs text-muted-foreground">Click on the map or drag the pin to the store&apos;s entrance. The circle is the delivery area.</p>
    </div>
  );
}
