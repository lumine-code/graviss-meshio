const path = require("node:path");
const { fork } = require("node:child_process");

class MeshioProcessClient {
  constructor(options = {}) {
    const forkProcess = options.fork || fork;
    this.child = forkProcess(options.processPath || path.join(__dirname, "meshio-process.js"), [], {
      execPath: options.execPath || process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      serialization: "advanced",
      silent: true,
    });
    this.pending = new Map();
    this.nextRequestId = 1;
    this.disposed = false;
    this.stderr = "";
    this.child.on("message", (message) => this.receive(message));
    this.child.on("error", (error) => this.fail(error));
    this.child.on("exit", (code) => {
      if (!this.disposed) {
        const detail = this.stderr.trim();
        this.fail(
          new Error(
            `The MeshIO process stopped with exit code ${code}.${detail ? ` ${detail}` : ""}`,
          ),
        );
      }
    });
    this.child.stderr?.on("data", (chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-16384);
    });
  }

  decodeFile(sourcePath) {
    if (this.disposed) return Promise.reject(new Error("The MeshIO process is closed."));
    const id = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.send({ id, sourcePath }, (error) => {
        if (!error) return;
        const request = this.pending.get(id);
        this.pending.delete(id);
        request?.reject(error);
      });
    });
  }

  receive({ id, geometry, error }) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    if (error) request.reject(createProcessError(error));
    else request.resolve(geometry);
  }

  fail(error) {
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.fail(new Error("The MeshIO process was closed."));
    this.child.kill();
  }
}

function createProcessError(details) {
  const error = new Error(details.message);
  error.name = details.name || "Error";
  if (details.stack) error.stack = details.stack;
  return error;
}

let sharedClient = null;

function decodeFileInProcess(sourcePath) {
  sharedClient ||= new MeshioProcessClient();
  return sharedClient.decodeFile(sourcePath);
}

function disposeMeshioProcess() {
  sharedClient?.dispose();
  sharedClient = null;
}

module.exports = { MeshioProcessClient, decodeFileInProcess, disposeMeshioProcess };
