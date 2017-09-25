import xstream from 'xstream'
import {run} from '@cycle/run'
import { makeDOMDriver, div, span } from '@cycle/dom'
import {timeDriver} from '@cycle/time'
import { mergeWith } from 'lodash/fp';

const chalk = require('chalk');
const flattenConcurrently = require('xstream/extra/flattenConcurrently').default;
const pairwise = require('xstream/extra/pairwise').default;

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

const React = {
  fingerprint: Symbol('React Element Type'),
  createElement(type, props, children) {
    return {
      typeof$$: React.fingerprint,
      type,
      props: {
        children: Array.isArray(children) ? children : [children].filter(Boolean),
        ...props,
      }
    };
  },
};

const precondition = (condition, message) => {
  if (!condition) {
    throw new Error(`${message}`);
  }
}

const echo_driver = (packets$) => {
  return packets$;
};

// TODO Check for unit less numbers, so I don't abuse on flex or font-weight
const css_size = (n) => typeof n === 'number' ? `${n}px` : n;

const main = ({ DOM, Time, Echo$ }) => {

  const plus = (x) => y => x + y;

  const Shadow = ({ spread, blur, color, children }) => {
    return <group>
      <testrun driver="ui">{(props) =>
        <group>
          <ui x={plus(-10)} y={plus(-10)} height={plus(20)} width={plus(20)}  />

          {children}
        </group>
      }</testrun>
    </group>
  }

  const ui = xstream.of(
    <ui x={10} y={10} height={100} width={100} color="red">
      <Shadow spread={2} blur={5} color="rgba(0,0,0,.5)">
        <ui x={plus(10)} y={plus(10)} color="green">

        </ui>
      </Shadow>
    </ui>
  )

  const inherit_merge = mergeWith((parent_prop, prop_or_fn) => {
    if (typeof prop_or_fn === 'function') {
      console.log('prop_or_fn, parent_prop:', prop_or_fn, parent_prop)
      return prop_or_fn(parent_prop);
    } else if (prop_or_fn == null) {
      return parent_prop;
    } else {
      return prop_or_fn;
    }
  });

  const render_ui = (element, parent_props) => {
    const { props } = element;
    const merged_props = inherit_merge(parent_props, props)

    if (element.type === 'ui') {
      return div({
        style: {
          position: 'absolute',
          top: css_size(merged_props.x),
          left: css_size(merged_props.y),
          height: css_size(merged_props.height),
          width: css_size(merged_props.width),
          backgroundColor: merged_props.color,
          hooks: merged_props.hooks,
        }
      }, props.children.map(child => render_ui(child, merged_props)) || []);
    }
    else if (typeof element.type === 'function') {
      return render_ui(element.type(props), merged_props);
    }
    else if (element.type === 'group') {
      return render_ui(<ui>{element.props.children.map(child => render_ui(child, parent_props))}</ui>);
    } else if (element.type === 'testrun') {
      return render_ui(
        <ui
          hooks={{
            insert: () => {
              console.log('HEY');
            },
          }}
        >
          {element.props.children.map(child_fn => render_ui(child_fn, parent_props))}
        </ui>
      );
    } else {
      throw new Error(`No type '${element.type}'`);
    }
  }

  console.log('HEY')
  return {
    DOM: ui.map(element => {
      if (element.type === 'ui') {
        return render_ui(element);
      } else {
        throw new Error(`Not UI type`);
      }
    }),
  };
}

export default (dom_container) => {
  run(main, {
    DOM: makeDOMDriver(dom_container),
    Time: timeDriver,
    Echo$: echo_driver,
  });
}
