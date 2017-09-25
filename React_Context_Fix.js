// @flow

import React from 'react';

class SmallObservable<T> {
  value: T;

  listeners = new Map();

  constructor(value: T) {
    this.value = value;
  }

  subscribe(fn: () => void) {
    const key_object = {};
    this.listeners.set(key_object, fn);
    return () => {
      this.listeners.delete(key_object);
    };
  }

  get(): T {
    return this.value;
  }

  set(value: T) {
    this.value = value;
    this.listeners.forEach(listener => {
      listener();
    });
  }
}

const SafeContextType = {
  safe_context_map: React.PropTypes.any,
}
const surely_get = <TKey, TValue, TOut>(map: Map<TKey, TValue>, key: TKey, mapFn: (value: TValue) => TOut): any => {
  const value = map.get(key);
  if (!value)
    return null;
  else
    return mapFn(value);
}

const create_context_components = (options: { name: string, devId?: string }) => {
  const { name = 'Unnamed' } = options || {};
  // const key_object = { name, i: Math.random() };
  const key_object = name;

  class Provider<T> extends React.PureComponent {
    static displayName = `${name}Provider`;

    static childContextTypes = SafeContextType;
    static contextTypes = SafeContextType;

    props: {
      value: any;
      children: any;
    }

    // $FlowFixMe
    observable = new SmallObservable(this.props.value);

    getChildContext() {
      console.log('key_object+:', key_object)
      const map_clone = new Map(this.context.safe_context_map);
      map_clone.set(key_object, this.observable);
      return { safe_context_map: map_clone };
    }

    render() {
      return this.props.children;
    }
  }

  class Receiver<T> extends React.PureComponent {
    static displayName = `${name}Receiver`;
    static contextTypes = SafeContextType;

    unlisten: () => void;
    context: {
      safe_context_map: Map<any, SmallObservable<T>>,
    };
    props: {
      children?: () => React$Element<any>,
    };

    state = {
      value: surely_get(this.context.safe_context_map, key_object,
        _ => _.get()
      ),
    }

    componentDidMount() {
      console.log('key_object:', key_object)
      this.unlisten = surely_get(this.context.safe_context_map, key_object, _ =>
        _.subscribe(() => {
          this.setState({
            value: surely_get(this.context.safe_context_map, key_object, _ => _.get()),
          })
        })
      )
    }

    componentWillUnmount() {
      if (this.unlisten)
        this.unlisten();
    }

    render() {
      const { children } = this.props;
      const { value } = this.state;

      if (typeof children === 'function') {
        return children(value)
      } else {
        return null;
      }
    }
  }

  return { Provider, Receiver };
}

export default create_context_components;
