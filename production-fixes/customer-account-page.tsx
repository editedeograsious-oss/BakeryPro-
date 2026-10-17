import CustomerAccount from "@/components/commerce/CustomerAccount";
import type {Metadata} from "next";
export const metadata:Metadata={title:"DS Bakery Customer Account",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default function Page(){return <CustomerAccount/>;}
