const fs=require("fs");
const path=require("path");
const root=process.argv[2]||"/app/site";
const replacements=[
  ["â","—"],["â","–"],["â¢","•"],["â¦","…"],["â","→"],
  ["Â©","©"],["Ã","×"],["â°","☰"],["â","●"],["â","✓"],
  ["â","✔"],["â ","⚠"]
];
function walk(p){
  for(const name of fs.readdirSync(p)){
    const full=path.join(p,name);
    const st=fs.statSync(full);
    if(st.isDirectory()){
      if(!["node_modules",".next",".git"].includes(name))walk(full);
    }else if(/\.(tsx|ts|jsx|js|md)$/.test(name)){
      let text=fs.readFileSync(full,"utf8");
      let next=text;
      for(const [bad,good] of replacements)next=next.split(bad).join(good);
      if(next!==text)fs.writeFileSync(full,next,"utf8");
    }
  }
}
walk(root);
