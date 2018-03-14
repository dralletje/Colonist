const React = {
  createElement: (type, props, ...children) => {
    const { key, priority, ...real_props } = props;

    return {
      type: type,
      key: key,
      priority: priority,
      props: {
        ...real_props,
        children: children,
      },
    };
  }
}

module.exports = React;
