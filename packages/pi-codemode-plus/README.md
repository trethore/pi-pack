# pi-codemode-plus

Opinionated customization of Pi's built-in codemode.

## Installation

Requires Pi `1.2.0` or a compatible later release.

From the repository root, install pi-codemode-plus globally:

```sh
npm ci
npm run install:global:pi-codemode-plus
```

## Configuration

No configuration is required. To customize it, create `.pi/pi-codemode-plus.jsonc` in your project or `~/.pi/agent/pi-codemode-plus.jsonc` globally:

```jsonc
{
  "enabled": true,
  "hideHeader": true,
  "prettyPrintOutput": true,
  "showFullScript": true,
}
```

The example above uses the default values.

- `enabled`: set to `false` to leave codemode rendering unchanged.
- `hideHeader`: hide the standalone `codemode` title above the script. Set to `false` to restore it.
- `prettyPrintOutput`: display JSON objects and arrays in a readable, YAML-like format instead of raw JSON.
- `showFullScript`: show the complete script even when tool results are collapsed.

A trusted project's configuration replaces the global configuration completely; omitted settings use defaults.
Untrusted project configuration is ignored.
The global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Run `/reload` after changing the configuration. Invalid or unreadable configuration reports an error and disables the overrides rather than falling back.
Unknown configuration keys produce warnings but do not disable the extension.

## Behavior

### Pretty-printed output

For example, a script returning:

```js
return {
  user: { name: "Alice", age: 25, active: true },
  message: "Hello!\nThis is a multiline message.\nGoodbye!",
};
```

Displays as:

```text
user.name: Alice
user.age: 25
user.active: true
message: """
Hello!
This is a multiline message.
Goodbye!
"""
```

Nested fields use dotted paths, and array entries use indexes such as `users[0].name`.
Keys containing dots or other special characters use bracket notation, such as `["user.name"]`.
Strings containing newline characters use triple quotes. Ambiguous values such as the strings `"true"` and `"25"` remain quoted.

Plain text, console output, errors, image blocks, and output markers are preserved.
Incomplete or truncated JSON, unsafe numbers, and values exceeding the formatter's size or depth limits retain their original text.

## Licence

Licensed under the [MIT License](../../LICENSE).
