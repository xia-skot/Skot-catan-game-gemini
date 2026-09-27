const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
const mainOpen = content.indexOf('<main className="flex-1 relative flex flex-col min-h-0 bg-stone-100/50">');
const mainClose = content.lastIndexOf('</main>');
const fixedInsets = [];
const lines = content.split('\n');
lines.forEach((line, i) => {
    if (line.includes('fixed inset-0')) {
        const index = content.indexOf(line);
        fixedInsets.push({ lineNum: i + 1, inMain: index > mainOpen && index < mainClose });
    }
});
console.log(fixedInsets);
