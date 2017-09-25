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
