let Promise = require('bluebird');
let { isEqual, fromPairs, range, flatten } = require('lodash');
let xstream = require('xstream').default;
let dropRepeats = require('xstream/extra/dropRepeats').default;
let { Block, Chunk, Packet, Position } = require('./Elements');

const json_or_just_text = json => {
  try {
    return JSON.parse(json);
  } catch (e) {
    return json;
  }
};

const send_nearby_chunks = ({ chunk, view }) =>
  flatten(
    range(chunk.x - view, chunk.x + view).map(x =>
      range(chunk.z - view, chunk.z + view).map(z => {
        return { x, z };
      })
    )
  )
  .map(pos => {
    return Object.assign({}, pos, {
      distance: Position.distance_XZ(chunk, pos),
    });
  });

const set_immediate = () => {
  return new Promise((yell) => {
    setImmediate(() => yell());
  })
}

const capitalize = (text) => {
  return text[0].toUpperCase() + text.slice(1);
};

// module.exports = ({ client, server, clients$, storage }) => {
//   client.on('error', (err) => {
//     console.log('CLIENT err:', err)
//   });
//
//   const client_send = (_client, packet) => {
//     _client.write(packet.name, packet.data);
//   }
//
//   const broadcast = (packet) => {
//     Object.values(server.clients).forEach(_client => {
//       client_send(_client, packet);
//     });
//   }
//   const broadcast_nearby = (packet) => {
//     Object.values(server.clients).forEach(_client => {
//       if (_client.id !== client.id) {
//         console.log('Broadcasting to', _client.username);
//         client_send(_client, packet);
//       }
//     });
//   }
//
//   if (false) {
//     broadcast(
//       Packet.create('chat', {
//         message: JSON.stringify({ text: `§5* ${client.username} §7has joined!` }),
//       })
//     );
//
//     // Update all other players
//     broadcast_nearby(Packet.create('player_info', {
//       action: 0,
//       data: [{
//         UUID: client.uuid,
//         name: client.username,
//         properties: client.profile ? client.profile.properties : [],
//         gamemode: 2,
//         ping: 100,
//       }],
//     }));
//     // broadcast_nearby(Packet.create('named_entity_spawn', Object.assign({
//     //   entityId: client.id,
//     //   playerUUID: client.uuid,
//     //   metadata: [],
//     //   yaw: clamp(0, 10, look.yaw),
//     //   pitch: Math.abs(look.pitch) % 255,
//     // }, position)));
//   }
//
//   Object.values(server.clients)
//   .filter(_client => client.id !== _client.id)
//   .map((_client) => {
//     return Packet.create('named_entity_spawn', {
//       entityId: _client.id,
//       playerUUID: _client.uuid,
//       metadata: [],
//       yaw: 1,
//       pitch: 1,
//       x: 0,
//       y: 60,
//       z: 0,
//     })
//   })
//   .forEach(packet => client_send(client, packet));
//
//   const ignored_packet_names = [
//     'keep_alive', 'chat', 'arm_animation',
//     'entity_action', 'flying', 'teleport_confirm',
//   ]
//   client.inventory = {};
//   client.active_slot = 0;
//
//   client.on('packet', async (data, metadata) => {
//     if (ignored_packet_names.includes(metadata.name)) {
//       return;
//     }
//
//     if (metadata.name === 'set_creative_slot') {
//       client.inventory[data.slot] = data.item;
//       console.log('data.slot, data.item:', data.slot, data.item)
//       return;
//     }
//
//     if (metadata.name === 'held_item_slot') {
//       client.active_slot = data.slotId;
//       return;
//     }
//
//     if (metadata.name === 'block_place') {
//       // Quickbar => inventory = quickbar_slot + 36
//       const item = client.inventory[client.active_slot + 36];
//       if (item == null) {
//         console.log('Building with nothing');
//         return;
//       }
//
//       const block_location = Position.add(data.location, Position.directions[data.direction]);
//       const chunk = Position.to_chunk(block_location);
//       const in_chunk = Position.in_chunk(block_location);
//       const chunkdata = await storage.get([`world`, chunk.x, chunk.z]);
//       chunkdata.setBlockType(in_chunk, item.blockId);
//       chunkdata.setBlockData(in_chunk, item.itemDamage);
//
//       storage.set([`world`, chunk.x, chunk.z], chunkdata);
//       broadcast_nearby(Packet.create('block_change', {
//         location: block_location,
//         type: (item.blockId << 4)  | (item.itemDamage & 15),
//       }));
//       return;
//     }
//
//     if (metadata.name === 'block_dig') {
//       const chunk = Position.to_chunk(data.location);
//       const in_chunk = Position.in_chunk(data.location);
//       const chunkdata = await storage.get([`world`, chunk.x, chunk.z]);
//       chunkdata.setBlockType(in_chunk, 0);
//       storage.set([`world`, chunk.x, chunk.z], chunkdata);
//       broadcast_nearby(Packet.create('block_change', {
//         location: data.location,
//         type: 0,
//       }))
//       return;
//     }
//
//
//
//   });
// }

