'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const project = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
const ignored = project.packOptions.ignore;

function hasRule(type, value) {
  return ignored.some((rule) => rule.type === type && rule.value === value);
}

assert.strictEqual(project.miniprogramRoot, './');
assert.strictEqual(project.cloudfunctionRoot, 'cloudfunctions/');
assert.strictEqual(project.setting.uploadWithSourceMap, false);
assert.ok(hasRule('folder', 'eval'));
assert.ok(hasRule('folder', 'test'));
assert.ok(hasRule('suffix', '.test.js'));
assert.ok(hasRule('suffix', '.md'));
assert.ok(hasRule('suffix', '.map'));

['pages', 'components', 'utils', 'data', 'mock', 'config'].forEach((folder) => {
  assert.ok(!hasRule('folder', folder), `${folder} must stay in the runtime package`);
});
['app.js', 'app.json', 'app.wxss', 'sitemap.json'].forEach((file) => {
  assert.ok(!hasRule('file', file), `${file} must stay in the runtime package`);
});

assert.ok(fs.existsSync(path.join(root, 'test', 'retelling-flow.test.js')),
  'tests must be retained in the repository');
assert.ok(fs.existsSync(path.join(root, 'eval', 'run-eval.js')),
  'Eval tools must be retained in the repository');

console.log('package size cleanup tests passed');
