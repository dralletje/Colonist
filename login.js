let Promise = require('bluebird');
let { isEqual, fromPairs, range, flatten } = require('lodash');
let xstream = require('xstream').default;
let dropRepeats = require('xstream/extra/dropRepeats').default;
let { Block, Chunk, Packet, Position } = require('./Elements');
let chalk = require('chalk');

const json_or_just_text = json => {
  try {
    return JSON.parse(json);
  } catch (e) {
    return json;
  }
};

const React = {
  createElement: (type, props, children) => {
    const { key, priority, ...real_props } = props;

    return {
      type: type,
      key: key,
      priority: priority,
      props: real_props,
    };
  }
}

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
    start: (listener) => {
      try {
        fn(...args).then(x => {
          listener.next(x);
          listener.complete();
        })
        .catch(x => {
          listener.error(x);
        })
      } catch (e) {
        console.log('e:', e);
      }
    },
    stop: () => {},
  })
}

const chat_select = (client) => {
  return client.select('chat').map(packet => {
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

const Component = {
  create: (type_definition) => {
    // TODO Do some stuff that we need to apply to components?
    // Some symbol to indicate it really is a component?
    return type_definition;
  },
};

const Load_Chunk = Component.create({
  should_component_update: (oldprops, nextprops) => {
    return oldprops.x !== nextprops.x || oldprops.z !== nextprops.z;
  },
  create: xstream_from_async(async chunk_props => {
    try {
      const chunkdata = await chunk_props.generate(chunk_props);

      let gen = chunkdata.dump();
      let chunkdump = gen.next();
      while (chunkdump.done !== true) {
        await set_immediate();
        chunkdump = gen.next();
      }

      return Packet.create('map_chunk', {
        x: chunk_props.x,
        z: chunk_props.z,
        groundUp: true,
        bitMap: 0xffff,
        chunkData: chunkdump.value,
        blockEntities: [],
      });
    } catch (e) {
      console.log('e:', e)
    }
  }),
  // update: (chunk) => {
  //   console.log(chalk.green('UPDATE! chunk:'), chunk);
  //   return xstream.empty();
  // },
  destroy: (chunk_props) => {
    return xstream.of(Packet.create('unload_chunk', {
      chunkX: chunk_props.x,
      chunkZ: chunk_props.z,
    }))
  },
});

/*
lowercase components are base components. IN PRINCIPLE, this should be
one for every way the output could change. Examples

<audio />
<packet />
<ui />

Every one of those is the smallest atom you can get for playing sounds,
sending packets and showing a user interface,

They all present a type of render. react-dom can be used for ui
(might need to rename it as we get pretty far from react),
audio can be rendered with react-audio, etc...

They all get registered down where you render your app:
React.render(<App />, {
  ui: react_dom(),
  audio: react_audio(),
  packet: react_packet(), // Might rename this network or something
});

### Parent elements

<ui backgroundColor="blue" fontSize={16}>
  <ui backgroundColor="red" />
</ui>

FOr the above example, the result would be a red background,
and font-size 16. Base packets can only change children of their own kind.
Adding a prop on a <ui /> element will never influence how the <audio /> or <network /> element render.

In theory, the child receives the props of it's parent and can changes them to its likings.
Most of the time it will involve simply merging the parent and childs props (where child props win).
Components can, if they need to, perform any transformation on the props.

DisplayBlockUI components (with a capital, it is a custom component) could, for example,
use the props of its parent to calculate where and how it should position.
(Yeah, I think you can literally model any program this way, beautifully)

ERR
UI determines how it should look on a two way "conversation" between the
parent and the child :-/

Atoms (eg <ui />) can also have a function as children, to pass in data it retrieved.
This retrieval happens on the top, at the specified renderer for that atom.
Every time render of a func-as-child is done, that code is sent back up to the
place it left of (to fetch the data) and continue rendering like it was a state update.



The line for lowercase components is really odd, as ofcourse you can break it down
much much further, so maybe we will turn them into lower level ones later idk

Also good one: <http />
and <cpu computation={fn} />

*/

module.exports.main = ({ storage, client }) => {
  console.log(chalk.green(`Client connected (${chalk.blue(client.username)})`));
  client.on_end$.addListener({
    complete: () => {
      console.log(chalk.red(`Client disconnected (${chalk.blue(client.username)})`));
    },
  })

  const spawn = {
    x: 0,
    y: 245,
    z: -13,
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
      const initialized = await generate_plot_chunk({ x, z });
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
      // xstream.of(
      //   <packet
      //     name="login"
      //     data={{
      //       entityId: client.id,
      //       levelType: 'default',
      //       gameMode: 1,
      //       dimension: 0,
      //       difficulty: 2,
      //       maxPlayers: 20,
      //       reducedDebugInfo: false,
      //     }}
      //   />
      // ),
      location_view(client, my_location$),
      chunks_to_load$.map(chunks => {
        return chunks.map(chunk =>
          <Load_Chunk
            key={`${chunk.x}:${chunk.z}`} // TODO object keys?
            priority={Math.ceil(chunk.distance)}
            x={chunk.x}
            z={chunk.z}
            generate={retrieve_chunk} // TODO this should be func-as-child component
          />
        );
      })
      .compose(render_elements(5))
    ),
  }
}
