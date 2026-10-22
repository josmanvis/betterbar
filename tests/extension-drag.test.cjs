const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { transform } = require('sucrase');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness() {
  const calls = [], changes = [], errors = [], outcomes = [];
  let finish, fail;
  const hooks = { useRef: value => ({ current: value }), useState: value => [value, () => {}] };
  const code = transform(fs.readFileSync('src/extension-drag.ts', 'utf8'), { transforms: ['typescript', 'imports'] }).code;
  const exports = {};
  new Function('exports', 'require', code)(exports, id => id === 'react' ? hooks : {
    invoke: (cmd, args) => { calls.push({ cmd, args }); return new Promise((resolve, reject) => { finish = resolve; fail = reject; }); },
  });
  let captured = false;
  const target = { setPointerCapture: () => { captured = true; }, hasPointerCapture: () => captured, releasePointerCapture: () => { captured = false; } };
  const event = (values = {}) => ({ clientX: 10, clientY: 10, button: 0, buttons: 1, isPrimary: true, pointerId: 1, currentTarget: target,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values });
  const { dragProps: props } = exports.useDragSource({ paths: ['/Applications/Example.app'], onError: error => errors.push(error), onDragEnd: result => outcomes.push(result), onDraggingChange: value => changes.push(value) });
  return { props, event, calls, changes, errors, outcomes, finish: value => finish(value), fail: error => fail(error) };
}

test('a click or subthreshold movement never starts a native drag', () => {
  const h = harness();
  h.props.onPointerDown(h.event()); h.props.onPointerMove(h.event({ clientX: 14 })); h.props.onPointerUp(h.event());
  const click = h.event({ detail: 1 }); h.props.onClickCapture(click);
  assert.equal(click.prevented, undefined); assert.equal(h.calls.length, 0);
});

test('drag starts once with paths, suppresses the click, and reports completion', async () => {
  const h = harness(); h.props.onPointerDown(h.event());
  h.props.onPointerMove(h.event({ clientX: 20 })); h.props.onPointerMove(h.event({ clientX: 30 }));
  assert.deepEqual(h.calls, [{ cmd: 'start_extension_drag', args: { paths: ['/Applications/Example.app'] } }]);
  assert.deepEqual(h.changes, [true]);
  const click = h.event({ detail: 1 }); h.props.onClickCapture(click);
  assert.equal(click.prevented, true); assert.equal(click.stopped, true);
  h.finish('dropped'); await tick();
  assert.deepEqual(h.outcomes, ['dropped']); assert.deepEqual(h.changes, [true, false]);
  const keyboard = h.event({ detail: 0 }); h.props.onClickCapture(keyboard); assert.equal(keyboard.prevented, undefined);
  h.props.onPointerDown(h.event()); h.props.onPointerUp(h.event());
  const next = h.event({ detail: 1 }); h.props.onClickCapture(next); assert.equal(next.prevented, undefined);
});

test('cancelled and failed drags release busy state without enabling launch clicks', async () => {
  for (const failure of [false, true]) {
    const h = harness(); h.props.onPointerDown(h.event()); h.props.onPointerMove(h.event({ clientY: 30 }));
    if (failure) h.fail(new Error('unavailable')); else h.finish('cancelled');
    await tick();
    assert.deepEqual(h.changes, [true, false]); assert.equal(h.errors.length, failure ? 1 : 0);
    assert.deepEqual(h.outcomes, failure ? [] : ['cancelled']);
    const click = h.event({ detail: 1 }); h.props.onClickCapture(click); assert.equal(click.prevented, true);
  }
});

test('ignores secondary buttons, unrelated pointers, lost capture, and a released button', () => {
  for (const values of [{ button: 2 }, { isPrimary: false }]) {
    const h = harness(); h.props.onPointerDown(h.event(values)); h.props.onPointerMove(h.event({ clientX: 30 })); assert.equal(h.calls.length, 0);
  }
  for (const stop of ['onPointerCancel', 'onPointerUp', 'onLostPointerCapture']) {
    const h = harness(); h.props.onPointerDown(h.event()); h.props[stop](h.event()); h.props.onPointerMove(h.event({ clientX: 30 })); assert.equal(h.calls.length, 0);
  }
  const h = harness(); h.props.onPointerDown(h.event()); h.props.onPointerMove(h.event({ pointerId: 2, clientX: 30 }));
  h.props.onPointerMove(h.event({ buttons: 0, clientX: 30 })); assert.equal(h.calls.length, 0);
});
