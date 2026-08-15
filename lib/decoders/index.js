const fs = require("node:fs");
const path = require("node:path");
const { decodeInp } = require("./abaqus");
const { decodeGmshFile } = require("./gmsh");
const { decodeTriangleFile } = require("./triangle");

const DECODERS = Object.freeze([
  Object.freeze({
    id: "abaqus-calculix-inp",
    label: "Abaqus/CalculiX INP",
    extensions: Object.freeze([".inp"]),
    decodeFile: (filePath) => decodeInp(fs.readFileSync(filePath, "utf8")),
  }),
  Object.freeze({
    id: "gmsh-ascii",
    label: "Gmsh ASCII",
    extensions: Object.freeze([".msh"]),
    decodeFile: decodeGmshFile,
  }),
  Object.freeze({
    id: "triangle",
    label: "Triangle",
    extensions: Object.freeze([".node", ".ele"]),
    decodeFile: decodeTriangleFile,
  }),
]);

const SOURCE_EXTENSIONS = Object.freeze(DECODERS.flatMap((decoder) => decoder.extensions));

function decoderForPath(filePath) {
  if (typeof filePath !== "string" || !filePath) return null;
  const extension = path.extname(filePath).toLowerCase();
  return DECODERS.find((decoder) => decoder.extensions.includes(extension)) || null;
}

function decodeFile(filePath) {
  const decoder = decoderForPath(filePath);
  if (!decoder) throw new RangeError(`No graviss-meshio decoder is registered for ${filePath}`);
  return decoder.decodeFile(path.resolve(filePath));
}

module.exports = { DECODERS, SOURCE_EXTENSIONS, decodeFile, decoderForPath };
