const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/return content;\n  };\n\n  let mainContent/g, `return <div style={{ width: '100vw', height: '100dvh', position: 'fixed', top: 0, left: 0, overflow: 'hidden' }}>{content}</div>;\n  };\n\n  let mainContent`);

content = content.replace(/<div className="flex flex-col h-\[100dvh\] w-full bg-slate-50/g, `<div className="flex flex-col h-full w-full bg-slate-50`);

fs.writeFileSync('src/App.tsx', content);
console.log("Fixed wrapper heights");
