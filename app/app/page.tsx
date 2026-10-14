import { OperationsDashboardView, EmployeeTodayView } from "@/components/operational-views";
import { getLoopiUser } from "@/app/loopi-user";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  const user = await getLoopiUser("/app");
  if (user.role === "system_admin") {
    return (
      <section className="card" role="status">
        <h1>Quản trị kỹ thuật</h1>
        <p className="supporting-copy">
          Tài khoản này được tách khỏi dữ liệu và thao tác nghiệp vụ cửa hàng. Hãy dùng runbook hạ tầng được phê duyệt cho migration, log và vận hành kỹ thuật.
        </p>
      </section>
    );
  }
  if (user.role === "employee" || user.role === "team_lead") {
    return <EmployeeTodayView />;
  }
  return <OperationsDashboardView />;
}
