// @flow

const precondition = (condition, message) => {
  if (!condition)
    throw new Error(`pre: ${message}`);
}

const React = {
  createElement(component, props, children) {
    return {
      type: 'ReactElement',
      component: component,
      props: props,
      children: children,
    }
  },

  Component: class Component {},
};

class Log extends React.Component {
  run({ message }: any) {
    return console.log(message);
  }

  render() {
    return null;
  }
}

const App = () => {
  return (
    <Log message="Hi" />
  )
}

type TElement = {
  type: 'ReactElement',
  component: React.Component | (props: mixed) => TElement,
  props: ?{ [key: String]: mixed },
}

const render = (element: TElement) => {
  if (element === undefined) {
    return element;
  } else if (Array.isArray(element)) {
    return element.map(el => render(el));
  } else if (element.component.prototype && element.component.prototype.render) {
    // $FlowFixMe
    const instance = new element.component();
    // $FlowFixMe
    return instance.render(element.props);
  } else if (typeof element.component === 'function') {
    return render(element.component(element.props));
  }
}



 console.log(render(<App />));
