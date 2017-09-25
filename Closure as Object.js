/*
Can a closure be represented soley as an object with prototype?
This could be much more performant if we return factory functions but want to
make them fast.
*/

const createElement = (type, { key, ref, ...props }, children) => {
  return {
    type: type,
    ref: ref,
    props: {
      ...props,
      children: props.children || children,
    },
    mount: (child_element) => {
      return {
        type: 'HTML instance',
        child: child_element
      }
    },
  };
}

class CreateElement_1 {
  constructor(type, { key, ref, ...props }) {
    this.type = type;
    this.ref = ref;
    this.props = {
      ...props,
    };
  }
}

const create_element_1 = (p1, p2, p3) => new CreateElement_1(p1, p2, p3);

class App{};
const c_0 = createElement(App, { key: 1, height: 100, width: 50 });
const c_1 = create_element_1(App, { key: 1, height: 100, width: 50 });

console.log('c_0:', c_0);
console.log('c_1:', c_1);
