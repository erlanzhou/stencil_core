import { BUILD } from '@app-data';
import { Component, h, Prop, State } from '@stencil/core';
import { newSpecPage } from '@stencil/core/testing';

/**
 * Under `taskQueue: 'immediate'`, `scheduleUpdate` dispatches synchronously. When a
 * lifecycle callback that runs *during* a host's own update — e.g. `componentDidRender`,
 * `componentDidUpdate`, a `@Watch` — writes state, the resulting `scheduleUpdate`
 * re-enters `updateComponent` synchronously while the current one is still on the stack,
 * corrupting the in-flight vdom patch ("Cannot read properties of null (reading 'nodeType')").
 *
 * The fix defers a *reentrant* immediate dispatch to a microtask, so the follow-up render
 * runs after the current cycle unwinds instead of recursing into it. Top-level immediate
 * updates stay synchronous.
 *
 * We detect the bug by measuring the synchronous nesting depth of `componentDidRender`:
 * a reentrant (synchronous) re-render nests it (depth 2); a microtask-deferred re-render
 * runs it flat (depth 1).
 */
describe("taskQueue: 'immediate' lifecycle reentrancy", () => {
  let depth = 0;
  let maxDepth = 0;
  let renders = 0;

  @Component({ tag: 'cmp-didrender' })
  class CmpDidRender {
    @Prop() trigger = 0;
    @State() measured = 0;

    render() {
      renders++;
      return <div>{this.measured}</div>;
    }

    componentDidRender() {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
      // "measure, then set state" pattern: converge `measured` to `trigger`.
      // Convergent (settles once measured === trigger), and each write is a real change.
      if (this.measured !== this.trigger) {
        this.measured = this.trigger;
      }
      depth--;
    }
  }

  const originalTaskQueue = BUILD.taskQueue;
  afterEach(() => {
    BUILD.taskQueue = originalTaskQueue;
  });

  it('does not synchronously re-enter render when componentDidRender writes state', async () => {
    // mount in async so the initial render behaves normally
    BUILD.taskQueue = true;
    const { root, waitForChanges } = await newSpecPage({
      components: [CmpDidRender],
      html: `<cmp-didrender></cmp-didrender>`,
    });
    await waitForChanges();

    // switch platform to 'immediate' and drive one external update
    BUILD.taskQueue = false;
    depth = 0;
    maxDepth = 0;
    renders = 0;

    (root as any).trigger = 1;
    await waitForChanges();

    // the componentDidRender-driven re-render must NOT nest synchronously inside the
    // current render cycle. Before the fix this recurses (maxDepth === 2).
    expect(maxDepth).toBe(1);
    // and it still converges to exactly one follow-up render, with the DOM reflecting
    // the state written from componentDidRender
    expect(renders).toBe(2);
    expect(root.textContent).toBe('1');
  });
});
