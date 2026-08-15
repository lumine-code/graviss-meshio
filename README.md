# graviss-meshio

Read Abaqus, Gmsh, and Triangle FEM meshes.

## Features

- **Text decoders**: reads Abaqus and CalculiX INP, ASCII Gmsh, and Triangle `.node` and `.ele` meshes.
- **Background parsing**: reuses a Node subprocess so large text meshes do not block the renderer process.
- **Source discovery**: resolves an explicit relative source or a supported same-basename mesh beside a `.grv` document.
- **Data only**: supplies model data to Graviss, which owns the canvas and every command.

## Installation

To install `graviss-meshio` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/graviss-meshio`.

## Services

- `graviss.source`: provided to Graviss so it can discover and read Abaqus, Gmsh, and Triangle meshes.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
