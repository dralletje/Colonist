let Crap_Block = require('./Block');
let Crap_Chunk = require('./Chunk')();
let { clamp } = require('lodash');

const Block = {
  create: ({ type, damage = 0, skyLight = 0, light = 0 }) => {
    let b = new Crap_Block(type, damage);
    b.skyLight = clamp(0, 15, skyLight);
    b.light = clamp(0, 15, light);
    return b;
  },
}

const Chunk = {
  // create: () => {
  //
  // },
  create_with_generator: (fn) => {
    let chunk = new Crap_Chunk();
    chunk.initialize(fn);
    return chunk;
  },
  async_with_generator: (fn) => {
    return function* (initial_blocks = 0) {
      let chunk = new Crap_Chunk();
      let done = chunk.async_initialize(initial_blocks, fn);
      while (done === false) {
        const amount_of_blocks = yield null;
        done = chunk.async_initialize(amount_of_blocks || initial_blocks, fn);
      }
      yield chunk;
      return chunk;
    }
  },
  load: (raw) => {
    let chunk = new Chunk();
    chunk.load(raw);
    return chunk;
  },
}

const Position = {
  directions: {
    '0': { x: 0, y: -1, z: 0 },
    '1': { x: 0, y: +1, z: 0 },
    '2': { x: 0, y: 0, z: -1 },
    '3': { x: 0, y: 0, z: +1 },
    '4': { x: -1, y: 0, z: 0 },
    '5': { x: +1, y: 0, z: 0 },
  },
  distance_XZ: (a, b) => {
    return Math.abs(Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.z - b.z, 2)))
  },
  add: (a, b) => {
    return {
      x: a.x + b.x,
      y: a.y + b.y,
      z: a.z + b.z,
    };
  },
  multiply: (v, a) => {
    return {
      x: v.x * a,
      y: v.y * a,
      z: v.z * a,
    }
  },
  subtract: (a, b) => {
    return Position.add(a, Position.multiply(b, -1));
  },
  to_chunk: ({ x, z }) => {
    return { x: Math.floor(x / 16), z: Math.floor(z / 16) };
  },
  in_chunk: ({ x, y, z }) => {
    const relative_x = x % 16;
    const relative_z = z % 16;
    return {
      x: (
        relative_x < 0
        ? relative_x + 16
        : relative_x
      ),
      y: y,
      z: (
        relative_z < 0
        ? relative_z + 16
        : relative_z
      ),
    };
  }
};

const Packet = {
  create: (name, data) => {
    return {
      type: 'packet',
      name, data,
    }
  },
};

module.exports = { Block, Chunk, Packet, Position };
