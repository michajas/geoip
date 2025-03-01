// This file registers ts-node to allow direct execution of TypeScript files
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
  },
});
