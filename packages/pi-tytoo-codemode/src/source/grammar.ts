/**
 * Describes the optional options header and source body, but the plain-source branch also accepts
 * the entire input. Pi receives one raw string, not grammar tokens; `parseCodemodeSource` splits
 * the header from the code and validates the options.
 */
export const CODEMODE_SOURCE_GRAMMAR = String.raw`
start: options_source | plain_source
options_source: OPTIONS_LINE NEWLINE SOURCE
plain_source: SOURCE

OPTIONS_LINE: /[ \t]*\/\/ @options:[^\r\n]*/
NEWLINE: /\r?\n/
SOURCE: /[\s\S]+/
`;
