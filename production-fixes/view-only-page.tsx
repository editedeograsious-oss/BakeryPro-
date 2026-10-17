import {redirect} from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {getCurrentStaff} from "@/lib/auth";
import {createClient} from "@/lib/supabase/server";
import {staffHomePath} from "@/lib/staffHome";
export const dynamic="force-dynamic";
export default async function ViewOnlyWorkspace(){
 const staff=await getCurrentStaff();
 if(!staff)redirect("/login");
 if(String(staff.profile.role)!=="viewer")redirect(staffHomePath(staff.profile.role));
 const sb=await createClient();
 const {data,error}=await sb.rpc("viewer_product_stock");
 if(error)throw new Error("Unable to load view-only catalogue: "+error.message);
 const products=(data??[]) as Array<{product_id:string;name:string;selling_price:number;available_qty:number}>;
 return <div className="shell"><Sidebar/><main className="main">
 <div className="pagehead"><div><h1>View-Only Workspace</h1>
 <p>Live product prices and finished-goods availability. This account cannot change records.</p></div></div>
 <section className="card"><h2>Approved product information</h2>
 <div className="tablewrap"><table><thead><tr><th>Product</th><th>Retail price (UGX)</th><th>Available units</th></tr></thead>
 <tbody>{products.map(p=><tr key={p.product_id}><td>{p.name}</td>
 <td>{Number(p.selling_price).toLocaleString("en-UG")}</td>
 <td>{Number(p.available_qty).toLocaleString("en-UG")}</td></tr>)}</tbody></table></div>
 {products.length===0&&<p>No active products are available.</p>}</section>
 </main></div>;
}