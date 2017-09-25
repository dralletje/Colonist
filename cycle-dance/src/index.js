import React from 'react';
import './App.css';
import ReactDOM from 'react-dom';
import Cycle from './Cycle';

class CycleRunner extends React.Component {
  componentDidMount() {
    Cycle(this.container);
  }

  render() {
    return (
      <div ref={ref => this.container = ref} />
    );
  }
}

ReactDOM.render(<CycleRunner />, document.getElementById('root'));
