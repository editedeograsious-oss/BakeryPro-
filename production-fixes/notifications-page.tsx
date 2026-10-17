import Sidebar from "@/components/Sidebar";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { requireStaff } from "@/lib/auth";

export const dynamic="force-dynamic";

export default async function NotificationsPage(){
  await requireStaff(["owner","manager","cashier","baker","storekeeper"]);
  return <div className="shell">
    <Sidebar/>
    <main className="main"><NotificationCenter view="history"/></main>
  </div>;
}
