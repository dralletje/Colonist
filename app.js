const mc = require('minecraft-protocol');
const { run } = require('@cycle/run');
const xstream = require('xstream').default;
const chalk = require('chalk');

const flattenConcurrently = require('xstream/extra/flattenConcurrently').default;
const pairwise = require('xstream/extra/pairwise').default;

const rxjs_init = (fn) => {
  return xstream.create({
    start: function(listener) {
      this.end_handler = fn(listener);
    },
    stop: function() {
      if (typeof this.end_handler === 'function') {
        this.end_handler();
      }
    },
  })
}

let storage_memory = {};
const storage = {
  set: (path, value) => {
    const key = path.join('.');
    storage_memory[key] = value;
  },
  get: async (path, default_factory = () => undefined) => {
    const key = path.join('.');

    if (storage_memory[key]) {
      return storage_memory[key]
    } else {
      const default_value = default_factory();
      storage_memory[key] = default_value;
      return default_value;
    }
  },
  reset: () => {
    storage_memory = {};
  },
};

const clear_require_cache = () => {
  Object.keys(require.cache).forEach(key => {
    delete require.cache[key];
  });
};

const precondition = (condition, message) => {
  if (!condition) {
    throw new Error(`${message}`);
  }
}

const create_server_driver = (server) => (packets$) => {
  let packet_output_symbol = Symbol(`Receiver of the packets sent to this client object`);

  packets$.subscribe({
    next: (packet) => {
      precondition(packet.type === 'packet', `Non-packet being sent to packet`);
      packet.props.to[packet_output_symbol].write(packet.props.name, packet.props.data);
    },
    complete: () => {
      console.log('SERVER DONE');
    },
  });

  // id = x => x
  // (f * g)(x) = f(x => g(x))

  // Connect / Disconnect events -> aggregate () -> current_online_clients

  const client_connect$event =
    fromEvent(server, 'login')
    // Turn the client objects into more observable-friendly format
    .map((client_raw) => {
      return {
        [packet_output_symbol]: client_raw,
        uuid: client_raw.uuid,
        id: client_raw.id,
        username: client_raw.username,

        // Naming for this one is odd?
        on_end$: fromEvent(client_raw, 'end').take(1),
        select: (packet_name) =>
          fromEvent(client_raw, 'packet', args => args)
          .filter(([data, metadata]) => metadata.name === packet_name)
          .map(([data]) => data),
      };
    })
    .map(client =>
      xstream.merge(
        xstream.of({ type: 'add', item: client }),
        client.on_end$.mapTo({ type: 'delete', item: client })
      )
    )
    .flatten()

  return {
    clients$: client_connect$event
      .fold((acc, event) => {
        if (event.type === 'add') {
          return [...acc, event.item];
        } else if (event.type === 'delete') {
          return acc.filter(x => x !== event.item);
        } else {
          throw new Error(`Unknown event type '${event.type}'`);
        }
      }, [])
  };
}

const fromEvent = (emitter, event, map_args = args => args[0]) => {
  return rxjs_init(listener => {
    const handler = (...args) => {
      listener.next(map_args(args));
    };
    emitter.on(event, handler);
    return () => {
      emitter.removeListener(event, handler);
    }
  })
}

/*:flow
type TState = 'The reduced state result of fold'
type TEvent = 'The stuff going into fold, being reduced'
type Tfold = (reducer: (acc: TState, event: TEvent) => TState, seed: TState) => TState
type Texpand = (expander: (prev: TState, next: TState) => TEvent, seed: TState) => TEvent

// Here you can see how expand is the opposite of fold/reduce
*/
const expand = (fn, seed) => (input$) => {
  return input$
    .compose(pairwise)
    .map(([prev, next]) => {
      return xstream.fromArray(fn(prev, next));
    })
    .flatten();
}

/*:flow
// Reducer
type TChange = TEvent;
let Next_State = (state: TState, change: TChange): TState => {

}
let Change = (state: TState, next_state: TState): TChange => {

}
*/
// let Next_State = (previous_state, change) => {
//
// }
// let Change = (previous_state, next_state) => {
//
// }
// let Previous_State = (next_state, change) => {
//
// }
let React = require('./React');

const array_changes =
  expand((prev_items, next_items) => {
    return [
      ...next_items.filter(x => !prev_items.includes(x)).map(x => {
        return {
          type: 'added',
          payload: x,
        }
      }),
      prev_items.filter(x => next_items.includes(x))
      .map(x => {
        return {
          type: 'removed',
          payload: x,
        }
      }),
    ];
  })

const { get_changes_map } = require('./flattenParallel');

const server_main = ({ mcserver }) => {
  console.log(chalk.green(`Server started!`));

  const Client_Component = ({ for: client, onPacket }) => {
    clear_require_cache();
    const login_code = require('./login');

    const { client: client_packets$ } = login_code.main({
      storage: storage,
      client: client,
    });

    // return (
    //   <subscribe
    //     to={client_packets$}
    //     handle={onPacket}
    //   />
    // );
    return client_packets$;
  }

  // let { render_parallel } = require('./render_parallel');
  let render_parallel = (input$) => {
    return input$.compose(flattenConcurrently)
  }

  /*
  render_parallel = (children$) => {
    let mounted_children = Map<>;

    for (let current_children of children$) {
      let changes = get_changes(mounted_children, current_children);
    }
  }
  */

  const packets_from_clients$events =
    mcserver.clients$
    .startWith([])
    // .compose(stream_of_added_items)
    .map(clients => {
      return clients.map(x =>
        <packet key={x.uuid} to={x}>
          <Client_Component for={x} />
        </packet>
      );
    })
    .compose(render_parallel);
    // .map(client => {
    //
    //     // return (
    //     //   <packet to={client}>
    //     //     {packet}
    //     //   </packet>
    //     // )
    //   })

    // })

  return {
    mcserver: packets_from_clients$events,
  }
};

let mcserver = mc.createServer({
  'online-mode': false, // optional
  encryption: false, // optional
  host: '0.0.0.0', // optional
  port: 25565, // optional
  version: '1.12.2',
});

run(server_main, {
  mcserver: create_server_driver(mcserver),
})
