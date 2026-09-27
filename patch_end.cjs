const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const endOfApp = `        />
      )}
    </>
  );
}`;

const newEndOfApp = `        />
      )}
      </>
    </MotionConfig>
  );
}`;

content = content.replace(endOfApp, newEndOfApp);
fs.writeFileSync('src/App.tsx', content);
console.log("Patched end of App component");
