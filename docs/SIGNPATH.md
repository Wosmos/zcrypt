# Windows signing with SignPath Foundation

SignPath Foundation signs open-source projects for free. A signed installer removes the SmartScreen "Windows protected your PC" screen once Microsoft has seen the certificate on enough downloads (the free certificate is a normal OV-style one, so reputation builds up over the first releases rather than on day one).

**Status: wired in `.github/workflows/device.yml` but never run.** It stays off until the secret below exists.

## What the workflow already does

On a version tag, when `SIGNPATH_API_TOKEN` is set:

1. `build-desktop` builds the Windows `.exe` and `.msi` and uploads them as the artifact `zcrypt-windows-x86_64-pc-windows-msvc`. The Windows leg does not publish them itself while signing is on.
2. `sign-windows` downloads that artifact, copies only the `.exe` and `.msi` files into a folder, and uploads it as `zcrypt-windows-unsigned` (a zip with the installers at its root).
3. It submits that artifact to SignPath, waits up to an hour for approval, and downloads the signed files.
4. It regenerates the Tauri updater `.sig` files over the signed installers (signing changes the bytes), replaces the build artifact with the signed files, and publishes them to the release.
5. `publish-updater-manifest` then builds `latest.json` from those signatures.

## Review findings and fixes

- Fixed: the workflow-level `permissions: contents: write` removed `actions: read` from every job. The SignPath action fetches the uploaded artifact with the job token and needs `actions: read` and `contents: read`. `sign-windows` now has its own `permissions` block with `actions: read` and `contents: write`.
- Artifact names match: the job downloads `zcrypt-windows-x86_64-pc-windows-msvc`, which is exactly what the Windows matrix leg uploads.
- No `artifact-configuration-slug` is passed, so SignPath uses the project's **default** artifact configuration. That configuration lives in the SignPath web UI and is not read from the repository, so there is nothing to commit. You must create it (below) and mark it as default.
- The action is pinned to `@v3`, which exists (latest 3.0).
- Not covered: only the installers are signed. The app binary inside them is not, which is fine for SmartScreen on the download but means the installed `zcrypt-desktop.exe` shows no publisher. Signing it too would need a Tauri `signCommand` calling SignPath before bundling, which is a larger change.

## SignPath Foundation requirements

From https://signpath.org/terms:

- OSI-approved license for all components, no commercial dual licensing. zcrypt is MIT today, and the planned AGPL-3.0 is also OSI-approved, so either is fine.
- A public source repository maintained by the same team that signs. All jobs up to the signing request must run on GitHub-hosted runners (they do), so the build is traceable to the exact commit.
- Already released, actively maintained, functionality documented on the download page.
- No malware, no hacking tools, no undisclosed data transfers, no system changes without warning, and an uninstall path for every install method.
- Multi-factor authentication on SignPath and on GitHub for everyone on the signing team.
- Defined roles: Authors, Reviewers, Approvers. For a solo project you hold all three.
- A **Code signing policy** section on the home page and the download page of the site, naming the SignPath attribution, the team roles, and a link to the privacy policy. This does not exist on zcrypt.cloud yet and needs adding before applying.
- Product name and version metadata enforced on signed binaries.
- Manual approval of every release signing request.

## Steps for the owner

1. **Prepare the site.** Add the Code signing policy section to `/` and `/download` (SignPath wording: "Free code signing provided by SignPath.io, certificate by SignPath Foundation", plus roles and the privacy policy link). Turn on MFA on GitHub and SignPath.
2. **Apply.** Go to https://signpath.org/apply and submit the repository URL (https://github.com/Wosmos/zcrypt), the download page, and a short description. Acceptance is at their discretion and can take days to weeks.
3. **Create the project in SignPath** once accepted. Add the trusted build system `GitHub.com` and link it to the project.
4. **Create the artifact configuration** and set it as the default:

   ```xml
   <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
     <zip-file>
       <pe-file path="*.exe" max-matches="unbounded" product-name="zcrypt">
         <authenticode-sign/>
       </pe-file>
       <msi-file path="*.msi" max-matches="unbounded">
         <authenticode-sign/>
       </msi-file>
     </zip-file>
   </artifact-configuration>
   ```

   The syntax is taken from the SignPath docs but was not validated against their schema. The editor in the SignPath UI checks it, so fix anything it flags.
5. **Create or pick the signing policy** `release-signing` (with you as approver) for tagged releases.
6. **Add the GitHub secret and variables.** Repository Settings, Secrets and variables, Actions:
   - Secret `SIGNPATH_API_TOKEN`: a CI user API token from SignPath
   - Variable `SIGNPATH_ORGANIZATION_ID`: the organization id (SignPath, Organization, shown in the URL and settings)
   - Variable `SIGNPATH_PROJECT_SLUG`: the project slug
   - Variable `SIGNPATH_SIGNING_POLICY_SLUG`: for example `release-signing`
7. **Release.** Push a version tag. `sign-windows` starts, and SignPath emails you an approval request. Approve it within the hour (the job waits 3600 seconds, after which the release has no Windows installers and must be re-run).
8. Check the published `.exe` shows a valid digital signature in file Properties.

## Until it is on

The one-line installer (`irm https://zcrypt.cloud/install.ps1 | iex`) and a future Microsoft Store listing (see `docs/MICROSOFT_STORE.md`) both avoid the SmartScreen prompt without a certificate.
