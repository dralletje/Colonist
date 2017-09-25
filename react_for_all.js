// LOOK AT ~/Projects/react-ui NOT THIS

const React = {
  createElement: (type, props, children) => {
    return { type, props, children };
  },

  render_turbo: (element, drivers) => {

  },
};

const App = (props) => {
  return (
    <ui x={100} y={100}>
      <ui block
        x={x => x + 50}
        height={50}
        width={50}
        color="red"
      />
    </ui>
  )
}

const ui_driver = {

}

React.render_turbo(<App />, {
  ui: ui_driver,
})
