import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { basename } from "node:path";

const rename = fs.rename;

fs.rename = async (source, destination) => {
  if (
    typeof destination === "string" &&
    basename(destination) === "baseline.json" &&
    source === `${destination}.staging`
  ) {
    throw new Error("Injected manifest replacement failure");
  }

  return rename(source, destination);
};

syncBuiltinESMExports();
