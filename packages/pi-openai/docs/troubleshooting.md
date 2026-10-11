# Troubleshooting

[Back to README](../README.md)

## A command has no visible effect

Run `/pi-openai` and inspect the effective scope, disabled settings, and skip reasons.
A more specific command override can mask the edited scope. Features can also be skipped by compatibility checks or payload safeguards.

See [status output](commands.md#example-status-output), [command targeting](commands.md#scope-names-and-automatic-targeting), and [compatibility](compatibility.md).

## A saved value disappears after reload

Project and environment precedence still applies. `--source global` selects the save destination; it does not bypass precedence.

See [configuration precedence](configuration.md#precedence) and the [command lifecycle](commands.md#what-changes-when).

## Configuration is unavailable

Invalid files or environment values stop all extension overrides. Fix the error, then reload.
Restart Pi if you need to supply corrected shell environment values.

See [validation](configuration.md#validation) and [environment variables](configuration.md#environment-variables).

## A project edit is refused

The project must be trusted before it can be edited.

See [project trust](configuration.md#project-trust) and [scope and source](commands.md#scope-and-source).
