# Windows Multi-resolution Icon Build Design

Date: 2026-08-24

## Goal

Rebuild BS Coding 1.0.0 so the Windows executable, NSIS installer, portable executable, and installed shortcuts use the approved artwork already stored in `build/icons`.

## Source assets

The existing PNG files at 16, 24, 32, 48, 64, 128, 256, and 512 pixels are authoritative. The build must not redraw, crop, recolor, or replace them. The 16–256 pixel assets are assembled into one multi-resolution `build/icons/icon.ico`; the 512 pixel PNG remains the general high-resolution source.

## Packaging configuration

- Set the general Electron Builder icon to `build/icons/512x512.png`.
- Set `win.icon` to `build/icons/icon.ico`.
- Set the NSIS installer, uninstaller, and header icon to the same ICO so every Windows packaging surface uses the approved artwork.
- Keep the product version at `1.0.0` and preserve the existing artifact names.
- Do not modify or stage unrelated user files.

## Build and verification

1. Validate that every source PNG has the dimensions represented by its filename.
2. Generate a multi-frame ICO containing the 16, 24, 32, 48, 64, 128, and 256 pixel sources. The 512 pixel PNG is excluded from the ICO for broad Windows shell compatibility.
3. Inspect the generated ICO and confirm all seven frame sizes are present.
4. Run `npm run typecheck`, `npm test`, and `npm run dist` from `master`.
5. Confirm the installer and portable artifacts exist, report their sizes and SHA-256 hashes, and confirm executable metadata remains BS Coding 1.0.0.

## Acceptance criteria

- Electron Builder no longer references the old root `bs-coding-logo.png` for Windows packaging.
- `build/icons/icon.ico` contains seven source-derived resolutions from 16 through 256 pixels.
- `BS.Coding.Setup.1.0.0.exe` and `BS.Coding.1.0.0.exe` are rebuilt successfully.
- The eight PNG source files remain byte-for-byte unchanged during implementation.
