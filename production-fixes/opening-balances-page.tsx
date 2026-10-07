import Sidebar from "@/components/Sidebar";
import OpeningBalancesManager from "@/components/validation/OpeningBalancesManager";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export default async function OpeningBalances(){
  const staff=await requireStaff(["owner","manager"]);
  let drafts:any[]=[],materials:any[]=[],products:any[]=[],customers:any[]=[];
  let status:any={editable:true,business_date:new Date().toISOString().slice(0,10),can_prepare_stock:true,can_prepare_credit:true};
  if(!staff.demo){
    const supabase=await createClient();
    const results=await Promise.all([
      supabase.rpc("opening_draft_setup_status"),
      supabase.from("opening_balance_drafts").select("*,raw_materials(name),products(name),customers(full_name,phone)").order("updated_at",{ascending:false}),
      supabase.from("raw_materials").select("id,name,base_unit,current_stock_qty").eq("status","active").order("name"),
      supabase.from("products").select("id,name").eq("status","active").order("name"),
      supabase.from("customers").select("id,full_name,phone").eq("active",true).order("full_name"),
    ]);
    for(const r of results)if(r.error)throw r.error;
    status=results[0].data;
    drafts=results[1].data??[];materials=results[2].data??[];
    products=results[3].data??[];customers=results[4].data??[];
  }
  return <div className="shell"><Sidebar/><main className="main">
    <OpeningBalancesManager drafts={drafts} materials={materials} products={products} customers={customers} status={status} live={!staff.demo}/>
  </main></div>;
}
