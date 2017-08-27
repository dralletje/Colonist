# Colonist

### Basic architecture idea

I'm trying to make the server work totally based on cyclejs and observables... wish me luck

On "normal" minecraft server, the processes go kind of like this:

1. Client does something
2. The code listening to packets from that client sends out update packets to the other clients

The important part here is "The code listening to packets from that client".
That code, listening to packet from one client, sends packets to all the other clients.
In my head, that feels odd.
Coming from two years of non-stop react, I want the things that affect the object I'm working with, close to that object... if that makes sense.

So the idea for this server is

1. Client does something
2. The code listening to packet from that client updates state accessible by other code
3. The codes handling other clients pick up the changes and sends out packets to their clients

### Moving parts

- "Server"
  The actual thing clients connect to, but it does not necessarily imply some connection between the clients connected to it (they could be in different "Spaces" and "Worlds")

- "Client"
  Connection to the server, most of the time also
  has a minecraft player bound to it

- "Space"
  Collection of clients that can chat with each other, see each other join and leave, and share a tab list.

- "World"
  Place where players and entities can be placed in,
  where they will visible to other players. I think this also includes the actual chunks but I am not yet 100% sure of that.
