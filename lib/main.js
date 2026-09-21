const { disposeMeshioProcess } = require("./process-client");
const { MeshioSourceProvider } = require("./source-provider");

module.exports = {
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
