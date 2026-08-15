const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DECODERS, decodeFile, decoderForPath } = require("../lib/decoders");

describe("graviss-meshio text decoders", () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "graviss-meshio-decoders-"));
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("registers only the essential text formats", () => {
    expect(DECODERS.map(({ id }) => id)).toEqual(["abaqus-calculix-inp", "gmsh-ascii", "triangle"]);
    expect(decoderForPath("model.inp").id).toBe("abaqus-calculix-inp");
    expect(decoderForPath("model.msh").id).toBe("gmsh-ascii");
    expect(decoderForPath("model.node").id).toBe("triangle");
    expect(decoderForPath("model.vtk")).toBeNull();
  });

  it("decodes Abaqus nodes, beam elements, and boundary sets", () => {
    const filePath = path.join(directory, "frame.inp");
    fs.writeFileSync(
      filePath,
      [
        "** Portal frame",
        "*Heading",
        "Portal frame",
        "*Node",
        "1,  0.0, 0.0, 0.0",
        "2,  0.0, 0.0, 5.0",
        "3,  8.0, 0.0, 5.0",
        "4,  8.0, 0.0, 0.0",
        "*Element, type=B31, elset=COLUMNS",
        "1, 1, 2",
        "2, 4, 3",
        "*Element, type=B31, elset=RAFTERS",
        "3, 2, 3",
        "*Nset, nset=FIXED",
        "1, 4",
        "*Boundary",
        "FIXED, 1, 6, 0.0",
        "",
      ].join("\n"),
    );

    const geometry = decodeFile(filePath);
    expect(geometry.nodes.length).toBe(4);
    expect(geometry.elements.length).toBe(3);
    expect(new Set(geometry.elements.map(({ kind }) => kind))).toEqual(new Set(["beam"]));
    expect(geometry.elements[0]).toEqual(
      jasmine.objectContaining({ id: 1, kind: "beam", nodeIds: [1, 2] }),
    );
    expect(geometry.supports.map(({ nodeId }) => nodeId)).toEqual([1, 4]);
  });

  it("decodes Gmsh 2.2 ASCII quadrilateral shells", () => {
    const filePath = path.join(directory, "plate.msh");
    fs.writeFileSync(
      filePath,
      [
        "$MeshFormat",
        "2.2 0 8",
        "$EndMeshFormat",
        "$Nodes",
        "4",
        "1 0 0 0",
        "2 1 0 0",
        "3 1 1 0",
        "4 0 1 0",
        "$EndNodes",
        "$Elements",
        "1",
        "1 3 2 1 1 1 2 3 4",
        "$EndElements",
        "",
      ].join("\n"),
    );

    const geometry = decodeFile(filePath);
    expect(geometry.nodes.length).toBe(4);
    expect(geometry.elements.length).toBe(1);
    expect(geometry.elements[0]).toEqual(
      jasmine.objectContaining({ id: 1, kind: "shell", nodeIds: [1, 2, 3, 4] }),
    );
  });

  it("decodes Gmsh 4 ASCII blocks", () => {
    const filePath = path.join(directory, "triangle.msh");
    fs.writeFileSync(
      filePath,
      [
        "$MeshFormat",
        "4.1 0 8",
        "$EndMeshFormat",
        "$Nodes",
        "1 3 1 3",
        "2 1 0 3",
        "1",
        "2",
        "3",
        "0 0 0",
        "1 0 0",
        "0 1 0",
        "$EndNodes",
        "$Elements",
        "1 1 1 1",
        "2 1 2 1",
        "1 1 2 3",
        "$EndElements",
        "",
      ].join("\n"),
    );

    const geometry = decodeFile(filePath);
    expect(geometry.nodes.length).toBe(3);
    expect(geometry.elements.length).toBe(1);
    expect(geometry.elements[0]).toEqual(
      jasmine.objectContaining({ id: 1, kind: "shell", nodeIds: [1, 2, 3] }),
    );
  });

  it("decodes Triangle node and element companions", () => {
    const nodePath = path.join(directory, "plate.node");
    fs.writeFileSync(nodePath, "3 2 0 0\n1 0 0\n2 1 0\n3 0 1\n");
    fs.writeFileSync(path.join(directory, "plate.ele"), "1 3 0\n7 1 2 3\n");

    const geometry = decodeFile(nodePath);
    expect(geometry.nodes.length).toBe(3);
    expect(geometry.elements.length).toBe(1);
    expect(geometry.elements[0]).toEqual(
      jasmine.objectContaining({ id: 7, kind: "shell", nodeIds: [1, 2, 3] }),
    );
  });
});
