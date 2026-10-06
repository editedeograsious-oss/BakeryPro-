import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/runtime";

const demoInfo={
  business_name:"DS Bakery",
  tagline:"Fresh bakery products for every occasion",
  hero_message:"Freshly baked products, celebration cakes and convenient ordering.",
  phone:"0708743663",
  secondary_phone:"0760547003",
  whatsapp_phone:"0760547003",
  email:"dscakes3@gmail.com",
  address_text:"Kiwafu Lugonjo",
  tiktok_handle:"Ds bakery",
  opening_hours:null,
  custom_cake_enabled:true,
  delivery_enabled:true,
};

const demoCatalog=[
  {id:"p1",name:"Milk Bread",description:"Soft fresh bakery bread.",selling_price:5000,image_url:null,category_name:"Bread",category_display_order:1,product_updated_at:null},
  {id:"p2",name:"Vanilla Cupcake",description:"Classic vanilla cupcake.",selling_price:3500,image_url:null,category_name:"Cakes & Cupcakes",category_display_order:2,product_updated_at:null},
];

export async function getPublicSiteData(){
  if(isDemoMode()) return {info:demoInfo,catalog:demoCatalog,demo:true,orderingOpen:true};

  const supabase=await createClient();
  const [{data:info,error:iErr},{data:catalog,error:cErr},{data:orderingOpen,error:oErr}]=await Promise.all([
    supabase.rpc("public_site_info"),
    supabase.rpc("public_product_catalog"),
    supabase.rpc("public_ordering_status"),
  ]);

  if(iErr)throw iErr;
  if(cErr)throw cErr;
  if(oErr)throw oErr;

  return {info:info??demoInfo,catalog:catalog??[],demo:false,orderingOpen:orderingOpen===true};
}

export async function getPublicSiteSettingsAdmin(){
  if(isDemoMode()) return {settings:demoInfo,demo:true};

  const supabase=await createClient();
  const {data,error}=await supabase
    .from("public_site_settings")
    .select("*")
    .eq("id",1)
    .single();

  if(error)throw error;
  return {settings:data,demo:false};
}
