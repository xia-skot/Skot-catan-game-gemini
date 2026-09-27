const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const mainOpenIndex = content.indexOf('<main className="flex-1 relative flex flex-col min-h-0 bg-stone-100/50">');
const mainCloseIndex = content.lastIndexOf('</main>');

if (mainOpenIndex === -1 || mainCloseIndex === -1) {
    console.log("Could not find main tags");
    process.exit(1);
}

const beforeMain = content.slice(0, mainOpenIndex);
let insideMain = content.slice(mainOpenIndex, mainCloseIndex);
const afterMain = content.slice(mainCloseIndex);

// Replace all 'fixed inset-0' with 'absolute inset-0' inside the <main> tag
insideMain = insideMain.replace(/fixed inset-0/g, 'absolute inset-0');

fs.writeFileSync('src/App.tsx', beforeMain + insideMain + afterMain);
console.log("Patched modals to use absolute positioning inside map area.");
