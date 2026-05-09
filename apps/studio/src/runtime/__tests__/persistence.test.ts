import { beforeEach, describe, expect, it } from "vitest";

import { useStageStore } from "../../store/stageStore";
import { emptyStageState, type StageState } from "../../types/workspace";

describe("stageStore persistence — round-trip", () => {
  beforeEach(() => {
    useStageStore.getState().hydrate(undefined);
  });

  it("hydrate(undefined) starts from empty defaults", () => {
    const s = useStageStore.getState();
    expect(s.sprites).toEqual([]);
    expect(s.globalVariables).toEqual({});
    expect(s.globalLists).toEqual({});
    expect(s.visibleMonitors.size).toBe(0);
    expect(s.backdropIndex).toBe(-1);
  });

  it("hydrate → toStageState returns an equivalent StageState", () => {
    const initial: StageState = {
      ...emptyStageState(),
      sprites: [
        {
          id: "a",
          name: "Alice",
          x: 12,
          y: -7,
          direction: 90,
          size: 100,
          visible: true,
          rotationStyle: "all-around",
          costumeIndex: -1,
          costumes: [],
          sounds: [],
          scripts_xml: "<xml></xml>",
          variables: { score: 5 },
          lists: { items: ["a", "b"] },
          layer: 1,
          effects: { brightness: 30, ghost: 50 },
          volume: 80,
        },
      ],
      globalVariables: { highScore: 999 },
      globalLists: { leaders: ["x", "y"] },
    };

    useStageStore.getState().hydrate(initial);
    const out = useStageStore.getState().toStageState();

    expect(out.sprites).toHaveLength(1);
    expect(out.sprites[0].variables.score).toBe(5);
    expect(out.sprites[0].lists.items).toEqual(["a", "b"]);
    expect(out.sprites[0].effects).toEqual({ brightness: 30, ghost: 50 });
    expect(out.sprites[0].volume).toBe(80);
    expect(out.globalVariables.highScore).toBe(999);
    expect(out.globalLists.leaders).toEqual(["x", "y"]);
  });

  it("clones are dropped from toStageState (runtime-only)", () => {
    const state: StageState = {
      ...emptyStageState(),
      sprites: [
        {
          id: "p",
          name: "Parent",
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
        },
      ],
    };
    useStageStore.getState().hydrate(state);

    const clone = useStageStore.getState().cloneSprite("p");
    expect(clone).not.toBeNull();
    expect(useStageStore.getState().sprites).toHaveLength(2);

    const out = useStageStore.getState().toStageState();
    expect(out.sprites).toHaveLength(1);
    expect(out.sprites[0].id).toBe("p");
  });

  it("clone cap is enforced", () => {
    const state: StageState = {
      ...emptyStageState(),
      sprites: [
        {
          id: "p",
          name: "Parent",
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
        },
      ],
    };
    useStageStore.getState().hydrate(state);

    // Spawn 300 — should all succeed.
    for (let i = 0; i < 300; i++) {
      expect(useStageStore.getState().cloneSprite("p")).not.toBeNull();
    }
    // 301st should be null.
    expect(useStageStore.getState().cloneSprite("p")).toBeNull();
  });

  it("nested list mutations don't bleed back into the saved snapshot", () => {
    useStageStore.getState().hydrate({
      ...emptyStageState(),
      globalLists: { items: ["a", "b"] },
    });
    const snap1 = useStageStore.getState().toStageState();
    useStageStore.getState().setGlobalList("items", ["x"]);
    expect(snap1.globalLists.items).toEqual(["a", "b"]);
  });

  it("deep snapshot returns independent variable maps", () => {
    useStageStore.getState().hydrate({
      ...emptyStageState(),
      globalVariables: { score: 1 },
    });
    const snap = useStageStore.getState().toStageState();
    useStageStore.getState().setGlobalVariable("score", 99);
    expect(snap.globalVariables.score).toBe(1);
  });
});
