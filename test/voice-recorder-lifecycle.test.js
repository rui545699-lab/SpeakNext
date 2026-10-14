const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');

function createManager() {
  const handlers = { start: [], stop: [], error: [] };
  return {
    startCalls: 0,
    stopCalls: 0,
    lastOptions: null,
    start(options) { this.startCalls += 1; this.lastOptions = options; },
    stop() { this.stopCalls += 1; },
    onStart(handler) { handlers.start.push(handler); },
    onStop(handler) { handlers.stop.push(handler); },
    onError(handler) { handlers.error.push(handler); },
    offStart(handler) { handlers.start = handlers.start.filter((item) => item !== handler); },
    offStop(handler) { handlers.stop = handlers.stop.filter((item) => item !== handler); },
    offError(handler) { handlers.error = handlers.error.filter((item) => item !== handler); },
    emitStart() { handlers.start.slice().forEach((handler) => handler()); },
    emitStop(result) { handlers.stop.slice().forEach((handler) => handler(result)); },
    emitError(error) { handlers.error.slice().forEach((handler) => handler(error)); }
  };
}

function loadDefinition(manager) {
  let definition;
  global.wx = {
    getRecorderManager: () => manager,
    showToast() {}
  };
  global.Component = (value) => { definition = value; };
  const filename = path.join(root, 'components/voice-recorder/index.js');
  delete require.cache[require.resolve(filename)];
  require(filename);
  delete global.Component;
  return definition;
}

function createInstance(definition, overrides = {}) {
  const events = [];
  return Object.assign({}, definition.methods, {
    data: Object.assign({}, definition.data, {
      mode: 'long',
      maxSeconds: 0,
      seconds: 0
    }, overrides),
    setData(patch) { Object.assign(this.data, patch); },
    triggerEvent(name, detail) { events.push({ name, detail }); },
    events
  });
}

const originalSetInterval = global.setInterval;
const originalClearInterval = global.clearInterval;
global.setInterval = () => 1;
global.clearInterval = () => {};

(async () => {
try {
  const manager = createManager();
  const definition = loadDefinition(manager);

  // Case A/B/C: a full first round, idempotent start/stop, then a clean second round.
  const first = createInstance(definition);
  definition.lifetimes.attached.call(first);
  first.start();
  assert.strictEqual(manager.startCalls, 1, 'duplicate start must be ignored while STARTING');
  manager.emitStart();
  assert.strictEqual(first.recorderState, 'RECORDING');
  first.finish();
  first.finish();
  assert.strictEqual(manager.stopCalls, 1, 'duplicate finish must call stop once');
  manager.emitStop({
    tempFilePath: 'wxfile://first.mp3', duration: 1800, fileSize: 6000
  });
  assert.strictEqual(first.recorderState, 'IDLE');
  assert.strictEqual(first.events.filter((event) => event.name === 'complete').length, 1);
  definition.lifetimes.detached.call(first);

  const second = createInstance(definition);
  definition.lifetimes.attached.call(second);
  assert.strictEqual(manager.startCalls, 2, 'second round must start normally');
  manager.emitStart();
  second.finish();
  assert.strictEqual(manager.stopCalls, 2);
  manager.emitStop({
    tempFilePath: 'wxfile://second.mp3', duration: 2100, fileSize: 7000
  });
  assert.strictEqual(second.recorderState, 'IDLE');
  definition.lifetimes.detached.call(second);

  // Case F: intervention recorder uses the same owner and keeps the 30s cap.
  const intervention = createInstance(definition, { mode: 'short', maxSeconds: 30 });
  definition.lifetimes.attached.call(intervention);
  assert.strictEqual(manager.startCalls, 3);
  assert.strictEqual(manager.lastOptions.duration, 30000);
  manager.emitStart();
  intervention.finish();
  manager.emitStop({
    tempFilePath: 'wxfile://intervention.mp3', duration: 1600, fileSize: 5000
  });
  assert.strictEqual(intervention.recorderState, 'IDLE');
  definition.lifetimes.detached.call(intervention);

  // A short component overlap hands ownership over only after the old onStop.
  const oldInstance = createInstance(definition);
  definition.lifetimes.attached.call(oldInstance);
  manager.emitStart();
  const waitingInstance = createInstance(definition);
  definition.lifetimes.attached.call(waitingInstance);
  assert.strictEqual(manager.startCalls, 4, 'waiting instance must not call native start');
  definition.lifetimes.detached.call(oldInstance);
  assert.strictEqual(manager.stopCalls, 4);
  manager.emitStop({ tempFilePath: '', duration: 0, fileSize: 0 });
  await Promise.resolve();
  assert.strictEqual(manager.startCalls, 5, 'handoff starts only after old onStop');
  manager.emitStart();
  waitingInstance.finish();
  manager.emitStop({ tempFilePath: 'wxfile://handoff.mp3', duration: 1200, fileSize: 4000 });
  definition.lifetimes.detached.call(waitingInstance);

  // Navigation waits until the native manager has released the active owner.
  const exiting = createInstance(definition);
  definition.lifetimes.attached.call(exiting);
  manager.emitStart();
  let exitReleased = false;
  const exitStop = exiting.stopForExit().then(() => { exitReleased = true; });
  assert.strictEqual(exitReleased, false);
  assert.strictEqual(manager.stopCalls, 6);
  manager.emitStop({ tempFilePath: 'wxfile://exit.mp3', duration: 900, fileSize: 3000 });
  await exitStop;
  assert.strictEqual(exitReleased, true);
  assert.strictEqual(exiting.recorderState, 'IDLE');
  definition.lifetimes.detached.call(exiting);

  console.log('voice recorder lifecycle tests passed');
} finally {
  global.setInterval = originalSetInterval;
  global.clearInterval = originalClearInterval;
}
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
