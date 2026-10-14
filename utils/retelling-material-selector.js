'use strict';

const STORAGE_KEY = 'speaknext_retelling_last_material_id';
const QUEUE_STORAGE_KEY = 'speaknext_retelling_material_queue';
let memoryLastMaterialId = '';
let memoryQueue = [];

function parseQueue(value) {
  if (Array.isArray(value)) return value.slice();
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function defaultStorage() {
  return {
    getLast() {
      if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
        try {
          return String(wx.getStorageSync(STORAGE_KEY) || '');
        } catch (error) {
          return memoryLastMaterialId;
        }
      }
      return memoryLastMaterialId;
    },
    setLast(value) {
      memoryLastMaterialId = String(value || '');
      if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
        try {
          wx.setStorageSync(STORAGE_KEY, memoryLastMaterialId);
        } catch (error) {
          // Memory fallback keeps selection available when storage is unavailable.
        }
      }
    },
    getQueue() {
      if (typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function') {
        try {
          return parseQueue(wx.getStorageSync(QUEUE_STORAGE_KEY));
        } catch (error) {
          return memoryQueue.slice();
        }
      }
      return memoryQueue.slice();
    },
    setQueue(value) {
      memoryQueue = parseQueue(value);
      if (typeof wx !== 'undefined' && typeof wx.setStorageSync === 'function') {
        try {
          wx.setStorageSync(QUEUE_STORAGE_KEY, memoryQueue);
        } catch (error) {
          // Memory fallback keeps the current shuffle cycle available.
        }
      }
    }
  };
}

function adaptStorage(storage) {
  if (!storage) return defaultStorage();
  return {
    getLast: typeof storage.getLast === 'function'
      ? () => storage.getLast()
      : () => (typeof storage.get === 'function' ? storage.get() : ''),
    setLast: typeof storage.setLast === 'function'
      ? (value) => storage.setLast(value)
      : (value) => { if (typeof storage.set === 'function') storage.set(value); },
    getQueue: typeof storage.getQueue === 'function'
      ? () => storage.getQueue()
      : () => [],
    setQueue: typeof storage.setQueue === 'function'
      ? (value) => storage.setQueue(value)
      : () => {}
  };
}

function shuffle(ids, random) {
  const result = ids.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    result[index] = result[swapIndex];
    result[swapIndex] = current;
  }
  return result;
}

function createQueue(ids, lastId, random) {
  const queue = shuffle(ids, random);
  if (queue.length > 1 && queue[0] === lastId) {
    const first = queue[0];
    queue[0] = queue[1];
    queue[1] = first;
  }
  return queue;
}

function sanitizeQueue(queue, validIds) {
  const seen = new Set();
  return parseQueue(queue).filter((id) => {
    if (!validIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function removePreviouslyConsumedId(queue, lastId) {
  if (!lastId) return queue.slice();
  return queue.filter((id) => id !== lastId);
}

function selectNextMaterial(materials, storage, random = Math.random) {
  if (!Array.isArray(materials) || !materials.length) throw new Error('EMPTY_RETELLING_MATERIAL_BANK');
  if (typeof random !== 'function') throw new Error('INVALID_RETELLING_RANDOM_SOURCE');
  const adapter = adaptStorage(storage);
  const ids = materials.map((item) => item.id);
  const validIds = new Set(ids);
  const lastId = String(adapter.getLast() || '');
  let queue = sanitizeQueue(adapter.getQueue(), validIds);
  // A valid persisted queue never contains the most recently consumed item.
  // Removing it here repairs stale/corrupt storage without creating an
  // immediate repeat or duplicating an item inside the current cycle.
  queue = removePreviouslyConsumedId(queue, lastId);
  if (!queue.length) queue = createQueue(ids, lastId, random);

  const selectedId = queue.shift();
  const selected = materials.find((item) => item.id === selectedId);
  adapter.setQueue(queue);
  adapter.setLast(selectedId);
  return selected;
}

module.exports = {
  STORAGE_KEY,
  QUEUE_STORAGE_KEY,
  parseQueue,
  createQueue,
  sanitizeQueue,
  removePreviouslyConsumedId,
  selectNextMaterial
};
