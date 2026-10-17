const assert=require("node:assert/strict");
const {harness,find,button,text}=require("./ui-harness.cjs");

async function check(){
 const base={customer_id:"10000000-0000-4000-8000-000000000001",full_name:"Test Customer",
   credit_enabled:true,credit_limit:35000,available_credit:35000,balance_due:0,terms_days:7};
 let calls=[];
 const client={rpc:async(name,args)=>{calls.push({name,args});return {data:"20000000-0000-4000-8000-000000000001",error:null};}};
 const opts={accounts:[base],ledger:[],live:true,canSetTerms:false,canPostTransactions:true};
 const zero=harness("CreditBookManager.tsx",opts,client);
 const node=zero.render();
 assert(text(node).includes("No debt to repay"),"Explain that available credit is not customer debt");
 assert(text(node).includes("UGX 0"),"Show actual amount owed");
 const paymentButton=button(node,"Record Credit Payment");
 assert(paymentButton?.props.disabled===true,"Disable zero-debt repayment");
 const amount=find(node,n=>n.type==="input"&&n.props.type==="number")[0];
 assert(amount.props.disabled===true,"Disable zero-debt amount entry");
 assert.equal(calls.length,0);

 const indebted=harness("CreditBookManager.tsx",{...opts,accounts:[{...base,balance_due:15000,available_credit:20000}]},client);
 function amountInput(){return find(indebted.render(),n=>n.type==="input"&&n.props.type==="number")[0];}
 amountInput().props.onChange({target:{value:"30000"}});
 const overButton=button(indebted.render(),"Record Credit Payment");
 await overButton.props.onClick();
 assert.equal(calls.length,0,"Overpayment must not call DB");
 assert(text(indebted.render()).includes("outstanding balance"),"Overpayment shows clear reason");

 amountInput().props.onChange({target:{value:"12000"}});
 await button(indebted.render(),"Record Credit Payment").props.onClick();
 assert.equal(calls.length,1,"Valid credit payment posted once");
 assert.equal(calls[0].name,"record_credit_payment");
 assert.equal(calls[0].args.p_amount,12000);
 assert(text(indebted.render()).includes("saved successfully"),"Successful save confirmation present");

 const failClient={rpc:async()=>({data:null,error:{code:"P0001",message:"Credit-book permission required"}})};
 const errorUI=harness("CreditBookManager.tsx",{...opts,accounts:[{...base,balance_due:15000}]},failClient);
 find(errorUI.render(),n=>n.type==="input"&&n.props.type==="number")[0].props.onChange({target:{value:"1000"}});
 await button(errorUI.render(),"Record Credit Payment").props.onClick();
 assert(text(errorUI.render()).includes("Credit-book permission required"),"Expose a legitimate RPC rejection instead of generic failure");
 console.log("PASS: zero debt blocked, overpayment rejected, valid credit saved, and PostgREST error surfaced.");
}
check().catch(e=>{console.error(e);process.exitCode=1;});
