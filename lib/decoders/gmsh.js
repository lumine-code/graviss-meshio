const fs = require("node:fs");

const ELEMENT_TYPES = new Map([
  [1, { kind: "beam", nodeCount: 2, label: "Line" }],
  [2, { kind: "shell", nodeCount: 3, label: "Triangle" }],
  [3, { kind: "shell", nodeCount: 4, label: "Quadrilateral" }],
]);

function decodeGmshFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const format = section(lines, "$MeshFormat", "$EndMeshFormat", filePath);
  const version = Number(format[0]?.split(/\s+/)[0]);
  if (!Number.isFinite(version) || version < 2 || version >= 5) {
    throw new RangeError(`Unsupported Gmsh format version in ${filePath}`);
  }
  if (format[0]?.split(/\s+/)[1] !== "0") {
    throw new RangeError(`Binary Gmsh files are not supported in ${filePath}`);
  }
  return version < 4 ? decodeVersion2(lines, filePath) : decodeVersion4(lines, filePath);
}

function decodeVersion2(lines, filePath) {
  const nodeLines = section(lines, "$Nodes", "$EndNodes", filePath);
  const nodeCount = positiveInteger(nodeLines[0], filePath, "$Nodes count");
  if (nodeLines.length - 1 < nodeCount) fail(filePath, "$Nodes section is incomplete");
  const nodes = nodeLines.slice(1, nodeCount + 1).map((line, index) => {
    const values = line.split(/\s+/);
    if (values.length < 4) fail(filePath, `$Nodes row ${index + 1} is incomplete`);
    const id = integer(values[0], filePath, "node ID");
    return {
      id,
      x: finite(values[1], filePath, "node X coordinate"),
      y: finite(values[2], filePath, "node Y coordinate"),
      z: finite(values[3], filePath, "node Z coordinate"),
      label: `Node ${id}`,
    };
  });

  const elementLines = section(lines, "$Elements", "$EndElements", filePath);
  const elementCount = positiveInteger(elementLines[0], filePath, "$Elements count", true);
  if (elementLines.length - 1 < elementCount) fail(filePath, "$Elements section is incomplete");
  const elements = [];
  for (const [index, line] of elementLines.slice(1, elementCount + 1).entries()) {
    const values = line.split(/\s+/);
    if (values.length < 3) fail(filePath, `$Elements row ${index + 1} is incomplete`);
    const id = integer(values[0], filePath, "element ID");
    const sourceType = integer(values[1], filePath, "element type");
    const tagCount = positiveInteger(values[2], filePath, "element tag count", true);
    const displayType = ELEMENT_TYPES.get(sourceType);
    if (!displayType) continue;
    const nodeValues = values.slice(3 + tagCount, 3 + tagCount + displayType.nodeCount);
    if (nodeValues.length !== displayType.nodeCount) {
      fail(filePath, `element ${id} has incomplete connectivity`);
    }
    elements.push(createElement(id, sourceType, displayType, nodeValues, filePath));
  }
  return completeGeometry(nodes, elements, filePath);
}

function decodeVersion4(lines, filePath) {
  const nodeLines = section(lines, "$Nodes", "$EndNodes", filePath);
  const header = integerValues(nodeLines.shift(), 4, filePath, "$Nodes header");
  const [blockCount, declaredNodeCount] = header;
  const nodes = [];
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    const block = integerValues(nodeLines.shift(), 4, filePath, "$Nodes block header");
    const [entityDimension, , parametric, count] = block;
    const ids = [];
    while (ids.length < count) {
      ids.push(...integerValues(nodeLines.shift(), 1, filePath, "node tags"));
    }
    for (let index = 0; index < count; index++) {
      const values = numberValues(
        nodeLines.shift(),
        3 + (parametric ? entityDimension : 0),
        filePath,
        "node coordinates",
      );
      const id = ids[index];
      nodes.push({ id, x: values[0], y: values[1], z: values[2], label: `Node ${id}` });
    }
  }
  if (nodes.length !== declaredNodeCount) fail(filePath, "$Nodes count does not match its blocks");

  const elementLines = section(lines, "$Elements", "$EndElements", filePath);
  const elementHeader = integerValues(elementLines.shift(), 4, filePath, "$Elements header");
  const [elementBlockCount] = elementHeader;
  const elements = [];
  for (let blockIndex = 0; blockIndex < elementBlockCount; blockIndex++) {
    const [, , sourceType, count] = integerValues(
      elementLines.shift(),
      4,
      filePath,
      "$Elements block header",
    );
    const displayType = ELEMENT_TYPES.get(sourceType);
    for (let index = 0; index < count; index++) {
      const values = integerValues(elementLines.shift(), 1, filePath, "element row");
      if (!displayType) continue;
      const [id, ...nodeValues] = values;
      if (nodeValues.length < displayType.nodeCount) {
        fail(filePath, `element ${id} has incomplete connectivity`);
      }
      elements.push(
        createElement(
          id,
          sourceType,
          displayType,
          nodeValues.slice(0, displayType.nodeCount),
          filePath,
        ),
      );
    }
  }
  return completeGeometry(nodes, elements, filePath);
}

function createElement(id, sourceType, displayType, nodeValues, filePath) {
  return {
    id,
    kind: displayType.kind,
    nodeIds: nodeValues.map((value) => integer(value, filePath, "element node ID")),
    label: `${displayType.label} ${id}`,
    metadata: { sourceType: `GMSH-${sourceType}` },
  };
}

function completeGeometry(nodes, elements, filePath) {
  if (!nodes.length) fail(filePath, "mesh has no nodes");
  if (!elements.length)
    fail(filePath, "mesh has no supported line, triangle, or quadrilateral elements");
  assertUnique(nodes, filePath, "node");
  assertUnique(elements, filePath, "element");
  return { nodes, elements, supports: [] };
}

function section(lines, start, end, filePath) {
  const first = lines.indexOf(start);
  const last = lines.indexOf(end, first + 1);
  if (first < 0 || last < 0) fail(filePath, `missing ${start} section`);
  return lines.slice(first + 1, last).filter(Boolean);
}

function integerValues(line, minimum, filePath, label) {
  if (!line) fail(filePath, `${label} is missing`);
  const values = line.split(/\s+/).map((value) => integer(value, filePath, label));
  if (values.length < minimum) fail(filePath, `${label} is incomplete`);
  return values;
}

function numberValues(line, minimum, filePath, label) {
  if (!line) fail(filePath, `${label} is missing`);
  const values = line.split(/\s+/).map((value) => finite(value, filePath, label));
  if (values.length < minimum) fail(filePath, `${label} is incomplete`);
  return values;
}

function integer(value, filePath, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail(filePath, `${label} must be an integer`);
  return number;
}

function positiveInteger(value, filePath, label, allowZero = false) {
  const number = integer(value, filePath, label);
  if (number < (allowZero ? 0 : 1)) fail(filePath, `${label} is out of range`);
  return number;
}

function finite(value, filePath, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(filePath, `${label} must be finite`);
  return number;
}

function assertUnique(items, filePath, label) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.id)) fail(filePath, `duplicate ${label} ID ${item.id}`);
    ids.add(item.id);
  }
}

function fail(filePath, message) {
  throw new RangeError(`Invalid Gmsh file ${filePath}: ${message}`);
}

module.exports = { decodeGmshFile };
