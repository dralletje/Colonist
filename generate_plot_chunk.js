let { Block, Chunk } = require('./Elements');
const chalk = require('chalk');

const is_between = (n, lower, upper) => {
  return n > lower && n < upper;
}

const set_immediate = () => {
  return new Promise((yell) => {
    setImmediate(() => yell());
  })
}

const generate_plot_chunk = async ({ x, z }) => {
  console.log(chalk.dim(`GENERATING ${x}:${z}`));

  // const generate = (chunk_x, chunk_y, chunk_z) => {
  //   const mod_abs = (x, n) => {
  //     const mod = x % n;
  //     return mod < 0
  //       ? mod + n // Get it just over into positve
  //       : mod;
  //   }
  //   const PLOT_SIZE = 16;
  //   const PATH_SIZE = 2;
  //   const TOTAL_SIZE = PLOT_SIZE + 1 + PATH_SIZE + 1;
  //   const global_x = chunk_x + (x * 16);
  //   const global_z = chunk_z + (z * 16);
  //   const plot_x = mod_abs(global_x, TOTAL_SIZE);
  //   const plot_z = mod_abs(global_z, TOTAL_SIZE);
  //
  //   if (chunk_y < 58) {
  //     return Block.create({ type: 1 });
  //   }
  //   else if (chunk_y < 60) {
  //     return Block.create({ type: 3 });
  //   }
  //   else if (chunk_y === 60) {
  //     if (plot_x < PATH_SIZE || plot_z < PATH_SIZE) {
  //       return Block.create({ type: 44 });
  //     }
  //     else if (plot_x < PATH_SIZE + 1 || plot_z < PATH_SIZE + 1) {
  //       return Block.create({ type: 1, skyLight: 15 });
  //     } else if (plot_x < PATH_SIZE + 1 + PLOT_SIZE || plot_z < PATH_SIZE + 1 + PLOT_SIZE) {
  //       return Block.create({ type: 2, skyLight: 15 });
  //     } else {
  //       return Block.create({ type: 1, skyLight: 15 });
  //     }
  //   // TODO Render actual fence
  //   // } else if (chunk_y === 11) {
  //   //   if (is_between(plot_x, TOTAL_SIZE - 1 || plot_z < TOTAL_SIZE - 1) {
  //   //     return block({ type: 1 });
  //   //   } else {
  //   } else if (chunk_y === 61) {
  //     return Block.create({ type: 0 });
  //   } else {
  //     // return Block.create({ type: 0 });
  //     return null;
  //   }
  // }

  const generate = (chunk_x, chunk_y, chunk_z) => {
    const global_x = Math.abs(chunk_x + (x * 16));
    const global_z = chunk_z + (z * 16);
    const horizontal_distance = Math.abs(Math.sqrt(Math.pow(global_x, 2) + Math.pow(global_z, 2)));

    const radians = Math.atan2(global_x || 1, global_z || 1) * (horizontal_distance * 100);
    const form =
      Math.pow(Math.sin(horizontal_distance / 10), 2) * Math.abs(Math.sin(radians))
      + (radians / horizontal_distance / 100);

    const limit = 60 + form * 50;

    if (chunk_y < limit - 5) {
      return Block.create({ type: 49 });
    }
    else if (chunk_y < limit) {
      return Block.create({ type: 1 });
    } else {
      return Block.create({ type: 0 });
    }
  };

  const generator = Chunk.async_with_generator(generate)(500);

  let chunk = generator.next();
  let i = 0;
  while (chunk.done !== true) {
    await set_immediate();
    chunk = generator.next();
    i = i + 1;
  }
  return chunk.value;
}

module.exports = generate_plot_chunk;
