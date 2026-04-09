"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin } from "lucide-react";
import Map, { Marker } from "react-map-gl/maplibre";

type ChargerMiniMapPreviewProps = {
  lat: number;
  lng: number;
  href: string;
  label: string;
};

export function ChargerMiniMapPreview({
  lat,
  lng,
  href,
  label,
}: ChargerMiniMapPreviewProps) {
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-[24px] border border-[var(--line-soft)] bg-white/82 shadow-[0_14px_28px_rgba(27,38,46,0.08)] transition-transform hover:-translate-y-0.5"
    >
      <div className="relative h-[180px]">
        <Map
          initialViewState={{
            latitude: lat,
            longitude: lng,
            zoom: 14.5,
          }}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          attributionControl={false}
          dragPan={false}
          dragRotate={false}
          doubleClickZoom={false}
          scrollZoom={false}
          touchZoomRotate={false}
          keyboard={false}
          interactive={false}
        >
          <Marker latitude={lat} longitude={lng} anchor="bottom">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(14,124,102,0.3)]">
              <MapPin className="h-4 w-4" />
            </div>
          </Marker>
        </Map>

        <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
          <span className="rounded-full border border-[var(--line-soft)] bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-700)]">
            Map view
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line-soft)] bg-white/92 text-[var(--ink-700)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(23,33,43,0.82)] via-[rgba(23,33,43,0.45)] to-transparent px-4 pb-4 pt-8 text-white">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs text-white/82">Press to open this charger on the map.</p>
        </div>
      </div>
    </Link>
  );
}
