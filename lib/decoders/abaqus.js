const BEAM_TYPES = /^(?:B[23]1(?:H)?|T[23]D2)$/i;
const SHELL_TYPES = /^(?:S3(?:R)?|S4(?:R|R5)?|STRI3)$/i;

function decodeInp(text) {
  if (typeof text !== "string") throw new TypeError("INP source must be text");

  const model = {
    nodes: new Map(),
    elements: new Map(),
    nodeSets: new Map(),
    elementSets: new Map(),
    boundaries: [],
    sections: [],
  };

  for (const block of scanInp(text)) processBlock(model, block);
  applySections(model);

  return {
    nodes: [...model.nodes.values()],
    elements: [...model.elements.values()],
    supports: createSupports(model),
  };
}

function scanInp(text) {
  const blocks = [];
  let block = null;
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((sourceLine, index) => {
    const line = sourceLine.trim();
    if (!line || line.startsWith("**")) return;
    if (line.startsWith("*")) {
      block = parseKeyword(line, index + 1);
      blocks.push(block);
      return;
    }
    if (!block) fail(index + 1, "data appears before the first keyword");
    block.data.push({ line: index + 1, values: splitValues(line) });
  });

  return blocks;
}

function parseKeyword(line, lineNumber) {
  const parts = line
    .slice(1)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const keyword = parts.shift()?.toUpperCase();
  if (!keyword) fail(lineNumber, "empty keyword");
  const options = {};
  const flags = new Set();
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator < 0) {
      flags.add(part.toUpperCase());
      continue;
    }
    options[part.slice(0, separator).trim().toUpperCase()] = part.slice(separator + 1).trim();
  }
  return { keyword, options, flags, data: [], line: lineNumber };
}

function splitValues(line) {
  return line.split(",").map((value) => value.trim());
}

function processBlock(model, block) {
  switch (block.keyword) {
    case "NODE":
      addNodes(model, block);
      break;
    case "NGEN":
      generateNodes(model, block);
      break;
    case "NFILL":
      fillNodes(model, block);
      break;
    case "ELEMENT":
      addElements(model, block);
      break;
    case "ELGEN":
      generateElements(model, block);
      break;
    case "NSET":
      addSet(model.nodeSets, block, "NSET");
      break;
    case "ELSET":
      addSet(model.elementSets, block, "ELSET");
      break;
    case "BOUNDARY":
      model.boundaries.push(...block.data);
      break;
    case "BEAM SECTION":
    case "SHELL SECTION":
      model.sections.push(block);
      break;
  }
}

function addNodes(model, block) {
  const set = optionalSet(model.nodeSets, block.options.NSET);
  for (const row of block.data) {
    const id = integer(row.values[0], row.line, "node ID");
    const node = {
      id,
      x: finiteNumber(row.values[1], row.line, "node X coordinate"),
      y: finiteNumber(row.values[2] || "0", row.line, "node Y coordinate"),
      z: finiteNumber(row.values[3] || "0", row.line, "node Z coordinate"),
      label: `Node ${id}`,
    };
    addUnique(model.nodes, id, node, row.line, "node");
    set?.add(id);
  }
}

function generateNodes(model, block) {
  if (block.options.LINE && block.options.LINE.toUpperCase() !== "L") {
    fail(block.line, `unsupported NGEN line type ${block.options.LINE}`);
  }
  const set = optionalSet(model.nodeSets, block.options.NSET);
  for (const row of block.data) {
    const first = integer(row.values[0], row.line, "NGEN first node");
    const last = integer(row.values[1], row.line, "NGEN last node");
    const increment = integer(row.values[2] || "1", row.line, "NGEN increment");
    const start = required(model.nodes, first, row.line, "NGEN first node");
    const end = required(model.nodes, last, row.line, "NGEN last node");
    const steps = generationSteps(first, last, increment, row.line, "NGEN");
    for (let step = 0; step <= steps; step += 1) {
      const id = first + step * increment;
      if (step !== 0 && step !== steps) {
        const ratio = step / steps;
        addUnique(
          model.nodes,
          id,
          {
            id,
            x: interpolate(start.x, end.x, ratio),
            y: interpolate(start.y, end.y, ratio),
            z: interpolate(start.z, end.z, ratio),
            label: `Node ${id}`,
          },
          row.line,
          "generated node",
        );
      }
      set?.add(id);
    }
  }
}

