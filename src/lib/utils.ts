export function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(" ");
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat("en-CA", options).format(value);
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-CA", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatEnergyVolume(kwh: number) {
  if (Math.abs(kwh) >= 1000) {
    const mwh = kwh / 1000;
    return `${mwh.toFixed(Math.abs(mwh) >= 10 ? 1 : 2).replace(/\.0$/, "")} MWh`;
  }

  return `${formatCompactNumber(kwh)} kWh`;
}

export function formatPercent(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en-CA", {
    style: "percent",
    maximumFractionDigits,
  }).format(value);
}
