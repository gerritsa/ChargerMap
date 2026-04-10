import {
  DashboardListLayout,
  OccupancyListTable,
} from "@/components/dashboard-list-components";
import { DASHBOARD_EXPLANATIONS } from "@/lib/dashboard-explanations";
import { getDashboardOccupancyListData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type OccupancyPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OccupancyPage({
  searchParams,
}: OccupancyPageProps) {
  const params = await searchParams;
  const data = await getDashboardOccupancyListData(params);

  return (
    <DashboardListLayout
      title="Chargers ranked by observed tracked occupancy"
      description="This view ranks tracked Toronto chargers by observed occupancy, combining closed sessions and any live open session time. Chargers currently normalized as not live are excluded by default."
      pathname="/dashboard/occupancy"
      filters={data.filters}
      options={data.options}
      visibleFilters={data.visibleFilters}
      infoContent={DASHBOARD_EXPLANATIONS.occupancy}
      pagination={data.pagination}
    >
      <OccupancyListTable rows={data.rows} />
    </DashboardListLayout>
  );
}
