const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const brokenSmartImgEnd = `    />
      </>
    </MotionConfig>
  );
};`;

const fixedSmartImgEnd = `    />
  );
};`;

content = content.replace(brokenSmartImgEnd, fixedSmartImgEnd);
fs.writeFileSync('src/App.tsx', content);
console.log("Fixed SmartImg");
