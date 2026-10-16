<!-- Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). -->

# Changelog

## [Unreleased]

### Changed

- Require Pi 1.3.0 or a compatible later release.
- Cache available prompt-template bodies at session start and refresh them on reload, while keeping script execution lazy.
- Leave extension-originated input untouched by prompt-template placeholder expansion.
