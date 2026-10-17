import type { Metadata } from "next";
import BakeryShop from "@/components/commerce/BakeryShop";
import { createClient } from "@/lib/supabase/server";
import { getPublicSeoOrigin } from "@/lib/seoSite";
export const dynamic="force-dynamic";
export function generateMetadata():Metadata {
 const origin=getPublicSeoOrigin();
 const title="DS Bakery | Cakes & Fresh Bakery Products in Entebbe";
 const description="Explore DS Bakery cakes and baked treats in Entebbe, Uganda. Browse products, request an order and check delivery availability.";
 return {
  title,description,
  robots:{index:Boolean(origin),follow:Boolean(origin)},
  ...(origin?{
    alternates:{canonical:origin+"/shop"},
    openGraph:{title,description,url:origin+"/shop",siteName:"DS Bakery",type:"website" as const}
  }:{})
 };
}
export default async function ShopPage(){
 const sb=await createClient();
 const [p,s,o]=await Promise.all([sb.rpc("public_product_catalog"),sb.rpc("public_site_info"),sb.rpc("public_ordering_status")]);
 return <BakeryShop products={p.error?[]:(p.data??[])} site={s.error?{}:(s.data??{})} orderingAllowed={!o.error&&o.data===true}/>;
}