

const W = base_fn => (rec_fn => base_fn(() => rec_fn(rec_fn)))(rec_fn => base_fn(() => rec_fn(rec_fn)))

const Y = (base_fn) => (f => f(f))((f) => base_fn((x) => (f(f))(x)))

const fac = Y(f => n => {
  if (n < 2) {
    return 1;
  } else {
    console.log('n:', n);
    console.log('f:', f);
    return n * f(n - 1);
  }
});

const zmq = require('zeromq');
const sock = zmq.socket('sub');
const zlib = require('zlib');

sock.connect('tcp://vid.openov.nl:6702');
sock.subscribe('')
console.log('Worker connected to port 3000');

sock.on('message', function(topic, message){
  console.log('work:', zlib.unzipSync(message).toString());
});
