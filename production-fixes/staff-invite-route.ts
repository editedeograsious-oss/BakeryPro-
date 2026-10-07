import { NextResponse } from "next/server";

const ALLOWED_ROLES=["manager","cashier","baker","storekeeper"] as const;

export async function POST(request:Request){
  const authHeader=request.headers.get("authorization")??"";
  if(!authHeader.startsWith("Bearer ")){
    return NextResponse.json({error:"Authentication required."},{status:401});
  }

  const body=await request.json().catch(()=>null);
  const email=String(body?.email??"").trim().toLowerCase();
  const fullName=String(body?.full_name??"").trim();
  const role=String(body?.role??"");

  if(!email||!fullName||!ALLOWED_ROLES.includes(role as any)){
    return NextResponse.json({error:"Valid email, name and staff role are required."},{status:400});
  }

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!publicKey){
    return NextResponse.json({error:"Supabase connection is not configured."},{status:503});
  }

  const redirectTo=`${new URL(request.url).origin}/auth/callback?next=/reset-password`;
  const response=await fetch(`${url}/functions/v1/invite-staff`,{
    method:"POST",
    headers:{
      "content-type":"application/json",
      "authorization":authHeader,
      "apikey":publicKey,
    },
    body:JSON.stringify({email,full_name:fullName,role,redirect_to:redirectTo}),
    cache:"no-store",
  });

  const payload=await response.json().catch(()=>({error:"Staff invitation service returned an invalid response."}));
  return NextResponse.json(payload,{status:response.status});
}
