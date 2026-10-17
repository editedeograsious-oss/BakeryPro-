import {NextRequest,NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import type {EmailOtpType} from "@supabase/supabase-js";
export async function GET(request:NextRequest){
  const code=request.nextUrl.searchParams.get("code");
  const tokenHash=request.nextUrl.searchParams.get("token_hash");
  const type=request.nextUrl.searchParams.get("type");
  const client=await createClient();
  let error:unknown=null;
  if(code){
    const result=await client.auth.exchangeCodeForSession(code);
    error=result.error;
  }else if(tokenHash&&type){
    const allowed:EmailOtpType[]=["signup","email","recovery","invite","magiclink","email_change"];
    if(allowed.includes(type as EmailOtpType)){
      const result=await client.auth.verifyOtp({token_hash:tokenHash,type:type as EmailOtpType});
      error=result.error;
    }else{error=new Error("Invalid confirmation type");}
  }else{error=new Error("Missing confirmation code");}
  const destination=new URL("/shop/account",request.url);
  if(error)destination.searchParams.set("verification","failed");
  return NextResponse.redirect(destination);
}
