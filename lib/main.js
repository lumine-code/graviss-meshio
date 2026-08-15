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
    this.activate();
    return this.sourceProvider;
  },
};
