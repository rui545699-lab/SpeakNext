const assert = require('assert');
const fs = require('fs');
const path = require('path');

const functionRoot = path.resolve(__dirname, '..');
const javascriptFiles = [];

function collectFiles(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules') return;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectFiles(target);
    else if (entry.name.endsWith('.js')) javascriptFiles.push(target);
  });
}

collectFiles(functionRoot);

javascriptFiles.forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  const relativeRequire = /require\(['"](\.[^'"]+)['"]\)/g;
  let match;
  while ((match = relativeRequire.exec(source)) !== null) {
    const resolved = require.resolve(path.resolve(path.dirname(file), match[1]));
    assert.ok(resolved, `${path.relative(functionRoot, file)} -> ${match[1]}`);
  }
});

assert.strictEqual(
  require.resolve(path.join(functionRoot, 'lib', 'asr')),
  path.join(functionRoot, 'lib', 'asr.js')
);
console.log(`module-resolution tests passed (${javascriptFiles.length} files)`);
