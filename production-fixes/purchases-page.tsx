import Sidebar from "@/components/Sidebar";
import PurchaseReceivingPanel from "@/components/operations/PurchaseReceivingPanel";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/runtime";
import { demoPurchaseLines } from "@/lib/demo/operations";

export const dynamic="force-dynamic";
export const revalidate=0;

export default async function Purchases(){
  await requireStaff(["owner","manager","storekeeper"]);

  let lines:any[]=[];
  let live=!isDemoMode();

  if(!live){
    lines=demoPurchaseLines;
  }else{
    const supabase=await createClient();
    const {data,error}=await supabase
      .from("purchase_receiving_lines")
      .select("*")
      .order("purchase_date",{ascending:false})
      .order("purchase_no",{ascending:false})
      .limit(300);
    if(error)throw error;
    lines=data??[];
  }

  return <div className="shell"><Sidebar/><main className="main">
    <PurchaseReceivingPanel lines={lines} live={live}/>
  </main></div>;
}
