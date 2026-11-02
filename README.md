# Eufy Motion

Household fork of `mega-yfue/ha-eufy-sdk-bridge`. One T8210 doorbell forwards motion to a local Home Assistant webhook. The Eufy SDK handles sign-in, TLS, saved sessions, and event delivery. Eufy account access is still required.

The original bridge's control server, video services, image storage, face-name lookup, Solix support, and publish workflows have been removed. This app has no listening ports, Home Assistant API token, Supervisor API access, or custom integration. It sends only `{"motion":true}` to its configured local webhook. It does not change camera settings.

This repository targets two caregivers and one installation. The porch automation and webhook ID are configured on that installation; the ID and Eufy credentials must never be committed.

## Install and sign in

Add this repository in Settings → Apps → App store → Repositories. Supervisor builds the app from this source; no upstream prebuilt bridge image is used. Install Eufy Motion, enter the Eufy email/password, account country, and household webhook ID in Configuration, then start it.

Replace the placeholder in `porch-automations.yaml` with the app's webhook ID before adding the two automations to HA. Keep the value in the private HA configuration. HA's automation editor does not support `!secret` references in `automations.yaml`; using one breaks the editor for all automations.

If Eufy requests a verification code, send `{"code":"123456"}` with Home Assistant's Supervisor app-input action (`hassio.app_stdin`, called `hassio.addon_stdin` on older versions). Use the installed app slug. Captcha answers use `{"captcha":"answer"}`. `{"status":true}` reports connection state and returns a captcha image only while that challenge is pending. App input is handled by Supervisor's authenticated API; the app does not expose a sign-in endpoint.

The SDK opens its normal HomeBase/event connections after sign-in. Stored-snapshot acquisition and video prewarming are disabled. No stream, image, face, or device-control APIs are called by this app. A separate install identity prevents it from reusing the SDK's account-derived identity.

Enable the Supervisor watchdog. It restarts the app if the event connection stays down for five minutes. An expired Eufy session may require another verification code. Check the app log for sign-in or connection failures; logs omit credentials, device serials, images, and upstream error bodies except an explicitly requested captcha image.

## Build and check

The Node base image is pinned by digest. The SDK version and its dependencies are locked with integrity hashes. `ip-address` is pinned to the patched 10.7.4 release. Install scripts are disabled. Runtime builds do not download video binaries.

Run `npm ci --ignore-scripts`, `npm test`, and `npm audit --omit=dev` inside `eufy_motion/`. Test a real doorbell detection after installation. Keep updates manual and record the installed source revision.

The two porch lights turn on after dark for three minutes, extended by further motion. Lights that were already on are left alone. If HA restarts during that interval, the running wait ends and those lights can remain on.

Upstream source and license history are retained in Git. See LICENSE for Apache-2.0 terms.
