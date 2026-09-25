const { disposeMeshioProcess } = require("./process-client");
const { MeshioSourceProvider } = require("./source-provider");

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "graviss-meshio",
      tips: [
        "You can view an Abaqus, Gmsh, or Triangle mesh by opening a Graviss .grv document beside it.",
      ],
    };
  },

  activate() {
    this.sourceProvider ||= new MeshioSourceProvider();
  },

  deactivate() {
    this.sourceProvider = null;
    disposeMeshioProcess();
  },

  provideGravissSource() {
    return this.sourceProvider;
  },
};
