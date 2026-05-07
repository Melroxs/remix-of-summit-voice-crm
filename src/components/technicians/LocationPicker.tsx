import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search } from "lucide-react";

// Fix default icon paths for Leaflet under Vite
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

interface Props {
  lat: number | null;
  lng: number | null;
  address: string;
  onChange: (v: { lat: number | null; lng: number | null; address: string }) => void;
}

function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 13));
  }, [lat, lng, map]);
  return null;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationPicker({ lat, lng, address, onChange }: Props) {
  const [search, setSearch] = useState(address);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSearch(address), [address]);

  const center = useMemo<[number, number]>(
    () => [lat ?? 39.8283, lng ?? -98.5795],
    [lat, lng],
  );

  const reverseGeocode = async (la: number, ln: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}`,
      );
      const data = await res.json();
      return data?.display_name as string | undefined;
    } catch {
      return undefined;
    }
  };

  const handlePick = async (la: number, ln: number) => {
    const addr = (await reverseGeocode(la, ln)) ?? address;
    onChange({ lat: la, lng: ln, address: addr });
    setSearch(addr);
  };

  const handleSearch = async () => {
    if (!search.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(search)}`,
      );
      const data = await res.json();
      const hit = Array.isArray(data) && data[0];
      if (hit) {
        onChange({
          lat: parseFloat(hit.lat),
          lng: parseFloat(hit.lon),
          address: hit.display_name,
        });
        setSearch(hit.display_name);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
          placeholder="Search address or click on the map"
        />
        <Button type="button" variant="outline" onClick={handleSearch} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
      </div>
      <div className="h-56 rounded-md overflow-hidden border border-border">
        <MapContainer center={center} zoom={lat != null ? 13 : 4} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Recenter lat={lat} lng={lng} />
          <ClickHandler onPick={handlePick} />
          {lat != null && lng != null && <Marker position={[lat, lng]} />}
        </MapContainer>
      </div>
      {lat != null && lng != null && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <MapPin className="w-3 h-3" /> {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}