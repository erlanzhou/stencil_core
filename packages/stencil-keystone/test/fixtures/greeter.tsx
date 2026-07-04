import { Component, Event, EventEmitter, Method, Prop } from 'stencil-keystone';

@Component({ name: 'x-greeter', styles: [':host{display:block}'] })
export class Greeter {
  @Prop() name = 'world';
  @Event() greeted: EventEmitter<string>;

  @Method() async greet() {
    this.greeted.emit(this.name);
    return this.name;
  }

  render() {
    return <span>Hello {this.name}</span>;
  }
}
