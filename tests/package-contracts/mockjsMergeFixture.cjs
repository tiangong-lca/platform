// Finite owned data only. A fresh child/VM/browser realm contains each invocation.
function mergeContract(Util, baseline) {
  const assert = (condition, label) => {
    if (!condition) throw new Error(label);
  };
  const marker = '__tiangong_mockjs_owned_1384__';
  const prototypes = [Object.prototype, Array.prototype, Function.prototype];
  const snapshots = prototypes.map((prototype) => Object.getOwnPropertyDescriptors(prototype));
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const verifyPrototypes = () => {
    for (let index = 0; index < prototypes.length; index++) {
      const before = snapshots[index];
      const after = Object.getOwnPropertyDescriptors(prototypes[index]);
      assert(
        Reflect.ownKeys(after).length === Reflect.ownKeys(before).length,
        'prototype keys unchanged',
      );
      for (const key of Reflect.ownKeys(before)) {
        for (const field of ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'])
          assert(after[key][field] === before[key][field], 'prototype descriptor unchanged');
      }
    }
  };
  let checks = 0;
  const check = (condition, label) => {
    assert(condition, label);
    checks++;
  };
  try {
    const owned = { object: { keep: 1 }, array: [1, 2, 3], unchanged: 4 };
    const object = owned.object;
    const array = owned.array;
    const fn = () => 'function';
    const result = Util.extend(
      owned,
      null,
      false,
      { object: { add: 2 }, array: [9], unchanged: undefined, fn, no: null },
      { last: 8 },
    );
    check(
      result === owned && owned.object === object && owned.array === array,
      'identity and owned aggregate reuse',
    );
    check(
      owned.object.keep === 1 && owned.object.add === 2 && array.join(',') === '9,2,3',
      'deep defaults and array tails',
    );
    check(
      owned.unchanged === 4 && owned.fn === fn && owned.no === null && owned.last === 8,
      'varargs, falsy sources, undefined, scalar and function',
    );
    check(Util.extend({}, { x: 1 }, { x: 2 }).x === 2, 'source order');
    const receiver = { extend: Util.extend };
    check(
      receiver.extend({ value: 7 }) === receiver && receiver.value === 7,
      'single argument receiver',
    );
    const self = {};
    Util.extend(self, { self });
    check(!own(self, 'self'), 'self-reference skip');
    const inheritedSource = Object.create({ inherited: { value: 9 } });
    inheritedSource.own = true;
    const sourceResult = Util.extend({}, inheritedSource);
    check(sourceResult.inherited.value === 9 && sourceResult.own, 'inherited source enumerables');
    const nullSource = Object.create(null);
    nullSource.hasOwnProperty = 'data';
    nullSource.constructor = { kind: 'constructor data' };
    nullSource.prototype = { kind: 'prototype data' };
    const nullTarget = Object.create(null);
    Util.extend(nullTarget, nullSource);
    check(
      nullTarget.hasOwnProperty === 'data' &&
        nullTarget.constructor.kind === 'constructor data' &&
        nullTarget.prototype.kind === 'prototype data',
      'null prototypes and ordinary keys',
    );
    const defaults = { keep: { value: 1 }, list: [{ value: 2 }, 3] };
    const target = Object.create({ defaults });
    Util.extend(target, { defaults: { keep: { add: 4 }, list: [{ add: 5 }] } });
    check(
      target.defaults.keep.value === 1 &&
        target.defaults.keep.add === 4 &&
        target.defaults.list[1] === 3,
      'inherited values retained',
    );
    check(
      baseline
        ? defaults.keep.add === 4
        : defaults.keep.add === undefined && defaults.list[0].add === undefined,
      'inherited storage isolation',
    );
    check(
      baseline
        ? target.defaults === defaults
        : own(target, 'defaults') &&
            target.defaults !== defaults &&
            target.defaults.keep !== defaults.keep,
      'detached owned destination',
    );
    const shared = { value: 1 };
    const aliasDefault = { a: shared, b: shared };
    aliasDefault.self = aliasDefault;
    const aliasTarget = Object.create({ alias: aliasDefault });
    Util.extend(aliasTarget, { alias: { add: 1 } });
    check(
      aliasTarget.alias.a === aliasTarget.alias.b && aliasTarget.alias.self === aliasTarget.alias,
      'inherited aliases and cycle retained',
    );
    check(
      baseline
        ? aliasDefault.add === 1
        : aliasDefault.add === undefined && aliasTarget.alias.a !== shared,
      'cyclic inherited defaults detached',
    );
    const arrayDefault = [{ keep: 1 }, 2, 3];
    const arrayTarget = Object.create({ list: arrayDefault });
    Util.extend(arrayTarget, { list: [{ add: 2 }] });
    check(
      arrayTarget.list.length === 3 &&
        arrayTarget.list[0].keep === 1 &&
        arrayTarget.list[0].add === 2,
      'inherited array defaults and length',
    );
    check(
      baseline ? arrayDefault[0].add === 2 : arrayDefault[0].add === undefined,
      'inherited array detached',
    );
    for (const initial of [{ keep: 1 }, [{ keep: 1 }, 2]]) {
      const readonlyParent = {};
      Object.defineProperty(readonlyParent, 'defaults', { value: initial, enumerable: true });
      const readonlyTarget = Object.create(readonlyParent);
      const incoming = Array.isArray(initial) ? [{ add: 2 }] : { add: 2 };
      Util.extend(readonlyTarget, { defaults: incoming });
      const merged = Array.isArray(initial) ? readonlyTarget.defaults[0] : readonlyTarget.defaults;
      const prior = Array.isArray(initial) ? initial[0] : initial;
      check(
        merged.keep === 1 &&
          merged.add === 2 &&
          (!Array.isArray(initial) || readonlyTarget.defaults[1] === 2),
        'readonly inherited aggregate retains merged result',
      );
      const definition = Object.getOwnPropertyDescriptor(readonlyTarget, 'defaults');
      check(
        baseline
          ? prior.add === 2 && !definition
          : prior.add === undefined &&
              definition.value !== initial &&
              definition.writable &&
              definition.enumerable &&
              definition.configurable &&
              !Object.getOwnPropertyDescriptor(readonlyParent, 'defaults').writable,
        'readonly inherited storage detached and shadowed as own data',
      );
    }
    for (const variant of ['same-source', 'varargs', 'reverse-order', 'overwritten-value']) {
      const crossShared = { keep: 1 };
      const crossTarget = Object.create({ a: crossShared, b: crossShared, untouched: crossShared });
      const first = { a: { x: 1 } };
      const second = { b: { y: 2 } };
      if (variant === 'same-source') Util.extend(crossTarget, { ...first, ...second });
      else if (variant === 'reverse-order') Util.extend(crossTarget, second, first);
      else if (variant === 'overwritten-value')
        Util.extend(crossTarget, first, { b: { x: 3, y: 2 } });
      else Util.extend(crossTarget, first, second);
      const expectedX = variant === 'overwritten-value' ? 3 : 1;
      check(
        crossTarget.a === crossTarget.b &&
          crossTarget.a.keep === 1 &&
          crossTarget.a.x === expectedX &&
          crossTarget.b.y === 2,
        'touched cross-key inherited aliases retain both merges in source order',
      );
      check(
        baseline
          ? crossShared.x === expectedX && crossShared.y === 2
          : crossShared.x === undefined &&
              crossShared.y === undefined &&
              crossTarget.a !== crossShared &&
              own(crossTarget, 'a') &&
              own(crossTarget, 'b'),
        'cross-key sharing is detached from parent storage',
      );
      check(
        crossTarget.untouched === crossShared &&
          !own(crossTarget, 'untouched') &&
          (baseline || crossTarget.untouched.x === undefined),
        'untouched inherited alias remains attached to unmodified defaults',
      );
    }
    const nestedShared = { keep: 1 };
    const nestedTarget = Object.create({ b: nestedShared });
    nestedTarget.a = Object.create({ nested: nestedShared });
    Util.extend(nestedTarget, { a: { nested: { x: 1 } }, b: { y: 2 } });
    check(
      nestedTarget.a.nested === nestedTarget.b &&
        nestedTarget.b.x === 1 &&
        nestedTarget.a.nested.y === 2,
      'operation memo spans recursive and root inherited slots',
    );
    check(
      baseline
        ? nestedShared.x === 1 && nestedShared.y === 2
        : nestedShared.x === undefined &&
            nestedShared.y === undefined &&
            nestedTarget.b !== nestedShared,
      'recursive inherited aliases protect original storage',
    );
    for (const wrap of [(x) => x, (x) => ({ nested: x }), (x) => ({ list: [x] })]) {
      const data = Object.create(null);
      data.__proto__ = { [marker]: 'owned finite sentinel' };
      const output = Util.extend({}, wrap(data));
      const inner = output.nested || (output.list && output.list[0]) || output;
      check(
        baseline
          ? Object.prototype[marker] === 'owned finite sentinel'
          : Object.prototype[marker] === undefined &&
              own(inner, '__proto__') &&
              inner.__proto__[marker] === 'owned finite sentinel',
        'own __proto__ data without prototype write',
      );
      delete Object.prototype[marker];
    }
    if (!baseline) {
      const inheritedProtoData = { keep: 7 };
      const parent = Object.create(null);
      Object.defineProperty(parent, '__proto__', { value: inheritedProtoData, enumerable: true });
      const inheritedProtoTarget = Object.create(parent);
      Util.extend(inheritedProtoTarget, JSON.parse('{"__proto__":{"add":8}}'));
      check(
        inheritedProtoTarget.__proto__.keep === 7 &&
          inheritedProtoTarget.__proto__.add === 8 &&
          inheritedProtoData.add === undefined &&
          inheritedProtoTarget.__proto__ !== inheritedProtoData &&
          Object.getPrototypeOf(inheritedProtoTarget) === parent,
        'inherited explicit proto data defaults preserved and detached',
      );
      const protoData = { keep: 1 };
      const destination = {};
      Object.defineProperty(destination, '__proto__', {
        value: protoData,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      Util.extend(destination, JSON.parse('{"__proto__":{"add":2}}'));
      check(
        destination.__proto__ === protoData &&
          protoData.add === 2 &&
          Object.getPrototypeOf(destination) === Object.prototype,
        'own __proto__ merge and descriptor',
      );
      const readonly = {};
      Object.defineProperty(readonly, '__proto__', { value: 'readonly', writable: false });
      Util.extend(readonly, JSON.parse('{"__proto__":"replacement"}'));
      check(
        readonly.__proto__ === 'readonly' &&
          !Object.getOwnPropertyDescriptor(readonly, '__proto__').writable,
        'readonly own data remains readonly',
      );
      let accessorCalls = 0;
      const accessorTarget = {};
      Object.defineProperty(accessorTarget, '__proto__', {
        get() {
          accessorCalls++;
          return {};
        },
        set() {
          accessorCalls++;
        },
        configurable: true,
      });
      Util.extend(accessorTarget, JSON.parse('{"__proto__":{"valid":true}}'));
      check(
        accessorCalls === 0 &&
          accessorTarget.__proto__.valid &&
          own(Object.getOwnPropertyDescriptor(accessorTarget, '__proto__'), 'value'),
        'configurable proto accessor becomes safe data without callbacks',
      );
      const fixedAccessor = {};
      Object.defineProperty(fixedAccessor, '__proto__', {
        get() {
          accessorCalls++;
          return {};
        },
      });
      let refused = false;
      try {
        Util.extend(fixedAccessor, JSON.parse('{"__proto__":{"valid":true}}'));
      } catch (error) {
        refused = error instanceof TypeError;
      }
      check(
        refused && accessorCalls === 0,
        'nonconfigurable proto accessor refuses safe data definition',
      );
    }
    verifyPrototypes();
  } finally {
    delete Object.prototype[marker];
    for (let index = 0; index < prototypes.length; index++) {
      const prototype = prototypes[index];
      const before = snapshots[index];
      for (const key of Reflect.ownKeys(prototype)) {
        if (!own(before, key)) delete prototype[key];
      }
      Object.defineProperties(prototype, before);
      const after = Object.getOwnPropertyDescriptors(prototype);
      assert(
        Reflect.ownKeys(after).length === Reflect.ownKeys(before).length,
        'prototype cleanup keys',
      );
      for (const key of Reflect.ownKeys(before)) {
        for (const field of ['value', 'get', 'set', 'writable', 'enumerable', 'configurable'])
          assert(after[key][field] === before[key][field], 'prototype cleanup descriptor');
      }
    }
  }
  return { checks, baseline, prototypesRestored: true };
}
module.exports = { mergeContract };
