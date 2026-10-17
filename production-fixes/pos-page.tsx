import PosTerminal from "@/components/core/PosTerminal";
import {requireStaff} from "@/lib/auth";
import {getPosPageData} from "@/lib/repositories/coreLive";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export default async function POS(){
  const staff=await requireStaff(["owner","manager","cashier"]);
  const data=await getPosPageData();
  const client=await createClient();
  const {data:canPost,error}=await client.rpc("public_ordering_status");
  if(error)throw error;
  // Determine the cashier shift from current shared database state, not a
  // repository snapshot that may be stale or associated with another user.
  let shift=data.openShift;
  let products=data.products;
  if(!data.demo){
    const {data:stockRows,error:stockError}=await client.rpc("pos_available_finished_stock");
    if(stockError)throw new Error("Unable to verify finished-goods stock: "+stockError.message);
    const quantities=new Map<string,number>((stockRows??[]).map((s:any)=>[String(s.product_id),Number(s.available_quantity)]));
    products=data.products.map((p:any)=>({...p,available_qty:quantities.get(String(p.id))??0}));

    const {data:shiftRows,error:shiftError}=await client.from("cashier_shifts")
      .select("id,cashier_id,opened_at,status")
      .eq("cashier_id",staff.user!.id)
      .eq("status","open")
      .order("opened_at",{ascending:false}).limit(1);
    if(shiftError)throw shiftError;
    shift=shiftRows?.[0]??null;
  }
  return <PosTerminal products={products} openShift={shift} customers={data.customers}
    live={!data.demo} canPost={data.demo?false:canPost===true}/>;
}
