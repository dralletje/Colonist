var mc = require('minecraft-protocol');
const { BehaviorSubject } = require('rxjs');

var server = mc.createServer({
  'online-mode': false, // optional
  encryption: false, // optional
  host: '0.0.0.0', // optional
  port: 25565, // optional
  version: '1.12.1',
});

let storage_memory = {};
let storage_subjects = {};

const storage = {
  set: (path, value) => {
    const key = path.join('.');
    storage_memory[key] = value;
    if (storage_subjects[key]) {
      storage_subjects[key].next(value);
    }
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
  get$: (path) => {
    const key = path.join('.');

    if (storage_subjects[key]) {
      return storage_subjects[key];
    } else {
      storage_subjects[key] = new BehaviorSubject(storage_memory[key])
      return storage_subjects[key];
    }
  },
  reset: () => {
    storage_memory = {};
  }
}

server.on('login', function(client) {
  try {
    delete require.cache[require.resolve('./login')];
    const login_code = require('./login');
    login_code({ client, server, storage });
  } catch (e) {
    console.log('e.stack:', e.stack)
    client.end(e.message);
  }
});
