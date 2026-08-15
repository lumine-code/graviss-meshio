const { EventEmitter } = require("node:events");
const { MeshioProcessClient } = require("../lib/process-client");

class FakeProcess extends EventEmitter {
  constructor() {
    super();
    this.stderr = new EventEmitter();
    this.send = jasmine.createSpy("send").and.callFake((_message, callback) => callback());
    this.kill = jasmine.createSpy("kill");
  }
}

describe("MeshioProcessClient", () => {
  it("routes concurrent responses and rejects pending work on disposal", async () => {
    const child = new FakeProcess();
    const fork = jasmine.createSpy("fork").and.returnValue(child);
    const client = new MeshioProcessClient({ fork, processPath: "process.js" });
    const first = client.decodeFile("first.inp");
    const second = client.decodeFile("second.msh");
    expect(child.send.calls.allArgs().map(([message]) => message)).toEqual([
      { id: 1, sourcePath: "first.inp" },
      { id: 2, sourcePath: "second.msh" },
    ]);

    const geometry = { nodes: [], elements: [] };
    child.emit("message", { id: 1, geometry });
    await expectAsync(first).toBeResolvedTo(geometry);
    client.dispose();
    await expectAsync(second).toBeRejectedWithError(/closed/);
    expect(child.kill).toHaveBeenCalled();
  });
});
