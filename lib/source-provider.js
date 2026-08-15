const fs = require("node:fs");
const path = require("node:path");
const { SOURCE_EXTENSIONS, decoderForPath } = require("./decoders");
const { MeshioSession } = require("./meshio-session");

class MeshioSourceProvider {
  constructor(options = {}) {
    this.id = "graviss-meshio";
    this.exists = options.exists || ((filePath) => fs.existsSync(filePath));
    this.Session = options.Session || MeshioSession;
  }

  createSession({ viewDocument, filePath }) {
    const document = viewDocument.getData();
    const sourcePath = this.resolveSource(document, filePath);
    if (!sourcePath) return null;
    return new this.Session(sourcePath, { title: document.title });
  }

  resolveSource(document, filePath) {
    if (typeof document.source === "string" && document.source.trim()) {
      const sourcePath = path.resolve(path.dirname(filePath), document.source.trim());
      return decoderForPath(sourcePath) ? sourcePath : null;
    }

    const parsed = path.parse(filePath);
    for (const extension of SOURCE_EXTENSIONS) {
      const candidate = path.join(parsed.dir, `${parsed.name}${extension}`);
      if (this.exists(candidate)) return candidate;
    }
    return null;
  }
}

module.exports = { MeshioSourceProvider };
