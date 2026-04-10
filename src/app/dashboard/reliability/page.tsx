import {
  DashboardListLayout,
  UnavailableListTable,
} from "@/components/dashboard-list-components";
import { DASHBOARD_EXPLANATIONS } from "@/lib/dashboard-explanations";
import { getDashboardUnavailableListData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

type ReliabilityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReliabilityPage({
  searchParams,
}: ReliabilityPageProps) {
  const params = await searchParams;
  const data = await getDashboardUnavailableListData(params);

  return (
    <DashboardListLayout
      title="Unavailable chargers ranked by ongoing downtime"
      description="This view shows every currently unavailable tracked charger in Toronto, with the longest ongoing downtime at the top."
      pathname="/dashboard/reliability"
      filters={data.filters}
      options={data.options}
      visibleFilters={data.visibleFilters}
      filterLabels={{ output: "Power" }}
      infoContent={DASHBOARD_EXPLANATIONS.reliability}
      pagination={data.pagination}
    >
      <UnavailableListTable rows={data.rows} />
    </DashboardListLayout>
  );
}