function fillNodes(model, block) {
  const targetSet = optionalSet(model.nodeSets, block.options.NSET);
  for (const row of block.data) {
    const lowerName = setName(row.values[0], row.line, "NFILL lower node set");
    const upperName = setName(row.values[1], row.line, "NFILL upper node set");
    const intervals = positiveInteger(row.values[2], row.line, "NFILL intervals");
    const increment = positiveInteger(row.values[3], row.line, "NFILL increment");
    const lower = requiredSet(model.nodeSets, lowerName, row.line);
    const upper = requiredSet(model.nodeSets, upperName, row.line);
    if (lower.size !== upper.size) fail(row.line, "NFILL node sets must have equal sizes");

    const lowerIds = [...lower];
    const upperIds = [...upper];
    lowerIds.forEach((lowerId, index) => {
      const upperId = upperIds[index];
      const start = required(model.nodes, lowerId, row.line, "NFILL lower node");
      const end = required(model.nodes, upperId, row.line, "NFILL upper node");
      for (let step = 0; step <= intervals; step += 1) {
        const id = lowerId + step * increment;
        if (step === intervals && id !== upperId) {
          fail(row.line, `NFILL increment does not reach upper node ${upperId}`);
        }
        if (step !== 0 && step !== intervals) {
          const ratio = step / intervals;
          addUnique(
            model.nodes,
            id,
            {
              id,
              x: interpolate(start.x, end.x, ratio),
              y: interpolate(start.y, end.y, ratio),
              z: interpolate(start.z, end.z, ratio),
              label: `Node ${id}`,
            },
            row.line,
            "filled node",
          );
        }
        targetSet?.add(id);
      }
    });
  }
}

function addElements(model, block) {
  const sourceType = requiredOption(block, "TYPE");
  const set = optionalSet(model.elementSets, block.options.ELSET);
  for (const row of block.data) {
    const id = integer(row.values[0], row.line, "element ID");
    const nodeIds = row.values
      .slice(1)
      .filter(Boolean)
      .map((value) => integer(value, row.line, "element node ID"));
    const kind = elementKind(sourceType, nodeIds.length, row.line);
    const element = {
      id,
      kind,
      nodeIds,
      label: `${kind === "beam" ? "Beam" : "Shell"} ${id}`,
      metadata: {
        sourceType: sourceType.toUpperCase(),
        ...(block.options.ELSET ? { elementSet: block.options.ELSET } : {}),
      },
    };
    addUnique(model.elements, id, element, row.line, "element");
    set?.add(id);
  }
}

function generateElements(model, block) {
  const set = optionalSet(model.elementSets, block.options.ELSET);
  for (const row of block.data) {
    if (row.values.length < 4) fail(row.line, "ELGEN requires at least four values");
    const seedId = integer(row.values[0], row.line, "ELGEN seed element");
    const columnCount = positiveInteger(row.values[1], row.line, "ELGEN column count");
    const columnNodeIncrement = integer(row.values[2], row.line, "ELGEN column node increment");
    const columnElementIncrement = integer(
      row.values[3],
      row.line,
      "ELGEN column element increment",
    );
    const rowCount = positiveInteger(row.values[4] || "1", row.line, "ELGEN row count");
    const rowNodeIncrement = integer(row.values[5] || "0", row.line, "ELGEN row node increment");
    const rowElementIncrement = integer(
      row.values[6] || "0",
      row.line,
      "ELGEN row element increment",
    );
    const seed = required(model.elements, seedId, row.line, "ELGEN seed element");

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        const id = seedId + column * columnElementIncrement + rowIndex * rowElementIncrement;
        const nodeOffset = column * columnNodeIncrement + rowIndex * rowNodeIncrement;
        if (id !== seedId) {
          addUnique(
            model.elements,
            id,
            {
              ...seed,
              id,
              nodeIds: seed.nodeIds.map((nodeId) => nodeId + nodeOffset),
              label: `${seed.kind === "beam" ? "Beam" : "Shell"} ${id}`,
              metadata: {
                ...seed.metadata,
                ...(block.options.ELSET ? { elementSet: block.options.ELSET } : {}),
              },
            },
            row.line,
            "generated element",
          );
        }
        set?.add(id);
      }
    }
  }
}

function addSet(sets, block, optionName) {
  const name = setName(requiredOption(block, optionName), block.line, optionName);
  const set = ensureSet(sets, name);
  for (const row of block.data) {
    if (block.flags.has("GENERATE")) {
      const first = integer(row.values[0], row.line, `${optionName} first ID`);
      const last = integer(row.values[1], row.line, `${optionName} last ID`);
      const increment = integer(row.values[2] || "1", row.line, `${optionName} increment`);
      const steps = generationSteps(first, last, increment, row.line, optionName);
      for (let step = 0; step <= steps; step += 1) set.add(first + step * increment);
    } else {
      for (const value of row.values.filter(Boolean)) {
        set.add(integer(value, row.line, `${optionName} member`));
      }
    }
  }
}

