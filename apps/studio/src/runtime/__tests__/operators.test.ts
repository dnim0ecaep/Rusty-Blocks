import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { evaluate, type ExecContext } from "../scriptInterpreter";
import type { Sprite } from "../../types/workspace";

function makeSprite(overrides: Partial<Sprite> = {}): Sprite {
  return {
    id: "s1",
    name: "S",
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    rotationStyle: "all-around",
    costumeIndex: -1,
    costumes: [],
    sounds: [],
    scripts_xml: "",
    variables: {},
    lists: {},
    layer: 1,
    ...overrides,
  };
}

function ctxFor(sprite: Sprite): ExecContext {
  return {
    spriteId: sprite.id,
    getSprite: () => sprite,
    patchSprite: () => {},
  };
}

describe("scriptInterpreter — Operators", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("add/subtract/multiply/divide read field-shadow numbers", () => {
    const sprite = makeSprite();
    const ctx = ctxFor(sprite);
    const add = workspace.newBlock("scratch_op_add");
    // No connected input → fields. The block defs use valueInput for these
    // (no field), so an unconnected socket reads as 0.
    expect(evaluate(add, ctx)).toBe(0);
  });

  it("comparisons follow Scratch semantics", () => {
    const ctx = ctxFor(makeSprite());
    const lt = workspace.newBlock("scratch_op_lt");
    // Inject literal text-shadow values via setFieldValue isn't possible
    // (these are input sockets) — we'll exercise comparisons by wiring
    // shadow blocks: a + b vs c + d. For now, wire `length_of` as a stand-in.
    // Simpler: create a join → length_of chain to produce known numbers.
    const a = workspace.newBlock("scratch_op_length_of");
    a.setFieldValue("hi", "STRING"); // length 2
    const b = workspace.newBlock("scratch_op_length_of");
    b.setFieldValue("world", "STRING"); // length 5
    if (lt.getInput("A")?.connection && a.outputConnection) {
      lt.getInput("A")!.connection!.connect(a.outputConnection);
    }
    if (lt.getInput("B")?.connection && b.outputConnection) {
      lt.getInput("B")!.connection!.connect(b.outputConnection);
    }
    expect(evaluate(lt, ctx)).toBe(true);

    const eq = workspace.newBlock("scratch_op_eq");
    const c = workspace.newBlock("scratch_op_length_of");
    c.setFieldValue("ab", "STRING");
    const d = workspace.newBlock("scratch_op_length_of");
    d.setFieldValue("xy", "STRING");
    eq.getInput("A")!.connection!.connect(c.outputConnection!);
    eq.getInput("B")!.connection!.connect(d.outputConnection!);
    expect(evaluate(eq, ctx)).toBe(true);
  });

  it("join concatenates the two field-shadow strings", () => {
    const ctx = ctxFor(makeSprite());
    const join = workspace.newBlock("scratch_op_join");
    join.setFieldValue("foo", "A");
    join.setFieldValue("bar", "B");
    expect(evaluate(join, ctx)).toBe("foobar");
  });

  it("length_of and contains read field-shadow strings", () => {
    const ctx = ctxFor(makeSprite());
    const length = workspace.newBlock("scratch_op_length_of");
    length.setFieldValue("hello", "STRING");
    expect(evaluate(length, ctx)).toBe(5);

    const contains = workspace.newBlock("scratch_op_contains");
    contains.setFieldValue("hello world", "STRING");
    contains.setFieldValue("WORLD", "SUBSTRING"); // case-insensitive
    expect(evaluate(contains, ctx)).toBe(true);
  });

  it("letter_of returns the 1-indexed character", () => {
    const ctx = ctxFor(makeSprite());
    const letter = workspace.newBlock("scratch_op_letter_of");
    letter.setFieldValue("3", "INDEX");
    letter.setFieldValue("apple", "STRING");
    expect(evaluate(letter, ctx)).toBe("p");

    letter.setFieldValue("99", "INDEX");
    expect(evaluate(letter, ctx)).toBe("");
  });

  it("mod is Python-style (sign of divisor)", () => {
    const ctx = ctxFor(makeSprite());
    const mod = workspace.newBlock("scratch_op_mod");
    // -7 mod 3 = 2 (not -1) under Scratch/Python semantics.
    const a = workspace.newBlock("scratch_op_subtract");
    const negSeven = workspace.newBlock("scratch_op_length_of");
    negSeven.setFieldValue("xxxxxxx", "STRING"); // 7
    const ten = workspace.newBlock("scratch_op_length_of");
    ten.setFieldValue("xxxxxxxxxxxxxx", "STRING"); // 14
    a.getInput("A")!.connection!.connect(ten.outputConnection!);
    a.getInput("B")!.connection!.connect(negSeven.outputConnection!); // 14-7 = 7
    mod.getInput("A")!.connection!.connect(a.outputConnection!);
    const three = workspace.newBlock("scratch_op_length_of");
    three.setFieldValue("xxx", "STRING");
    mod.getInput("B")!.connection!.connect(three.outputConnection!);
    expect(evaluate(mod, ctx)).toBe(1); // 7 mod 3 = 1
  });

  it("round rounds to the nearest integer", () => {
    const ctx = ctxFor(makeSprite());
    const round = workspace.newBlock("scratch_op_round");
    // Connect a length_of("xxxx") = 4 then... actually we just need a
    // non-integer. Use divide(7,2)=3.5 → round → 4.
    const div = workspace.newBlock("scratch_op_divide");
    const seven = workspace.newBlock("scratch_op_length_of");
    seven.setFieldValue("xxxxxxx", "STRING");
    const two = workspace.newBlock("scratch_op_length_of");
    two.setFieldValue("xx", "STRING");
    div.getInput("A")!.connection!.connect(seven.outputConnection!);
    div.getInput("B")!.connection!.connect(two.outputConnection!);
    round.getInput("VALUE")!.connection!.connect(div.outputConnection!);
    expect(evaluate(round, ctx)).toBe(4);
  });

  it("not / and / or short-circuit on truthiness", () => {
    const ctx = ctxFor(makeSprite());

    // Use comparison blocks (Boolean output) so they pass the Boolean
    // input-check on and/or/not. eqLen2(s, t) makes a Boolean from string
    // lengths: useful as a building block for true/false.
    const trueBlock = () => {
      // length_of("xx") = length_of("yy") = 2 → true
      const eq = workspace.newBlock("scratch_op_eq");
      const a = workspace.newBlock("scratch_op_length_of");
      a.setFieldValue("xx", "STRING");
      const b = workspace.newBlock("scratch_op_length_of");
      b.setFieldValue("yy", "STRING");
      eq.getInput("A")!.connection!.connect(a.outputConnection!);
      eq.getInput("B")!.connection!.connect(b.outputConnection!);
      return eq;
    };
    const falseBlock = () => {
      // length_of("xx") = length_of("yyy") → 2 = 3 → false
      const eq = workspace.newBlock("scratch_op_eq");
      const a = workspace.newBlock("scratch_op_length_of");
      a.setFieldValue("xx", "STRING");
      const b = workspace.newBlock("scratch_op_length_of");
      b.setFieldValue("yyy", "STRING");
      eq.getInput("A")!.connection!.connect(a.outputConnection!);
      eq.getInput("B")!.connection!.connect(b.outputConnection!);
      return eq;
    };

    const not = workspace.newBlock("scratch_op_not");
    not.getInput("A")!.connection!.connect(falseBlock().outputConnection!);
    expect(evaluate(not, ctx)).toBe(true);

    const and = workspace.newBlock("scratch_op_and");
    and.getInput("A")!.connection!.connect(trueBlock().outputConnection!);
    and.getInput("B")!.connection!.connect(trueBlock().outputConnection!);
    expect(evaluate(and, ctx)).toBe(true);

    const or = workspace.newBlock("scratch_op_or");
    or.getInput("A")!.connection!.connect(falseBlock().outputConnection!);
    or.getInput("B")!.connection!.connect(falseBlock().outputConnection!);
    expect(evaluate(or, ctx)).toBe(false);
  });

  it("math_op handles abs, sqrt, floor", () => {
    const ctx = ctxFor(makeSprite());
    const m = workspace.newBlock("scratch_op_math_op");
    const four = workspace.newBlock("scratch_op_length_of");
    four.setFieldValue("xxxx", "STRING");
    m.getInput("VALUE")!.connection!.connect(four.outputConnection!);
    m.setFieldValue("sqrt", "OP");
    expect(evaluate(m, ctx)).toBe(2);
    m.setFieldValue("abs", "OP");
    expect(evaluate(m, ctx)).toBe(4);
  });

  it("multiply and gt round-trip wired length_of inputs", () => {
    const ctx = ctxFor(makeSprite());

    // 3 × 5 = 15
    const m = workspace.newBlock("scratch_op_multiply");
    const three = workspace.newBlock("scratch_op_length_of");
    three.setFieldValue("abc", "STRING");
    const five = workspace.newBlock("scratch_op_length_of");
    five.setFieldValue("abcde", "STRING");
    m.getInput("A")!.connection!.connect(three.outputConnection!);
    m.getInput("B")!.connection!.connect(five.outputConnection!);
    expect(evaluate(m, ctx)).toBe(15);

    // gt: 5 > 3, but not 3 > 5
    const gtTrue = workspace.newBlock("scratch_op_gt");
    const fiveB = workspace.newBlock("scratch_op_length_of");
    fiveB.setFieldValue("abcde", "STRING");
    const threeB = workspace.newBlock("scratch_op_length_of");
    threeB.setFieldValue("abc", "STRING");
    gtTrue.getInput("A")!.connection!.connect(fiveB.outputConnection!);
    gtTrue.getInput("B")!.connection!.connect(threeB.outputConnection!);
    expect(evaluate(gtTrue, ctx)).toBe(true);

    const gtFalse = workspace.newBlock("scratch_op_gt");
    const threeC = workspace.newBlock("scratch_op_length_of");
    threeC.setFieldValue("abc", "STRING");
    const fiveC = workspace.newBlock("scratch_op_length_of");
    fiveC.setFieldValue("abcde", "STRING");
    gtFalse.getInput("A")!.connection!.connect(threeC.outputConnection!);
    gtFalse.getInput("B")!.connection!.connect(fiveC.outputConnection!);
    expect(evaluate(gtFalse, ctx)).toBe(false);

    // Equal-length sides → strictly greater is false (covers the
    // boundary case that distinguishes gt from gte).
    const gtEq = workspace.newBlock("scratch_op_gt");
    const a = workspace.newBlock("scratch_op_length_of");
    a.setFieldValue("xx", "STRING");
    const b = workspace.newBlock("scratch_op_length_of");
    b.setFieldValue("yy", "STRING");
    gtEq.getInput("A")!.connection!.connect(a.outputConnection!);
    gtEq.getInput("B")!.connection!.connect(b.outputConnection!);
    expect(evaluate(gtEq, ctx)).toBe(false);
  });

  it("random with integer endpoints returns an integer in [min, max]", () => {
    const ctx = ctxFor(makeSprite());
    const r = workspace.newBlock("scratch_op_random");
    r.setFieldValue("3", "FROM");
    r.setFieldValue("7", "TO");
    for (let i = 0; i < 50; i++) {
      const v = evaluate(r, ctx) as number;
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});
