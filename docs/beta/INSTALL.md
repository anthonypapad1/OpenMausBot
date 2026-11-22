# Installing the Corso beta on your Mac

Thanks for trying Corso early. This beta isn't in the App Store and Apple hasn't
reviewed it yet, so your Mac will ask you to confirm once that you trust it.
The whole install takes about five minutes.

**You'll need:** a Mac with Apple silicon (M1 or newer) running macOS 12 Monterey
or later, and your Mac's login password.

Not sure which chip you have? Click the Apple menu  > **About This Mac**. If it
says "Chip: Apple M…", you're set. If it says "Processor: Intel", ask Anthony
for the Intel version.

## 1. Download

1. Open the link Anthony sent you.
2. Click the file named **Corso-…-arm64.dmg** to download it.
3. When it finishes, open your **Downloads** folder and double-click it.

A window opens with the Corso icon on the left and your Applications folder on
the right.

## 2. Move Corso to Applications

1. Drag the **Corso** icon onto the **Applications** folder.
2. Wait for the copy to finish, then close the window.
3. In Finder's sidebar, click the eject button next to **Corso**.

You can now delete the .dmg file from Downloads.

## 3. Open Corso the first time

Your Mac blocks apps from developers it doesn't know yet. You only do this once.

1. Open your **Applications** folder and double-click **Corso**.
2. A message says **"Corso" Not Opened** (or "Apple could not verify…").
   Click **Done**. Don't click "Move to Trash".
3. Open the Apple menu  > **System Settings** > **Privacy & Security**.
4. Scroll down to the **Security** section. You'll see
   *"Corso" was blocked to protect your Mac.* Click **Open Anyway**.
   (This button only shows for about an hour after step 2. If it's gone,
   double-click Corso again and come back.)
5. Click **Open Anyway** again, then enter your Mac password or use Touch ID.

Corso opens. From now on it opens like any other app.

## 4. Permissions Corso may ask for

Corso asks for each one only when you use the feature that needs it. Saying
"Don't Allow" is fine: the rest of Corso keeps working, and you can change your
mind later in **System Settings > Privacy & Security**.

| Permission | When it asks | Why |
| --- | --- | --- |
| **Keychain** ("Corso wants to use your confidential information stored in 'Corso Safe Storage'…") | Usually the first time you open a new beta version | Corso keeps your passwords and keys locked in your Mac's keychain. Enter your Mac password and click **Always Allow**. |
| **Notifications** | When a bot first has news for you | So Deal Desk can tell you a deadline is close or a document came in. |
| **Microphone** and **Speech Recognition** | When you click the microphone to dictate | To type what you say. Your voice is turned into text on your Mac. |
| **Accessibility** and **Screen Recording** | When you let a bot use apps on this Mac | So a bot can see the screen and click and type for you, for example in CTM eContracts. You turn these on in System Settings; Corso shows you where. |
| **Local Network** | When you connect your phone or another computer | So Corso can find your own devices on your Wi-Fi. |
| **Downloads folder** | Only if you move bots over from another app | To pick up the file that app saved. |

## 5. Getting a new beta version

Corso won't update itself during the beta. When Anthony sends a new version:

1. Quit Corso (Corso menu > **Quit Corso**).
2. Download and open the new .dmg and drag Corso to Applications again. Choose
   **Replace** when asked.
3. Open Corso. You may need to do step 3 above again.

Your deals, bots and settings stay where they are.

The first time a new version opens, macOS may ask: *"Corso wants to use your
confidential information stored in 'Corso Safe Storage' in your keychain."*
Enter your Mac password and click **Always Allow**. Each beta build is signed
differently, so the Mac asks once per new version. Corso waits on its loading
screen until you answer, so if it seems stuck on "Opening your workspace…", look
for that window behind it.

If you'd given Corso **Accessibility** or **Screen Recording** and a bot can no
longer use your Mac after the update, open **System Settings > Privacy &
Security**, find that permission, select Corso, click the **–** button to remove
it, then turn it back on when Corso asks.

## Something not working?

Text or email Anthony with what you were doing and a screenshot. You can't
break anything on your Mac by trying things in Corso.

---

## For Anthony: cutting a beta build

`pnpm package:mac:beta` builds with `electron-builder.beta.yml`, which extends
`electron-builder.yml` and changes three things: an ad-hoc signature instead
of a Developer ID, an unsigned .dmg, and no update feed (an ad-hoc signed app
can't install updates over itself, so the beta never looks for one). It isn't
notarized, which is why testers go through step 3. Once there's a Developer ID
certificate in the keychain, `pnpm package:mac` makes the signed build from
`electron-builder.yml` alone; notarizing is a separate step after that.

1. Start from a clean, up-to-date `corso/rebrand`:
   ```bash
   git switch corso/rebrand && git pull
   pnpm install --frozen-lockfile
   ```
   The build needs Node 24 (`node -v`) and Xcode's command line tools
   (`xcode-select --install`) for the dictation helper.
2. If this beta should be distinguishable from the last one, bump `version`
   in `package.json` and commit that through a PR.
3. Build both Apple silicon and Intel:
   ```bash
   pnpm package:mac:beta -c.directories.output="$HOME/corso-release"
   ```
   The output folder must be outside `~/Documents` and `~/Desktop` when
   iCloud's "Desktop & Documents Folders" is on (it is on the Mini): iCloud
   tags every new app bundle there with Finder metadata and `codesign` then
   fails with *"resource fork, Finder information, or similar detritus not
   allowed"*. From a checkout outside those folders, plain
   `pnpm package:mac:beta` writes to `release/`.

   The first run downloads the bundled browser and helpers, so allow 10–20
   minutes; after that packaging takes a few minutes. You get:
   - `Corso-<version>-arm64.dmg` (~300 MB): Apple silicon, what most testers need
   - `Corso-<version>-x64.dmg`: Intel Macs
   - `mac-arm64/Corso.app`: the app itself, for a quick check
4. Smoke-test: `open ~/corso-release/mac-arm64/Corso.app`, check the
   window comes up, then quit. This uses your real `~/.openmausbot` bot data;
   to keep it out of the way, run
   `OMB_DATA_DIR=$(mktemp -d) ~/corso-release/mac-arm64/Corso.app/Contents/MacOS/Corso`
   instead. A local build doesn't carry the download quarantine flag, so to
   see exactly what testers see, install the .dmg from a browser download.
5. Draft the GitHub release and attach the .dmg files only (not the .zip
   files or blockmaps):
   ```bash
   v=$(node -p "require('./package.json').version")
   gh release create "v$v-beta.1" \
     ~/corso-release/Corso-$v-arm64.dmg ~/corso-release/Corso-$v-x64.dmg \
     -R anthonypapad1/OpenMausBot --prerelease --draft \
     --title "Corso beta $v" --notes "Install steps: docs/beta/INSTALL.md"
   ```
   Review the draft on GitHub, then publish it and keep it marked
   **pre-release**. The repo is public, so anyone with the link can download
   the .dmg.
6. Send the tester the release link and this guide.
