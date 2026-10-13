<!-- Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). -->

# Changelog

## [Unreleased]

### Changed

- Require Pi 1.2.0 or a compatible later release.
- Default to live mode, showing metrics above the editor. Set `mode` to `"notify"` to keep summary notifications.
- Refresh live duration every second while the agent is running, including during streaming and tool execution.
