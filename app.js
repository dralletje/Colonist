const mc = require('minecraft-protocol');
const { run } = require('@cycle/run');
const xstream = require('xstream').default;

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

const create_server_driver = (server) => (packets$) => {
  packets$.subscribe({
    next: (packet) => {
      packet.to.write(packet.name, packet.data);
    },
    complete: () => {
      console.log('SERVER DONE');
    },
  });

  const client_connect$event =
    fromEvent(server, 'login')
    .map(client =>
      xstream.merge(
        xstream.of({ type: 'add', item: client }),
        fromEvent(client, 'end').mapTo({ type: 'delete', item: client })
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
      }, []),
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

const client_select = (client) => {
  return {
    uuid: client.uuid,
    id: client.id,
    username: client.username,

    // Naming for this one is odd?
    on_end$: fromEvent(client, 'end').take(1),
    select: (packet_name) =>
      fromEvent(client, 'packet', args => args)
      .filter(([data, metadata]) => metadata.name === packet_name)
      .map(([data]) => data),
  };
}

const client_view = (client, packets$) => {
  return packets$.map(packet => {
    // I don't do immutable here because I am afraid of the
    // performance... I know.. I know...
    packet.to = client;
    return packet;
  })
}

/*:flow
type TState = 'The reduced state result of fold'
type TEvent = 'The stuff going into fold, being reduced'
type Tfold = (reducer: (acc: TState, item: TEvent) => TState, seed: TState) => TState
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

const stream_of_added_items =
  expand((prev_items, next_items) => {
    return next_items.filter(x => !prev_items.includes(x));
  })

const server_main = ({ mcserver }) => {


  const create_client_component = (client) => {
    clear_require_cache();
    const login_code = require('./login');

    const client$ = client_select(client);

    const { client: client_packets$ } = login_code.main({
      storage: storage,
      client: client$,
    });

    return client_view(client, client_packets$).endWhen(client$.on_end$);
  }

  const packets_from_clients$events =
  mcserver.clients$
  .startWith([])
  .compose(stream_of_added_items)
  .map(client => create_client_component(client))
  .compose(flattenConcurrently);

  return {
    mcserver: packets_from_clients$events,
  }
};

let mcserver = mc.createServer({
  'online-mode': false, // optional
  encryption: false, // optional
  host: '0.0.0.0', // optional
  port: 25565, // optional
  version: '1.12.1',
});

run(server_main, {
  mcserver: create_server_driver(mcserver),
})
