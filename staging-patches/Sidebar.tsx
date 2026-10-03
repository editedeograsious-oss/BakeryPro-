import Link from "next/link";

type MenuItem = { href:string; label:string };
type MenuSection = { title:string; items:MenuItem[] };

const sections:MenuSection[] = [
  {
    title:"Daily Operations",
    items:[
      {href:"/dashboard",label:"Dashboard"},
      {href:"/pos",label:"Sales / POS"},
      {href:"/daily-closing",label:"Daily Closing"},
      {href:"/cash-movements",label:"Cash In / Out"},
      {href:"/shifts",label:"Cashier Shifts"},
    ],
  },
  {
    title:"Products & Stock",
    items:[
      {href:"/products",label:"Products & Prices"},
      {href:"/inventory",label:"Inventory"},
      {href:"/recipes",label:"Recipes & Costing"},
      {href:"/stock-movements",label:"Stock Movements"},
    ],
  },
  {
    title:"Production",
    items:[
      {href:"/production",label:"Daily Bake Plan"},
      {href:"/baker-tasks",label:"Baker Tasks"},
      {href:"/waste",label:"Waste Tracking"},
      {href:"/production-control",label:"Production Control"},
    ],
  },
  {
    title:"Purchases & Suppliers",
    items:[
      {href:"/purchase-orders",label:"Purchase Orders"},
      {href:"/suppliers",label:"Suppliers"},
      {href:"/purchases",label:"Purchases & Receiving"},
      {href:"/supplier-accounts",label:"Supplier Accounts"},
    ],
  },
  {
    title:"Customers & Growth",
    items:[
      {href:"/customers",label:"Customers"},
      {href:"/customer-orders",label:"Customer Orders"},
      {href:"/custom-cakes",label:"Custom Cakes"},
      {href:"/deliveries",label:"Deliveries"},
      {href:"/delivery-riders",label:"Delivery Riders"},
      {href:"/loyalty",label:"Loyalty & Rewards"},
      {href:"/customer-retention",label:"Customer Retention"},
      {href:"/communications",label:"WhatsApp Communication"},
      {href:"/message-templates",label:"Message Templates"},
    ],
  },
  {
    title:"Finance & Reports",
    items:[
      {href:"/expenses",label:"Expenses"},
      {href:"/reports",label:"Financial Reports"},
    ],
  },
  {
    title:"Team",
    items:[
      {href:"/staff",label:"Staff & Roles"},
      {href:"/attendance",label:"Attendance"},
      {href:"/staff-schedule",label:"Staff Schedule"},
      {href:"/permission-overrides",label:"Individual Permissions"},
    ],
  },
  {
    title:"Website",
    items:[
      {href:"/public-site-settings",label:"Public Website Settings"},
    ],
  },
];

const systemItems:MenuItem[] = [
  {href:"/system-status",label:"System Status"},
  {href:"/go-live-setup",label:"Go-Live Setup"},
  {href:"/validation",label:"Production Validation"},
  {href:"/staging-connection",label:"Staging Connection"},
  {href:"/validation-history",label:"Validation History"},
  {href:"/environment",label:"Environment Safety"},
  {href:"/production-cutover",label:"Production Cutover"},
  {href:"/activity-log",label:"Activity Log"},
  {href:"/security",label:"Security"},
];

function SectionLabel({children}:{children:string}){
  return <div style={{
    margin:"18px 10px 6px",
    fontSize:10,
    fontWeight:900,
    letterSpacing:".12em",
    textTransform:"uppercase",
    color:"var(--muted)"
  }}>{children}</div>;
}

function MenuLinks({items}:{items:MenuItem[]}){
  return <div style={{display:"grid",gap:4}}>
    {items.map(item=><Link key={item.href} href={item.href}>{item.label}</Link>)}
  </div>;
}

export default function Sidebar() {
  return (
    <aside className="sidebar" style={{overflowY:"auto"}}>
      <div className="brand">
        <img src="/ds-bakery-logo.png" alt="DS Bakery" />
        <div>
          <strong>DS Bakery</strong>
          <small>Master System v0.35</small>
        </div>
      </div>

      <div style={{
        marginBottom:12,
        padding:"10px 12px",
        border:"1px solid var(--line)",
        borderRadius:12,
        background:"var(--cream)"
      }}>
        <div style={{fontWeight:850,color:"var(--brown)",fontSize:12}}>Business Control Centre</div>
        <div style={{fontSize:10,color:"var(--muted)",marginTop:3}}>Daily bakery tools first</div>
      </div>

      <nav className="nav" style={{display:"block"}}>
        {sections.map(section=><div key={section.title}>
          <SectionLabel>{section.title}</SectionLabel>
          <MenuLinks items={section.items}/>
        </div>)}

        <details style={{marginTop:18}}>
          <summary style={{
            cursor:"pointer",
            listStyle:"none",
            padding:"11px 12px",
            borderRadius:12,
            fontWeight:900,
            color:"var(--brown)",
            background:"var(--cream2)",
            border:"1px solid var(--line)"
          }}>System & Setup</summary>
          <div style={{marginTop:6}}>
            <MenuLinks items={systemItems}/>
          </div>
        </details>
      </nav>

      <div style={{
        marginTop:24,
        padding:"12px",
        borderTop:"1px solid var(--line)",
        color:"var(--muted)",
        fontSize:11,
        lineHeight:1.5
      }}>
        Everyday business tools are shown first. Technical staging and go-live controls are grouped under System & Setup.
      </div>
    </aside>
  );
}