function applySections(model) {
  for (const block of model.sections) {
    const elementSetName = setName(
      requiredOption(block, "ELSET"),
      block.line,
      "section element set",
    );
    const elementIds = requiredSet(model.elementSets, elementSetName, block.line);
    const thickness =
      block.keyword === "SHELL SECTION" && block.data[0]?.values[0]
        ? finiteNumber(block.data[0].values[0], block.data[0].line, "shell thickness")
        : undefined;
    for (const id of elementIds) {
      const element = required(model.elements, id, block.line, "section element");
      if (block.options.MATERIAL) element.material = block.options.MATERIAL;
      if (block.keyword === "BEAM SECTION" && block.options.SECTION) {
        element.section = block.options.SECTION;
      }
      if (thickness != null) element.thickness = thickness;
    }
  }
}

function createSupports(model) {
  const restraintsByNode = new Map();
  for (const row of model.boundaries) {
    const target = row.values[0];
    if (!target) fail(row.line, "BOUNDARY target is required");
    const nodes = boundaryNodes(model, target, row.line);
    const first = positiveInteger(row.values[1], row.line, "BOUNDARY first degree of freedom");
    const last = positiveInteger(
      row.values[2] || row.values[1],
      row.line,
      "BOUNDARY last degree of freedom",
    );
    if (first > last || last > 6) fail(row.line, "BOUNDARY degrees of freedom must be within 1..6");
    for (const nodeId of nodes) {
      required(model.nodes, nodeId, row.line, "BOUNDARY node");
      const restraints = restraintsByNode.get(nodeId) || [false, false, false, false, false, false];
      for (let degree = first; degree <= last; degree += 1) restraints[degree - 1] = true;
      restraintsByNode.set(nodeId, restraints);
    }
  }
  return [...restraintsByNode].map(([nodeId, restraints]) => ({
    id: `SUPPORT-${nodeId}`,
    nodeId,
    label: `Support at node ${nodeId}`,
    restraints,
  }));
}

function boundaryNodes(model, target, line) {
  const namedSet = model.nodeSets.get(target.toUpperCase());
  if (namedSet) return namedSet;
  return [integer(target, line, "BOUNDARY node ID or node set")];
}

function elementKind(sourceType, nodeCount, line) {
  if (BEAM_TYPES.test(sourceType) && nodeCount === 2) return "beam";
  if (SHELL_TYPES.test(sourceType) && (nodeCount === 3 || nodeCount === 4)) return "shell";
  fail(line, `unsupported element type ${sourceType} with ${nodeCount} nodes`);
}

function requiredOption(block, name) {
  const value = block.options[name];
  if (!value) fail(block.line, `${block.keyword} requires ${name}=...`);
  return value;
}

function optionalSet(sets, name) {
  return name ? ensureSet(sets, name) : null;
}

function ensureSet(sets, name) {
  const key = name.toUpperCase();
  let set = sets.get(key);
  if (!set) {
    set = new Set();
    sets.set(key, set);
  }
  return set;
}

function requiredSet(sets, name, line) {
  const set = sets.get(name.toUpperCase());
  if (!set) fail(line, `unknown set ${name}`);
  return set;
}

function setName(value, line, label) {
  if (typeof value !== "string" || !value.trim()) fail(line, `${label} is required`);
  return value.trim().toUpperCase();
}

function addUnique(map, id, value, line, label) {
  if (map.has(id)) fail(line, `duplicate ${label} ID ${id}`);
  map.set(id, value);
}

function required(map, id, line, label) {
  const value = map.get(id);
  if (!value) fail(line, `${label} ${id} is not defined`);
  return value;
}

function integer(value, line, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) fail(line, `${label} must be an integer`);
  return number;
}

function positiveInteger(value, line, label) {
  const number = integer(value, line, label);
  if (number <= 0) fail(line, `${label} must be positive`);
  return number;
}

function finiteNumber(value, line, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) fail(line, `${label} must be finite`);
  return number;
}

function generationSteps(first, last, increment, line, keyword) {
  if (increment === 0 || (last - first) * increment < 0 || (last - first) % increment !== 0) {
    fail(line, `${keyword} range does not match its increment`);
  }
  return (last - first) / increment;
}

function interpolate(start, end, ratio) {
  return start + (end - start) * ratio;
}

function fail(line, message) {
  throw new RangeError(`Invalid Abaqus/CalculiX INP at line ${line}: ${message}`);
}

module.exports = { decodeInp, scanInp };
