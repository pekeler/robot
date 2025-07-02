import {
  createMachine,
  interpret,
  invoke,
  reduce,
  state,
  transition,
  immediate,
  guard,
} from "../machine.js";

QUnit.module("States", (hooks) => {
  QUnit.test("Basic state change", (assert) => {
    assert.expect(5);
    let machine = createMachine({
      one: state(transition("ping", "two")),
      two: state(transition("pong", "one")),
    });
    let service = interpret(machine, (service) => {
      assert.ok(true, "Callback called");
    });
    assert.equal(service.machine.current, "one");
    service.send("ping");
    assert.equal(service.machine.current, "two");
    service.send("pong");
    assert.equal(service.machine.current, "one");
  });

  QUnit.test("Data can be passed into the initial context", (assert) => {
    let machine = createMachine(
      {
        one: state(),
      },
      (ev) => ({ foo: ev.foo })
    );

    let service = interpret(machine, () => {}, {
      foo: "bar",
    });

    assert.equal(service.context.foo, "bar", "works!");
  });

  QUnit.test("First argument sets the initial state", (assert) => {
    let machine = createMachine("two", {
      one: state(transition("next", "two")),
      two: state(transition("next", "three")),
      three: state(),
    });

    let service = interpret(machine, () => {});
    assert.equal(service.machine.current, "two", "in the initial state");

    machine = createMachine("two", {
      one: state(transition("next", "two")),
      two: state(),
    });
    service = interpret(machine, () => {});
    assert.equal(service.machine.current, "two", "in the initial state");
    assert.equal(service.machine.state.value.final, true, "in the final state");
  });

  QUnit.test(
    "Child machines receive the event used to invoke them",
    (assert) => {
      let child = createMachine(
        {
          final: state(),
        },
        (ctx, ev) => ({ count: ev.count })
      );
      let parent = createMachine({
        start: state(transition("next", "next")),
        next: invoke(
          child,
          transition(
            "done",
            "end",
            reduce((ctx, ev) => ({
              ...ctx,
              ...ev.data,
            }))
          )
        ),
        end: state(),
      });
      let service = interpret(parent, () => {});
      service.send({ type: "next", count: 14 });
      assert.equal(service.context.count, 14, "event sent through");
    }
  );

  QUnit.test("State reducer runs on initial state", (assert) => {
    let machine = createMachine({
      one: state(reduce((ctx) => ({ ...ctx, initialized: true }))),
    });
    let service = interpret(machine, () => {});
    assert.equal(
      service.context.initialized,
      true,
      "state reducer ran on initial state"
    );
  });

  QUnit.test(
    "State reducer runs when entering state via transition",
    (assert) => {
      let machine = createMachine({
        one: state(transition("go", "two")),
        two: state(reduce((ctx) => ({ ...ctx, entered: true }))),
      });
      let service = interpret(machine, () => {});
      service.send("go");
      assert.equal(service.context.entered, true, "state reducer ran on entry");
    }
  );

  QUnit.test("State reducer receives event argument", (assert) => {
    let machine = createMachine({
      one: state(transition("go", "two")),
      two: state(reduce((ctx, ev) => ({ ...ctx, receivedEvent: ev }))),
    });
    let service = interpret(machine, () => {});
    service.send("go");
    assert.equal(
      service.context.receivedEvent,
      "go",
      "state reducer ran on entry"
    );
  });

  QUnit.test("State reducers can be chained", (assert) => {
    let machine = createMachine({
      one: state(transition("go", "two")),
      two: state(
        reduce((ctx) => ({ ...ctx, first: 1 })),
        reduce((ctx) => ({ ...ctx, second: 2 }))
      ),
    });
    let service = interpret(machine, () => {});
    service.send("go");
    assert.equal(service.context.first, 1, "first reducer ran");
    assert.equal(service.context.second, 2, "second reducer ran");
  });

  QUnit.test("Transition and state reducers run in correct order", (assert) => {
    let machine = createMachine({
      one: state(
        transition(
          "go",
          "two",
          reduce((ctx) => ({ ...ctx, order: "1" }))
        )
      ),
      two: state(reduce((ctx) => ({ ...ctx, order: ctx.order + "2" }))),
    });
    let service = interpret(machine, () => {});
    service.send("go");
    assert.equal(
      service.context.order,
      "12",
      "state reducer ran after transition"
    );
  });

  QUnit.test("State reducers run even if there are immediates", (assert) => {
    let machine = createMachine({
      one: state(transition("go", "two")),
      two: state(
        reduce((ctx) => ({ ...ctx, entered: true })),
        immediate(
          "dummy",
          guard(() => false)
        )
      ),
    });
    let service = interpret(machine, () => {});
    service.send("go");
    assert.equal(service.context.entered, true, "state reducer ran on entry");
  });

  QUnit.test("State reducers and immediates run", (assert) => {
    let machine = createMachine({
      one: state(
        reduce((ctx) => ({ ...ctx, count: 0 })),
        transition("go", "two")
      ),
      two: state(
        reduce((ctx) => ({ ...ctx, count: ctx.count + 1 })),
        immediate(
          "three",
          guard((ctx) => ctx.count === 2)
        ),
        transition("go", "two")
      ),
      three: state(reduce((ctx) => ({ ...ctx, done: true }))),
    });
    let service = interpret(machine, () => {});
    service.send("go");
    service.send("go");
    assert.equal(service.context.count, 2, "state reducer ran twice");
    assert.equal(service.context.done, true, "immediate ran");
  });
});
