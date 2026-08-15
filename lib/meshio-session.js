const path = require("node:path");
const { decoderForPath } = require("./decoders");
const { decodeFileInProcess } = require("./process-client");

class MeshioSession {
  constructor(sourcePath, options = {}) {
    const decoder = decoderForPath(sourcePath);
    if (!decoder)
      throw new RangeError(`graviss-meshio does not support ${path.extname(sourcePath)}`);
    this.sourcePath = path.resolve(sourcePath);
    this.decoder = decoder;
    this.title = options.title || path.basename(sourcePath);
    this.geometryReader = options.geometryReader || decodeFileInProcess;
    this.disposed = false;
    this.described = false;
    this.geometryPromise = null;
  }

  ensureActive() {
    if (this.disposed) throw new Error("The graviss-meshio source session is closed.");
  }

  async describe() {
    this.ensureActive();
    this.described = true;
    return {
      model: {
        id: this.sourcePath,
        title: this.title,
        source: `${this.decoder.label} · ${this.sourcePath}`,
        coordinateSystem: { upAxis: "z", handedness: "right" },
      },
      capabilities: { geometry: true },
    };
  }

  async getGeometry() {
    this.ensureActive();
    if (!this.described) throw new Error("MeshioSession.describe() must be called first.");
    this.geometryPromise ||= Promise.resolve(this.geometryReader(this.sourcePath)).catch(
      (error) => {
        this.geometryPromise = null;
        throw error;
      },
    );
    const geometry = await this.geometryPromise;
    this.ensureActive();
    return geometry;
  }

  dispose() {
    this.disposed = true;
    this.geometryPromise = null;
  }
}

module.exports = { MeshioSession };
