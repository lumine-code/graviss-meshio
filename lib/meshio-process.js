const { decodeFile } = require("./decoders");

process.on("message", ({ id, sourcePath }) => {
  try {
    process.send({ id, geometry: decodeFile(sourcePath) });
  } catch (error) {
    process.send({
      id,
      error: {
        name: error?.name || "Error",
        message: error?.message || String(error),
        stack: error?.stack,
      },
    });
  }
});
