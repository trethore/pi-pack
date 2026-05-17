export function formatRipgrepHiddenArgs(visibleOnly: boolean): string[] {
  return visibleOnly ? [] : ['--hidden'];
}

export function formatRipgrepExclusionGlobArgs(visibleOnly: boolean): string[] {
  const exclusionGlobs = [...(visibleOnly ? ['!.*', '!**/.*'] : []), '!.git/**', '!**/.git/**'];

  return exclusionGlobs.flatMap((glob) => ['-g', glob]);
}
