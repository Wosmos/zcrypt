# Microsoft Store (MSIX)

The Microsoft Store signs MSIX packages itself, so shipping zcrypt there needs no code-signing certificate and removes the SmartScreen prompt for everyone who installs from the Store. A personal developer account is free.

**Status: written but never run.** The workflow job and the packaging script were built without a Windows machine. Expect to fix small things on the first run; the places most likely to need a tweak are listed at the end.

## How the pipeline works

`.github/workflows/device.yml` gains one job, `package-msix`, plus two steps at the end of the Windows leg of `build-desktop`.

- The Windows leg keeps the bare app binary (`zcrypt-desktop.exe`) as the artifact `zcrypt-windows-app-binary` (1 day retention).
- `package-msix` runs on `windows-latest`, downloads that binary, and calls `app/desktop/msix/build-msix.ps1`. The script lays out `zcrypt.exe`, the logos, and `AppxManifest.xml`, then runs `makeappx pack` from the Windows SDK already on the runner.
- The logos are generated from `app/desktop/src-tauri/icons/icon.png` (50, 44, 88, 150, 256 and 300 px, with scale and target-size variants).
- The manifest template is `app/desktop/msix/AppxManifest.xml`. Placeholders: `@IDENTITY_NAME@`, `@PUBLISHER@`, `@PUBLISHER_DISPLAY_NAME@`, `@VERSION@`.
- The version is the app version with a fourth part of `0` (`0.2.0` becomes `0.2.0.0`). The Store reserves the last part, so it must stay `0`. On tag builds the version comes from the tag, otherwise from `tauri.conf.json`.
- The output is `zcrypt_<version>_x64.msix`, uploaded as the workflow artifact `zcrypt-store-msix` (30 days). It is never attached to the public release: an unsigned MSIX cannot be installed outside the Store.
- The app runs as a full-trust desktop app: `EntryPoint="Windows.FullTrustApplication"` plus the `runFullTrust` capability. The `zcrypt://` link scheme is registered through a `windows.protocol` extension.

The job only runs on version tags and manual runs, and only when all three repository variables below are set. Without them it is skipped and nothing else changes.

## Steps for the owner

1. **Open a Partner Center account.** Go to https://partner.microsoft.com/dashboard, choose Windows and Xbox, and register as an **individual**. Registration is free for individuals. You verify an email address and a phone number and may be asked for a government ID.
2. **Reserve the name.** In Partner Center open Apps and games, New product, MSIX or PWA app, and reserve `zcrypt` (or a variant if it is taken). Reserving holds the name for 3 months.
3. **Copy the identity values.** Open the product, then Product management, Product identity. Copy these three:
   - Package/Identity/Name, for example `12345Wosmos.zcrypt`
   - Package/Identity/Publisher, for example `CN=ABCD1234-0000-0000-0000-000000000000`
   - Package/Properties/PublisherDisplayName, the name shown in the Store
4. **Set the repository variables.** In GitHub: Settings, Secrets and variables, Actions, Variables tab, New repository variable. Create:
   - `MSIX_IDENTITY_NAME` = the Identity Name
   - `MSIX_PUBLISHER` = the Identity Publisher (the whole `CN=...` string)
   - `MSIX_PUBLISHER_DISPLAY_NAME` = the publisher display name
5. **Build the package.** Either push a version tag, or open Actions, Desktop & Android Build, Run workflow on `main`. When the run finishes, download the `zcrypt-store-msix` artifact and unzip it.
6. **Submit.** In the product, start a submission. Fill in Pricing (free), Properties (category: Productivity or Utilities), Age ratings, and the Store listing (description, at least one 1366 x 768 screenshot, and a privacy policy URL: `https://zcrypt.cloud/privacy`). Under Packages upload the `.msix`. Partner Center accepts unsigned packages and signs them for you. Then submit for certification, which usually takes a few days.
7. **For every later release,** download the new `zcrypt-store-msix` artifact and upload it as the package of a new submission. The version must be higher than the one published.

## Known risks to settle before the first submission

- **In-app updater.** Store apps must update through the Store. The desktop app ships the Tauri updater, which cannot write into the package folder and which Store certification may reject. Before submitting, make the updater a no-op when the app runs packaged (check `GetCurrentPackageFullName` on Windows and skip the update check and the update pill). This is not done yet.
- **WebView2.** The app relies on the WebView2 runtime, which is part of Windows 11 and current Windows 10. The manifest sets a minimum of Windows 10 1809 (10.0.17763.0).
- **Launch at login** writes an ordinary registry Run key. Inside a package that write is virtualised and may not take effect; a Store startup task in the manifest is the proper route. Folder watch is unaffected.
- **Where the first run is most likely to break:** the `Locate the app binary` step (the binary path under `target/release`), the SDK lookup in `build-msix.ps1`, and manifest validation messages from `makeappx`. Run it once with workflow_dispatch and read the log.
