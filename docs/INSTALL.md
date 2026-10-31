# How to install H88CRO

## 1. Download

Get the latest version here (no GitHub account needed):

**https://github.com/RNikola/h88cro/releases/latest**

Under **Assets**, pick the file for your computer:

| Computer | File to download |
|---|---|
| Mac (Intel or Apple Silicon) | `H88CRO-<version>-universal.dmg` |
| Windows 10 / 11 | `H88CRO-Setup-<version>.exe` |

Ignore the other files (`.zip`, `.yml`, `.blockmap`): the app uses them for updates.

## 2. Install

### Mac
1. Open the `.dmg` and drag **H88CRO** into **Applications**.
2. The first time only: in Applications, **right-click H88CRO → Open**, then click **Open** again.
   (The app isn't signed by Apple yet, so macOS asks for confirmation once.)
3. If macOS says the app "is damaged", open **Terminal**, paste this line, press Enter, and open the app again:
   ```
   xattr -cr /Applications/H88CRO.app
   ```

### Windows
1. Run `H88CRO-Setup-<version>.exe`.
2. If Windows shows "Windows protected your PC", click **More info → Run anyway**.
   (The app isn't signed yet, so Windows warns once.)
3. Follow the installer. No admin rights needed. You get a desktop and Start menu shortcut.

## 3. First start

1. Choose **Solo mode** and create your local profile (name + password). The password unlocks the app on this computer.
2. The app downloads its scan engine (about 150 MB). This happens once.
3. Optional but recommended: in **Settings → Claude API key**, paste your own key from https://platform.claude.com (API keys). This turns on the AI language and consistency checks.

## 4. Updates

You don't need to do anything or download a separate updater. The app checks for new versions when it starts and every few hours.

- **Windows:** the update downloads in the background. When it's ready, a **Restart to update** button appears at the bottom left. Click it, or it installs the next time you close the app.
- **Mac:** a **New version available → Download** button appears at the bottom left. It opens the download page: install the new `.dmg` over the old app (drag to Applications → Replace).

You can also check anytime in **Settings → Updates → Check for updates**.

**Your data is kept on every update:** profile, password, settings, Claude key and all past scans stay on your computer and are not touched by updating or reinstalling.

## Need help?

Send a screenshot of the problem and your version number (shown at the bottom left of the app, or in Settings → Updates).
