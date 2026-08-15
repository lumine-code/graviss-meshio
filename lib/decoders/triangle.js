const fs = require("node:fs");
const path = require("node:path");

function decodeTriangleFile(filePath) {
  const parsed = path.parse(filePath);
  const basePath = path.join(parsed.dir, parsed.name);
  const nodePath = `${basePath}.node`;
  const elementPath = `${basePath}.ele`;
  const nodeRows = dataRows(fs.readFileSync(nodePath, "utf8"), nodePath);
  const elementRows = dataRows(fs.readFileSync(elementPath, "utf8"), elementPath);
  const nodeHeader = integers(nodeRows.shift(), 4, "Triangle node header");
  const [nodeCount, dimension, attributeCount, markerCount] = nodeHeader;
  if (dimension !== 2 && dimension !== 3) {
    throw new RangeError(`Triangle node dimension must be 2 or 3 in ${nodePath}`);
  }

  const nodes = [];
  const nodeIds = new Set();
  for (let index = 0; index < nodeCount; index++) {
    const row = requiredRow(nodeRows, index, nodePath, "node");
    const requiredValues = 1 + dimension + attributeCount + markerCount;
    if (row.values.length < requiredValues) fail(row.line, nodePath, "incomplete node row");
    const id = integer(row.values[0], row.line, nodePath, "node ID");
    if (nodeIds.has(id)) fail(row.line, nodePath, `duplicate node ID ${id}`);
    nodeIds.add(id);
    nodes.push({
      id,
      x: finite(row.values[1], row.line, nodePath, "node X coordinate"),
      y: finite(row.values[2], row.line, nodePath, "node Y coordinate"),
      z: dimension === 3 ? finite(row.values[3], row.line, nodePath, "node Z coordinate") : 0,
      label: `Node ${id}`,
    });
  }

  const elementHeader = integers(elementRows.shift(), 3, "Triangle element header");
  const [elementCount, nodesPerElement, elementAttributeCount] = elementHeader;
  if (nodesPerElement !== 3) {
    throw new RangeError(`Only three-node Triangle elements are supported in ${elementPath}`);
  }
  const elements = [];
  const elementIds = new Set();
  for (let index = 0; index < elementCount; index++) {
    const row = requiredRow(elementRows, index, elementPath, "element");
    if (row.values.length < 1 + nodesPerElement + elementAttributeCount) {
      fail(row.line, elementPath, "incomplete element row");
    }
    const id = integer(row.values[0], row.line, elementPath, "element ID");
    if (elementIds.has(id)) fail(row.line, elementPath, `duplicate element ID ${id}`);
    elementIds.add(id);
    const nodeIdsForElement = row.values
      .slice(1, 4)
      .map((value) => integer(value, row.line, elementPath, "element node ID"));
    elements.push({
      id,
      kind: "shell",
      nodeIds: nodeIdsForElement,
      label: `Shell ${id}`,
      metadata: { sourceType: "TRIANGLE" },
    });
  }

  return { nodes, elements, supports: [] };
}

function dataRows(text, filePath) {
  if (typeof text !== "string") throw new TypeError(`${filePath} must contain text`);
  const rows = [];
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .forEach((source, index) => {
      const line = source.replace(/#.*/, "").trim();
      if (line) rows.push({ line: index + 1, values: line.split(/\s+/) });
    });
  return rows;
}

function integers(row, minimum, label) {
  if (!row || row.values.length < minimum) throw new RangeError(`${label} is incomplete`);
  return row.values.slice(0, minimum).map((value) => {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0) {
      throw new RangeError(`${label} values must be non-negative integers`);
    }
    return number;
  });
}

function requiredRow(rows, index, filePath, label) {
  const row = rows[index];
  if (!row) throw new RangeError(`${filePath} declares more ${label}s than it contains`);
  return row;
}

function integer(value, line, filePath, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail(line, filePath, `${label} must be an integer`);
  return number;
}

function finite(value, line, filePath, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(line, filePath, `${label} must be finite`);
  return number;
}

function fail(line, filePath, message) {
  throw new RangeError(`Invalid Triangle file ${filePath} at line ${line}: ${message}`);
}

module.exports = { decodeTriangleFile };