let last_positions = new WeakMap();
const update_weakmap = (map, key, updater) => {
  const next = updater(map.get(key));
  map.set(key, next);
  return next;
}

const select_location = (client) => {
  return xstream.merge(
    client.select('position'),
    client.select('look'),
    client.select('position_look')
  )
  .map(x => {
    return update_weakmap(last_positions, client, (old) => {
      return Object.assign({}, old, x);
    });
  })
  .compose(dropRepeats(isEqual))
  .remember()
}

const settings_select = (client) => {
  return client.select('settings');
}

const diff_keys = (prev, next) => {
  return fromPairs(
    Object.entries(next).filter(([key, value]) => {
      return value !== prev[key];
    })
  )
}

const location_view = (client, location$) => {
  return location$
    .filter(position => {
      const lp = last_positions.get(client) || {};

      const diff = diff_keys(lp, position);
      if (Object.keys(diff).length !== 0) {
        console.log('diff_keys(lp, position):', diff);
        return true;
      }
      return false;
    })
    .map(position => {
      console.log('SENDING', position);
      last_positions.set(client, position);
      return Packet.create('position', Object.assign({
        flags: 0x00,
      }, position));
    })
}

const generate_plot_chunk = require('./generate_plot_chunk');
const render_elements = require('./flattenParallel');

const xstream_from_async = (fn) => (...args) => {
  return xstream.create({
    start: (listeners) => {
      fn(...args).then(x => {
        listeners.next(x);
        listeners.complete();
      })
      .catch(x => {
        listeners.error(x);
      })
    },
    stop: () => {},
  })
}

const chat_select = (client) => {
  return client.select('chat').map(packet => {
    console.log('packet:', packet)
    var message = json_or_just_text(packet.message);
    return {
      username: client.username,
      message,
    }
  });
}

// TODO Make this into... not an event? :-/ HOW?!
const chat_view = (messages$event) => {
  return messages$event.map(({ username, message }) => {
    return Packet.create('chat', {
      message: JSON.stringify({
        text: '',
        extra: [
          {
            text: '[Mercury] ',
            color: 'dark_blue',
          },
          {
            text: `${capitalize(username)}: `,
            color: 'dark_purple',
            clickEvent: {
              action: 'suggest_command',
              value: `§5@${username} §f`,
            },
            hoverEvent: {
              action: 'show_text',
              value: `Click to chat!`,
            },
          },
          {
            text: message,
            color: 'gray',
          },
        ],
      }),
    });
  });
};

const random_UUID = () => {
  throw new Error(`Generate random UUID not implemented yet`);
}

