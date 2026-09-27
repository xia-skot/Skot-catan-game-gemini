const fs = require('fs');

const files = fs.readdirSync('src/components').filter(f => f.endsWith('.tsx')).map(f => 'src/components/' + f);
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/max-h-\[([0-9]+)d?vh\]/g, 'max-h-[$1%]');
  newContent = newContent.replace(/h-\[([0-9]+)d?vh\]/g, 'h-[$1%]');
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log("Fixed vh in " + file);
  }
});
