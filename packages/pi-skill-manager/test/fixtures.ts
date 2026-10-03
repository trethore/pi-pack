import { join } from "node:path";
import { createSyntheticSourceInfo, type Skill } from "@earendil-works/pi-coding-agent";

export function skill(name: string, manualOnly = false): Skill {
  const filePath = join("/skills", name, "SKILL.md");
  return {
    name,
    description: `Instructions for ${name}`,
    filePath,
    baseDir: join("/skills", name),
    sourceInfo: createSyntheticSourceInfo(filePath, { source: "test" }),
    disableModelInvocation: manualOnly,
  };
}
