const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const returnStatement = '  return (\n    <>\n      {mainContent}';
const replacement = `  return (
    <MotionConfig transformPagePoint={(point) => {
      if (shouldApplyPortraitRotation) {
        return {
          x: point.y,
          y: windowSize.width - point.x
        };
      }
      return point;
    }}>
      <>
        {mainContent}`;

content = content.replace(returnStatement, replacement);

const returnClose = `  );\n}`;
const returnCloseReplacement = `      </>\n    </MotionConfig>\n  );\n}`;

content = content.replace(returnClose, returnCloseReplacement);

fs.writeFileSync('src/App.tsx', content);
console.log("Patched MotionConfig");
