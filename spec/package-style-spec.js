const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

describe("graviss-meshio package conventions", () => {
  it("keeps metadata and documentation aligned", () => {
    expect(firstProseLine(readme)).toBe(manifest.description);
    expect(manifest.keywords.length).toBeGreaterThanOrEqual(3);
    expect(manifest.keywords.length).toBeLessThanOrEqual(8);
    expect(manifest.keywords.some((keyword) => manifest.name.includes(keyword))).toBe(false);
    expect(manifest.providedServices["background-tips.provider"].versions["1.0.0"]).toBe(
      "provideBackgroundTips",
    );
    expect(require("../lib/main").provideBackgroundTips().packageName).toBe("graviss-meshio");
    expect(featureBullets(readme).length).toBeGreaterThanOrEqual(3);
    expect(featureBullets(readme).length).toBeLessThanOrEqual(9);
    expect(readme).toContain("## Installation");
    expect(readme).toContain("## Services");
    expect(readme).not.toMatch(/keymaps|keybindings/i);
  });

  it("is a data package with no commands, menus, or user interface", () => {
    const source = fs.readFileSync(path.join(root, "lib", "main.js"), "utf8");
    expect(source).not.toContain("lumine.commands.add");
    expect(source).not.toContain("addOpener");
    expect(source).not.toContain("buildSelectList");
    expect(fs.existsSync(path.join(root, "menus"))).toBe(false);
    expect(fs.existsSync(path.join(root, "keymaps"))).toBe(false);
    expect(fs.existsSync(path.join(root, "styles"))).toBe(false);
    expect(manifest.deserializers).toBeUndefined();
    expect(manifest.consumedServices).toBeUndefined();
    expect(Object.keys(manifest.providedServices)).toEqual([
      "graviss.source",
      "background-tips.provider",
    ]);
    expect(manifest.providedServices["graviss.source"].versions).toEqual({
      "1.0.0": "provideGravissSource",
    });
  });

  it("ships consistent ownership metadata and CI", () => {
    expect(fs.readFileSync(path.join(root, "LICENSE.md"), "utf8")).toContain(
      "Copyright (c) 2026 lumine-code",
    );
    expect(fs.existsSync(path.join(root, ".github", "workflows", "ci.yml"))).toBe(true);
  });

  it("ships only what a data package delivers", () => {
    // Sample meshes are development material and live in the untracked .dev
    // directory, so nothing here may reference or publish them.
    expect(manifest.files).toEqual(["lib", "spec"]);
    expect(fs.existsSync(path.join(root, "examples"))).toBe(false);
    expect(fs.readFileSync(path.join(root, ".gitignore"), "utf8")).toContain(".dev/");
  });
});

function firstProseLine(markdown) {
  return markdown
    .split(/\r?\n/)
    .slice(1)
    .find((line) => line.trim());
}

function featureBullets(markdown) {
  const section = markdown.match(/## Features\r?\n([\s\S]*?)(?=\r?\n## )/)?.[1] || "";
  return section.match(/^- \*\*/gm) || [];
}
