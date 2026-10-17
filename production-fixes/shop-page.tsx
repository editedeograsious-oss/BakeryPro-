import type { Metadata } from "next";
import BakeryShop from "@/components/commerce/BakeryShop";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"DS Bakery | Online Bakery Shop",description:"Order fresh bakery products for pickup or delivery from DS Bakery.",robots:{index:false,follow:false}};
export default async function ShopPage(){
 const sb=await createClient();
 const [p,s,o]=await Promise.all([sb.rpc("public_product_catalog"),sb.rpc("public_site_info"),sb.rpc("public_ordering_status")]);
 return <BakeryShop products={p.error?[]:(p.data??[])} site={s.error?{}:(s.data??{})} orderingAllowed={!o.error&&o.data===true}/>;
}