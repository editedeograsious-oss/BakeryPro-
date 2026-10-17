import PosTerminal from "@/components/core/PosTerminal";
import {requireStaff} from "@/lib/auth";
import {getPosPageData} from "@/lib/repositories/coreLive";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

export default async function POS(){
  await requireStaff(["owner","manager","cashier"]);
  const data=await getPosPageData();
  const client=await createClient();
  const {data:canPost,error}=await client.rpc("public_ordering_status");
  if(error)throw error;
  return <PosTerminal products={data.products} openShift={data.openShift} customers={data.customers}
    live={!data.demo} canPost={data.demo?false:canPost===true}/>;
}
