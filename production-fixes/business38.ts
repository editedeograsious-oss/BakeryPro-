import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/runtime";

export async function getFinanceData(){
  if(isDemoMode()) return {accounts:[
    {id:"cash",code:"CASH",name:"Cash on Hand",account_type:"cash",balance:850000},
    {id:"mtn",code:"MTN",name:"MTN Mobile Money",account_type:"mobile_money",balance:1250000},
    {id:"airtel",code:"AIRTEL",name:"Airtel Money",account_type:"mobile_money",balance:620000},
    {id:"bank",code:"BANK",name:"Bank",account_type:"bank",balance:4500000},
  ],reconciliations:[],demo:true};

  const supabase=await createClient();
  const [{data:rawAccounts,error:aErr},{data:rawReconciliations,error:rErr}]=await Promise.all([
    supabase.from("money_account_balances").select("*").eq("active",true).order("account_name"),
    supabase.from("money_reconciliations").select("*,money_accounts(account_name,account_code)").order("reconciled_at",{ascending:false}).limit(50),
  ]);
  if(aErr)throw aErr;
  if(rErr)throw rErr;

  const accounts=(rawAccounts??[]).map((a:any)=>({
    ...a,
    id:a.account_id,
    code:a.account_code,
    name:a.account_name,
    balance:a.system_balance,
  }));
  const reconciliations=(rawReconciliations??[]).map((r:any)=>({
    ...r,
    business_date:String(r.reconciled_at??"").slice(0,10),
    finance_accounts:r.money_accounts?{name:r.money_accounts.account_name,code:r.money_accounts.account_code}:null,
  }));
  return {accounts,reconciliations,demo:false};
}

export async function getBranchData(){
  if(isDemoMode()) return {branches:[{id:"main",code:"MAIN",name:"DS Bakery - Main Branch",address:"",phone:"",active:true,is_default:true,active_staff:5,lifetime_sales:0}],demo:true};
  const supabase=await createClient();
  const {data,error}=await supabase.from("branch_summary").select("*").order("is_default",{ascending:false}).order("name");
  if(error)throw error;
  return {branches:data??[],demo:false};
}

export async function getPromotionData(){
  if(isDemoMode()) return {promotions:[],demo:true};
  const supabase=await createClient();
  const {data,error}=await supabase.from("promotions").select("*").order("created_at",{ascending:false});
  if(error)throw error;
  return {promotions:data??[],demo:false};
}

export async function getNotificationData(){
  if(isDemoMode()) return {notifications:[
    {id:"n1",priority:"important",title:"Low stock",message:"Flour is below its minimum stock level.",module:"inventory",href:"/inventory"},
    {id:"n2",priority:"info",title:"Order ready",message:"A customer order is ready for pickup.",module:"orders",href:"/customer-orders"},
  ],demo:true};
  const supabase=await createClient();
  const {data,error}=await supabase.from("operational_alerts").select("*").limit(200);
  if(error)throw error;
  const notifications=(data??[]).map((n:any)=>({
    id:`${n.alert_type}:${n.entity_id}`,
    priority:n.priority,
    title:n.title,
    message:n.message,
    module:n.alert_type,
    href:n.href,
  }));
  return {notifications,demo:false};
}
