const fs = require('fs');
let file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');
let newContent = content.replace(/max-h-\[([0-9]+)d?vh\]/g, 'max-h-[$1%]');
if (content !== newContent) {
  fs.writeFileSync(file, newContent);
  console.log("Fixed vh in " + file);
} else {
  console.log("No vh to fix in " + file);
}
