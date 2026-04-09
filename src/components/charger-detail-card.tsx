"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPinned,
  TimerReset,
  X,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

import { isStatusStale } from "@/lib/status-freshness";
import { StatusPill } from "@/components/status-pill";
import { cn } from "@/lib/utils";
import type { Charger } from "@/types/charger";

type ChargerDetailCardProps = {
  charger: Charger;
  chargersAtLocation?: Charger[];
  onSelectCharger?: (chargerId: string) => void;
  className?: string;
  onClose?: () => void;
};

export function ChargerDetailCard({
  charger,
  chargersAtLocation = [],
  onSelectCharger,
  className,
  onClose,
}: ChargerDetailCardProps) {
  const locationChargers = chargersAtLocation.length ? chargersAtLocation : [charger];
  const hasDistinctTitle =
    charger.title.trim().toLowerCase() !== charger.chargerIdentifier.trim().toLowerCase();
  const activeIndex = Math.max(
    0,
    locationChargers.findIndex((candidate) => candidate.id === charger.id),
  );
  const canStep = locationChargers.length > 1;
  const isStale = isStatusStale(charger.lastCheckedAt);

  function stepSelection(direction: -1 | 1) {
    if (!canStep) {
      return;
    }

    const nextIndex =
      (activeIndex + direction + locationChargers.length) % locationChargers.length;
    onSelectCharger?.(locationChargers[nextIndex].id);
  }

  return (
    <aside
      className={cn(
        "h-full rounded-[18px] border border-[var(--line-soft)] bg-[rgba(255,250,243,0.94)] p-3 shadow-[0_12px_28px_rgba(27,38,46,0.12)]",
        className,
      )}
    >
      {canStep ? (
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-[var(--line-soft)] pb-1.5">
          <button
            type="button"
            onClick={() => stepSelection(-1)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-2)]"
            aria-label="Show previous charger at this location"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[var(--ink-500)]">
              Same location
            </p>
            <p className="text-[12px] font-medium text-[var(--ink-900)]">
              {activeIndex + 1} / {locationChargers.length}
            </p>
          </div>
          <button
            type="button"
            onClick={() => stepSelection(1)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-2)]"
            aria-label="Show next charger at this location"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ink-500)]">
            Charger details
          </p>
          <h2 className="mt-0.5 text-[1.35rem] font-semibold tracking-tight text-[var(--ink-900)]">
            {charger.chargerIdentifier}
          </h2>
          {hasDistinctTitle ? (
            <p className="mt-0.5 text-[12px] leading-[1.05rem] text-[var(--ink-700)]">
              {charger.title}
            </p>
          ) : null}
        </div>
        <div className="flex items-start gap-1.5">
          <StatusPill
            statusText={charger.statusText}
            statusNormalized={charger.statusNormalized}
          />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[14px] border border-[var(--line-soft)] bg-white/80 text-[var(--ink-700)] transition-colors hover:bg-white"
              aria-label="Close charger details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 border-b border-[var(--line-soft)] pb-2.5 [grid-template-columns:80px_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-[12px] border border-[var(--line-soft)] bg-white/70">
          <div className="relative flex min-h-[80px] items-center justify-center p-2">
            {charger.imageUrl ? (
              <Image
                src={charger.imageUrl}
                alt={charger.chargerIdentifier}
                width={78}
                height={78}
                className="h-auto max-h-[78px] w-auto object-contain"
                unoptimized
              />
            ) : (
              <div className="flex h-[78px] w-full items-center justify-center rounded-[12px] border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] text-[10px] text-[var(--ink-500)]">
                No image
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-1.5">
          <DetailBlock label="Price" value={charger.priceText} />
          <DetailBlock label="Schedule" value={charger.scheduleText} />
          <DetailBlock label="Output" value={charger.outputText} />
          <div className="grid grid-cols-[74px_minmax(0,1fr)] items-start gap-2 border-b border-[var(--line-soft)] py-1">
            <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-500)]">
              Last Checked
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] leading-[1rem] text-[var(--ink-700)]">
                {formatDistanceToNowStrict(charger.lastCheckedAt, {
                  addSuffix: true,
                })}
              </p>
              {isStale ? (
                <span className="inline-flex items-center rounded-full border border-[rgba(198,162,75,0.32)] bg-[rgba(198,162,75,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8a6712]">
                  Stale
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-2">
        <div className="border-b border-[var(--line-soft)] pb-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-[var(--ink-700)]">
            <div className="flex items-center gap-1.5">
              <MapPinned className="h-3.5 w-3.5" />
              <p className="text-[12px] font-medium">Address</p>
            </div>
            {charger.mapUrl ? (
              <a
                href={charger.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--ink-900)] underline underline-offset-4"
              >
                Open Google Maps
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          <p className="text-[12px] leading-[1.05rem] text-[var(--ink-700)]">{charger.address}</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-[var(--ink-700)]">
            <TimerReset className="h-3.5 w-3.5" />
            <p className="text-[12px] font-medium">Operational snapshot</p>
          </div>
          <dl className="grid gap-1 text-[12px] text-[var(--ink-700)]">
            <DataRow label="Sessions" value={charger.totalSessions.toLocaleString()} />
            <DataRow
              label="Energy"
              value={`${Math.round(charger.estimatedAllTimeKwh).toLocaleString()} kWh`}
            />
            <DataRow
              label="Unavailable"
              value={
                charger.unavailableSince
                  ? formatDistanceToNowStrict(charger.unavailableSince, {
                      addSuffix: true,
                    })
                  : "Available"
              }
            />
          </dl>
        </div>
      </div>

      <Link
        href={`/chargers/${charger.id}`}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[14px] border border-[var(--line-soft)] bg-white/82 px-3 py-2 text-[12px] font-medium text-[var(--ink-900)] transition-colors hover:bg-white"
      >
        Go to charger details page
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>

    </aside>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)] items-start gap-2 border-b border-[var(--line-soft)] py-1">
      <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--ink-500)]">
        {label}
      </p>
      <p className="whitespace-pre-line text-[12px] leading-[1rem] text-[var(--ink-700)]">
        {value}
      </p>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <dt className="text-[var(--ink-500)]">{label}</dt>
      <dd className="font-medium text-[var(--ink-900)]">{value}</dd>
    </div>
  );
}
