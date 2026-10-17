const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../production-fixes");
const cases={
 "ExpenseManager.tsx":["amount"],
 "InventoryManager.tsx":["lowThreshold","packQty","counted"],
 "PurchaseReceivingPanel.tsx":["quantities[l.id]"],
 "PayrollManager.tsx":["basic","allowances","deductions","advanceAmount"],
 "CreditBookManager.tsx":["limit","terms","payAmount"],
 "SupplierAccountsPanel.tsx":["amount"],
 "PurchaseOrderManager.tsx":["creditDays","discount","editCreditDays","editDiscount","line.ordered_qty_base","line.unit_cost_base"]
};
for(const [name,fields] of Object.entries(cases)){
 const src=fs.readFileSync(path.join(root,name),"utf8");
 for(const field of fields){
   const expected=`value={${field}===0?"":${field}`;
   assert(src.includes(expected),`${name}: ${field} still displays a zero prefix`);
 }
}
console.log("PASS: 19 management amount and quantity inputs use blank-zero editable state.");
