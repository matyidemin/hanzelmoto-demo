# Owner handover — from sales demo to live service

## Confirm the business

- Confirm address, phone and email against the owner; public dealer listing is corroborating evidence.
- Supply IČO and full legal operator details. Confirm services, parts policy, workshop access and cancellations.
- Approve actual workshop hours, holidays, service durations and capacity in config.mjs. Current Po–Pi 09:00–17:00 is only a configurable proposed schedule.
- Add final pricing if desired; the current site makes no price commitment.
- Replace illustrative photography with approved business photography.

## Configure operations

- Provision persistent Node 24 hosting, TLS/domain, secure admin secret and backups.
- Protect admin access with edge access controls/MFA if employee use requires it.
- Run the test suite on the deployed release. Restore a test backup successfully.
- Connect an owned email relay, verify sender domain and use test recipients to prove delivery. Keep outbox-only until verified.
- Schedule the hourly job once; monitor failures and exhausted retries. Agree who confirms pending reservations and contacts customers when messaging is unavailable.
- Test full service duration collisions with two browsers; booking without reminder consent; booking confirmation; cancellation and rebooking; holiday closure; reminder signup; consent confirmation; due reminder; revocation before sending; admin logout and re-login.
- On the real host, `/runtime.js` must say `window.HM_DEMO = false;`. No demo records or demo password should exist.
- No deposit collection, real-time external calendar sync or SMS delivery is included. Integrate separately if sold as part of a package.

## Approve privacy handling

- Finalize the marked Slovak privacy draft before real customer signup.
- Approve retention periods and implement scheduled booking/outbox cleanup. Expired pending consent cleanup is supplied as a manual command.
- Record hosting/mail processors, data-processing agreements and any EEA transfer safeguards.
- Document identity verification for rights requests, access restrictions and backup expiry.
- Opt-in must stay optional and unchecked. Never import a marketing list as confirmed consent.
- Test erasure/export against a disposable database, not live customer records.

## Commercial handoff

The included preview is suitable for showing the design and workflow to the owner. The Node app is a functional starting release, with explicit integration and operational gates above. Do not advertise the static preview as a connected reservation system or describe messages as delivered until the configured relay and operational process have been verified.
