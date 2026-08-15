const { MeshioSession } = require("../lib/meshio-session");

describe("MeshioSession", () => {
  it("describes before lazily decoding through the subprocess", async () => {
    const geometry = {
      nodes: [
        { id: 1, x: 0, y: 0, z: 0 },
        { id: 2, x: 1, y: 0, z: 0 },
      ],
      elements: [{ id: 1, kind: "beam", nodeIds: [1, 2] }],
      supports: [],
    };
    const geometryReader = jasmine.createSpy("geometryReader").and.resolveTo(geometry);
    const session = new MeshioSession("model.inp", { geometryReader });

    expect(geometryReader).not.toHaveBeenCalled();
    await expectAsync(session.getGeometry()).toBeRejectedWithError(/describe\(\) must be called/);
    const description = await session.describe();
    expect(description.capabilities.geometry).toBe(true);
    expect(description.model.source).toContain("Abaqus/CalculiX INP");
    expect(geometryReader).not.toHaveBeenCalled();

    await expectAsync(session.getGeometry()).toBeResolvedTo(geometry);
    expect(geometryReader).toHaveBeenCalledTimes(1);
    expect(geometryReader.calls.mostRecent().args[0]).toMatch(/model\.inp$/);
    await session.getGeometry();
    expect(geometryReader).toHaveBeenCalledTimes(1);
  });
});
