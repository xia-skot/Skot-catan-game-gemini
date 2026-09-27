const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

// Find start of modal block in main: {/* Exit Options Modal */}
const modalStartStr = '{/* Exit Options Modal */}';
const modalEndStr = '</main>';

const startIndex = content.indexOf(modalStartStr);
const mainEndIndex = content.indexOf(modalEndStr, startIndex);

if (startIndex === -1 || mainEndIndex === -1) {
  console.error("Could not find start or end index for modals in main");
  process.exit(1);
}

const modalBlock = content.substring(startIndex, mainEndIndex);

// Remove modalBlock from main
content = content.substring(0, startIndex) + content.substring(mainEndIndex);

// Find insertion point: after </AnimatePresence> of Right Panel
const targetInsertStr = '</AnimatePresence>\n      <RulesModal';
const insertIndex = content.indexOf(targetInsertStr);

if (insertIndex === -1) {
  console.error("Could not find insertion target after Right Panel");
  process.exit(1);
}

// Insert modalBlock before <RulesModal
const updatedContent = content.substring(0, insertIndex + '</AnimatePresence>'.length) +
  '\n\n      {/* Game Modals (Moved to root of gameContainerRef to cover full viewport including header and panels) */}\n' +
  modalBlock +
  '\n' +
  content.substring(insertIndex + '</AnimatePresence>'.length);

fs.writeFileSync('src/App.tsx', updatedContent);
console.log("Successfully moved game modals to root of gameContainerRef!");
