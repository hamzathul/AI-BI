import { DashboardCanvas } from "@/components/dashboards/dashboard-canvas";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <DashboardCanvas id={id} />;
}
