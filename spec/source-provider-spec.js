const path = require("node:path");
const { MeshioSourceProvider } = require("../lib/source-provider");

describe("MeshioSourceProvider", () => {
  const viewPath = path.resolve("models", "main.grv");

  it("resolves an advertised relative source", () => {
    class Session {
      constructor(sourcePath) {
        this.sourcePath = sourcePath;
      }
    }
    const provider = new MeshioSourceProvider({ Session });
    const session = provider.createSession({
      filePath: viewPath,
      viewDocument: { getData: () => ({ title: "Main", source: "mesh/main.msh" }) },
    });

    expect(session.sourcePath).toBe(path.resolve("models", "mesh", "main.msh"));
  });

  it("looks up a same-basename source when source is omitted", () => {
    const expected = path.resolve("models", "main.inp");
    const provider = new MeshioSourceProvider({
      exists: (candidate) => candidate === expected,
      Session: class {
        constructor(sourcePath) {
          this.sourcePath = sourcePath;
        }
      },
    });
    const session = provider.createSession({
      filePath: viewPath,
      viewDocument: { getData: () => ({ title: "Main" }) },
    });

    expect(session.sourcePath).toBe(expected);
  });

  it("declines unsupported explicit sources for another provider", () => {
    const provider = new MeshioSourceProvider();
    expect(
      provider.createSession({
        filePath: viewPath,
        viewDocument: { getData: () => ({ title: "Main", source: "main.cdb" }) },
      }),
    ).toBeNull();
  });

  it("identifies itself to the graviss.source hub", () => {
    expect(new MeshioSourceProvider().id).toBe("graviss-meshio");
  });
});
