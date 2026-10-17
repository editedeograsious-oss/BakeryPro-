import Sidebar from "@/components/Sidebar";
import OwnerCommerce from "@/components/commerce/OwnerCommerce";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export default async function Page(){
 await requireStaff(["owner"]);
 const sb=await createClient();
 const [p,r]=await Promise.all([
  sb.from("products").select("id,name,status,selling_price,image_url,online_available").order("name"),
  sb.from("product_reviews").select("id,product_id,display_name,rating,review_text,status,created_at").order("created_at",{ascending:false}).limit(100)
 ]);
 if(p.error)throw p.error;
 if(r.error)throw r.error;
 return <div className="shell"><Sidebar/><main className="main"><OwnerCommerce products={p.data??[]} reviews={r.data??[]}/></main></div>;
}