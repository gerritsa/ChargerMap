import {
  DashboardListLayout,
  ProfitabilityListTable,
} from "@/components/dashboard-list-components";
import { getDashboardProfitabilityListData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type ExpectedRevenuePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExpectedRevenuePage({
  searchParams,
}: ExpectedRevenuePageProps) {
  const params = await searchParams;
  const data = await getDashboardProfitabilityListData(params);

  return (
    <DashboardListLayout
      title="Expected revenue leaders across the Toronto charger network"
      description="This view ranks tracked Toronto chargers by estimated all-time revenue, with session, energy, and occupancy context."
      pathname="/dashboard/expected-revenue"
      filters={data.filters}
      options={data.options}
      visibleFilters={data.visibleFilters}
      pagination={data.pagination}
    >
      <ProfitabilityListTable rows={data.rows} />
    </DashboardListLayout>
  );
}
