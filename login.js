let Chunk = require('./Chunk')();
let Block = require('./Block');
let spiralloop = require('spiralloop');
let { Observable } = require('rxjs');
let Promise = require('bluebird');
let { clamp } = require('lodash');

const spiral = (arr) =>
{
  const t=[];
  spiralloop(arr,(x,z) => {
    t.push([x,z]);
  });
  return t;
}

const send_nearby_chunks = ({ chunk, view }) => {
  return spiral([view*2,view*2])
    .map(t => ({
      x: chunk.x + t[0] - view,
      z: chunk.z + t[1] - view
    }));
};

const load_chunk = (raw) => {
  let chunk = new Chunk();
  chunk.load(raw);
  return chunk;
}

const initialize_chunk = (fn) => {
  let chunk = new Chunk();
  chunk.initialize(fn);
  return chunk;
}

const set_immediate = () => {
  return new Promise((yell) => {
    setImmediate(() => yell());
  })
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

const id = x => x;

const directions = {}

module.exports = ({ client, server, storage }) => {
  // const world_storage = scoped_storage({
  //   storage: storage,
  //   path_map: ({ x, y }) => [`world`, x, y],
  //   load: (chunkdata) => {
  //     return load_chunk(chunkdata);
  //   },
  //   dump: (chunk) => {
  //     return chunk.dump();
  //   },
  //   default_fn: ({x, y}) => {
  //     return initialize_chunk((x, y, z) => {
  //       if (y < 60) {
  //         const b = new Block(5, 0);
  //         b.skyLight = 15;
  //         b.light = 15;
  //         return b;
  //       } else {
  //         const b = new Block(0, 0);
  //         b.skyLight = 15;
  //         b.light = 15;
  //         return b;
  //       }
  //     });
  //   },
  // })

  const client$ = Observable.create(observer => {
    observer.next(client);
    client.on('end', () => {
      console.log('CLIENT IS ENDING')
      observer.next(null);
    });
    return () => {
      // TODO End subscription
    }
  });

  client.on('error', (err) => {
    console.log('CLIENT err:', err)
  });

  const client_send = (_client, packet) => {
    _client.write(packet.name, packet.data);
  }
  const client_send$ = (observable) => {
    observable
    .takeUntil(client$.filter(client => client == null))
    .subscribe((packet) => {
      client_send(client, packet);
    });
  }
  const broadcast = (packet) => {
    Object.values(server.clients).forEach(_client => {
      console.log('Broadcasted to', _client.username);
      client_send(_client, packet);
    });
  }
  const broadcast_nearby = (packet) => {
    Object.values(server.clients).forEach(_client => {
      if (_client.id !== client.id) {
        console.log('Broadcasted to', _client.username);
        client_send(_client, packet);
      }
    });
  }

  client.write('login', {
    entityId: client.id,
    levelType: 'default',
    gameMode: 1,
    dimension: 0,
    difficulty: 2,
    maxPlayers: server.maxPlayers,
    reducedDebugInfo: false,
  });

  const retrieve_chunk = async ({x, z}) => {
    const chunk = await storage.get([`world`, x, z]);
    await set_immediate();

    if (chunk) {
      // console.log('CHUNK from storage', x, z)
      return chunk;
    } else {
      // console.log('CHUNK from generation', x, z)
      const initialized = initialize_chunk((chunk_x, chunk_y, chunk_z) => {
        const global_x = chunk_x + (x * 16);
        const global_z = chunk_z + (z * 16);
        const horizontal_distance = Math.sqrt(Math.pow(global_x, 2) + Math.pow(global_z, 2));

        const radians = Math.atan2(global_x, global_z) * 4;
        const form = Math.sin(horizontal_distance / 10) * Math.sin(radians);
        if (chunk_y < (60 + form * 50)) {

          const b = new Block(5, 0);
          b.skyLight = 15;
          b.light = 15;
          return b;
        } else {
          const b = new Block(0, 0);
          b.skyLight = 15;
          b.light = 15;
          return b;
        }
      });
      storage.set([`world`, x, z], initialized);
      return initialized;
    }
  };

  Promise.all([
    storage.get([`user`, client.uuid, `position`], () => {
      return {
        x: 0,
        y: 70,
        z: 0,
      }
    }),
    storage.get([`user`, client.uuid, `look`], () => {
      return {
        yaw: 0,
        pitch: 0,
      }
    })
  ]).then(([position, look]) => {
    client.write('position', Object.assign({
      flags: 0x00,
    }, position, look));

    // Update all other players
    broadcast_nearby(Packet.create('player_info', {
      action: 0,
      data: [{
        UUID: client.uuid,
        name: client.username,
        properties: client.profile ? client.profile.properties : [],
        gamemode: 2,
        ping: 100,
      }],
    }));
    broadcast_nearby(Packet.create('named_entity_spawn', Object.assign({
      entityId: client.id,
      playerUUID: client.uuid,
      metadata: [],
      yaw: clamp(0, 10, look.yaw),
      pitch: Math.abs(look.pitch) % 255,
    }, position)));

    // Update self
    client_send(client, Packet.create('player_info', {
      action: 0,
      data: Object.values(server.clients).map((_client) => {
        return {
          UUID: _client.uuid,
          name: _client.username,
          properties: _client.profile ? client.profile.properties : [],
          gamemode: 2,
          ping: 100,
        };
      }),
    }));
    Object.values(server.clients)
    .filter(_client => client.id !== _client.id)
    .map((_client) => {
      return Packet.create('named_entity_spawn', {
        entityId: _client.id,
        playerUUID: _client.uuid,
        metadata: [],
        yaw: 1,
        pitch: 1,
        x: 0,
        y: 60,
        z: 0,
      })
    })
    .forEach(packet => client_send(client, packet));
  });

  client.loaded_chunks = {};
  setTimeout(() => {
    client_send$(
      storage.get$([`user`, client.uuid, `position`])
      .filter(Boolean)
      .map(Position.to_chunk)
      .distinctUntilChanged((a, b) => a.x === b.x && a.z === b.z)
      .takeUntil(client$.filter(x => x === null))
      .switchMap((chunk) => {
        console.log('SENDING NEW CHUNKS');
        return Observable.from(
          send_nearby_chunks({
            chunk,
            view: client.settings ? client.settings.viewDistance : 12,
          })
        )
        .filter(chunk => {
          const x_chunk_sent = client.loaded_chunks[chunk.x] || {};
          const chunk_sent = x_chunk_sent[chunk.z];
          return !chunk_sent;
        })
        .mergeMap(async (chunk) => {
          const chunkdata = await retrieve_chunk(chunk);
          return Packet.create('map_chunk', {
            x: chunk.x,
            z: chunk.z,
            groundUp: true,
            bitMap: 0xffff,
            chunkData: chunkdata.dump(),
            blockEntities: [],
          });
        }, undefined, 1)
        .do(packet => {
          const chunk = packet.data;
          if (!client.loaded_chunks[chunk.x]) {
            client.loaded_chunks[chunk.x] = {};
          }
          client.loaded_chunks[chunk.x][chunk.z] = true;
        })
      })

    );
  }, 500);

  const json_or_just_text = json => {
    try {
      return JSON.parse(json);
    } catch (e) {
      return json;
    }
  };

  const capitalize = (text) => {
    return text[0].toUpperCase() + text.slice(1);
  }

  client.on('chat', function(packet) {
    // Listen for chat messages and echo them back.
    var jsonMsg = json_or_just_text(packet.message);
    // if(jsonMsg.translate == 'chat.type.announcement' || jsonMsg.translate == 'chat.type.text') {
    //   var username = jsonMsg.with[0].text;
    //   var msg = jsonMsg.with[1];
    //   if(username === client.username) return;
    //   client.write('chat', {message: msg});
    // }

    if (jsonMsg === '/reset') {
      client.write('kick_disconnect', { reason: '"Resetting you"' });
      storage.reset();
    }

    broadcast(Packet.create('chat', {
      message: JSON.stringify({
        text: '',
        extra: [
          {
            text: '[Mercury] ',
            color: 'dark_blue',
          },
          {
            text: `${capitalize(client.username)}: `,
            color: 'dark_purple',
            clickEvent: {
              action: 'suggest_command',
              value: `§5@${client.username} §f`,
            },
            hoverEvent: {
              action: 'show_text',
              value: `Click to chat!`,
            },
          },
          {
            text: jsonMsg,
            color: 'gray',
          },
        ],
      }),
    }));
  });

  const ignored_packet_names = [
    'keep_alive', 'chat', 'arm_animation',
    'entity_action', 'flying', 'teleport_confirm',
  ]
  client.inventory = {};
  client.active_slot = 0;

  client.on('packet', async (data, metadata) => {
    if (ignored_packet_names.includes(metadata.name)) {
      return;
    }

    if (metadata.name === 'set_creative_slot') {
      client.inventory[data.slot] = data.item;
      console.log('data.slot, data.item:', data.slot, data.item)
      return;
    }

    if (metadata.name === 'held_item_slot') {
      client.active_slot = data.slotId;
      return;
    }

    if (metadata.name === 'block_place') {
      // Quickbar => inventory = quickbar_slot + 36
      const item = client.inventory[client.active_slot + 36];
      if (item == null) {
        console.log('Building with nothing');
        return;
      }

      const block_location = Position.add(data.location, Position.directions[data.direction]);
      const chunk = Position.to_chunk(block_location);
      const in_chunk = Position.in_chunk(block_location);
      const chunkdata = await storage.get([`world`, chunk.x, chunk.z]);
      chunkdata.setBlockType(in_chunk, item.blockId);
      chunkdata.setBlockData(in_chunk, item.itemDamage);
      storage.set([`world`, chunk.x, chunk.z], chunkdata);
    }

    if (metadata.name === 'block_dig') {
      const chunk = Position.to_chunk(data.location);
      const in_chunk = Position.in_chunk(data.location);
      const chunkdata = await storage.get([`world`, chunk.x, chunk.z]);
      chunkdata.setBlockType(in_chunk, 0);
      storage.set([`world`, chunk.x, chunk.z], chunkdata);
      return;
    }

    if (metadata.name === 'settings') {
      client.settings = data;
    }

    if (metadata.name === 'tab_complete') {
      const { text } = data;
      client.write('tab_complete', {
        matches: ['WTF'],
      });
      return;
    }

    if (metadata.name === 'position') {
      // const old_position = await storage.get([`user`, client.uuid, `position`]);
      storage.set([`user`, client.uuid, `position`], data);

      // const diff = Position.subtract(old_position, data);
      // broadcast_nearby(Packet.create('rel_entity_move', {
      //   entityId: client.id,
      //   dX: diff.x,
      //   dY: diff.y,
      //   dZ: diff.z,
      //   onGround: data.onGround,
      // }));
      broadcast_nearby(Packet.create('entity_teleport', {
        entityId: client.id,
        x: data.x,
        y: data.y,
        z: data.z,
        yaw: 1,
        pitch: 1,
        onGround: data.onGround
      }));
      return;
    }

    if (metadata.name === 'look') {
      storage.set([`user`, client.uuid, `look`], data);
      return;
    }

    if (metadata.name === 'position_look') {
      const { x, y, z, yaw, pitch } = data;
      storage.set([`user`, client.uuid, `look`], { yaw, pitch });
      storage.set([`user`, client.uuid, `position`], { x, y, z });
      return;
    }

    console.log('NAME:', metadata.name);
    console.log('data:', data);

  })

  var msg = {
    translate: 'chat.type.announcement',
    with: ['Server', 'Hello, world!'],
  };

  client.write('chat', { message: JSON.stringify(msg), position: 0 });
}