const tablist_view = (tablist_items$) => {
  return tablist_items$.map(tablist_items => {
    return Packet.create('player_info', {
      action: 0,
      data: Object.values(tablist_items).map((item) => {
        return {
          UUID: item.UUID || random_UUID(),
          name: item.name,
          properties: item.properties || [],
          gamemode: item.gamemode || 2,
          ping: item.ping || 100,
        };
      }),
    });
  });
}

const chunk_view = (client, retrieve_chunk, visible_chunks$) => {
  const Load_Chunk = {
    create: xstream_from_async(async chunk => {
      await Promise.delay(50);
      const chunkdata = await retrieve_chunk(chunk);
      return Packet.create('map_chunk', {
        x: chunk.x,
        z: chunk.z,
        groundUp: true,
        bitMap: 0xffff,
        chunkData: chunkdata.dump(),
        blockEntities: [],
      });
    }),
    destroy: (chunk) => {
      return xstream.of(Packet.create('unload_chunk', {
        chunkX: chunk.x,
        chunkZ: chunk.z,
      }))
    },
  };

  return visible_chunks$
  .map((chunks) => {
    // This returns an array of "elements" that can be resolveds
    return chunks.map(chunk => {
      return {
        type: Load_Chunk,
        key: `${chunk.x}:${chunk.z}`, // TODO object keys?
        priority: Math.ceil(chunk.distance),
        props: {
          x: chunk.x,
          z: chunk.z,
        },
      }
    })
  })
  .compose(render_elements(3))
  // .debug(x => {
  //   if (x.name === 'unload_chunk') {
  //     console.log('x:', x)
  //   }
  // })
}

module.exports.main = ({ storage, client }) => {
  const spawn = {
    x: 0,
    y: 100,
    z: 0,
    yaw: 0,
    pitch: 0,
  };

  const client_settings$ = settings_select(client);
  const location_from_client$ = select_location(client);
  const my_location$proxy = xstream.create();

  const possible_location$ = location_from_client$
  // .fold((from, to) => {
  //   if (to.x > 10) {
  //     return from;
  //   }
  //   return to;
  // })
  .filter(x => Boolean(x))

  const my_location$ =
    xstream.merge(
      possible_location$,
      xstream.fromPromise(storage.get([`user`, client.uuid, `position`], () => spawn))
    )
    .debug(x => {
      storage.set([`user`, client.uuid, `position`], x);
    });

  my_location$proxy.imitate(my_location$);

  const my_chunk$ = my_location$
    .map(Position.to_chunk)
    .compose(dropRepeats(isEqual))

  const chunks_to_load$ =
    xstream.combine(my_chunk$, client_settings$)
    .map(([chunk, client_settings]) => {
      return send_nearby_chunks({
        chunk,
        view: client_settings ? client_settings.viewDistance : 12,
      });
    });

  const retrieve_chunk = async ({x, z}) => {
    const chunk = await storage.get([`world`, x, z]);
    await set_immediate();

    if (chunk) {
      // console.log('CHUNK from storage', x, z)
      return chunk;
    } else {
      // console.log('CHUNK from generation', x, z)
      // broadcast(Packet.create('chat', {
      //   message: JSON.stringify({
      //     text: 'Generating more chunks...',
      //   }),
      //   position: 2,
      // }));
      const initialized = generate_plot_chunk({ x, z });
      storage.set([`world`, x, z], initialized);
      return initialized;
    }
  };

  const chat$events = chat_select(client);

  return {
    client: xstream.merge(
      tablist_view(xstream.of([
        { name: 'Heya', UUID: 'xxxx' },
      ])),
      chat_view(chat$events),
      client.select('tab_complete').map((x) => {
        return Packet.create('tab_complete', { matches: [String(Date.now())] })
      }),
      xstream.of(Packet.create('login', {
        entityId: client.id,
        levelType: 'default',
        gameMode: 1,
        dimension: 0,
        difficulty: 2,
        maxPlayers: 20,
        reducedDebugInfo: false,
      })),
      location_view(client, my_location$),
      chunk_view(client, retrieve_chunk, chunks_to_load$)
    ),
  }
}
