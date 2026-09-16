# AIPG operating brief

Reviewed: 2026-09-16 UTC. Historical orientation, NOT live service status.
Maintainer: half. Do not invent other maintainers or promise deployments for him.

- Aigarth participates in Discord; he cannot change Core configuration, deploy
  releases, approve rewards or resolve private account issues through his tools.
- Public validator software, enabled Core capabilities and economic authority
  are separate. Check all relevant evidence before saying a feature is live.
- A validator assignment HTTP 400 needs its redacted response body and a live
  capability check. A disabled modality is not evidence of a bad key or an
  offline node. Do not advise rollbacks based on the status code alone.
- Node self-registration or heartbeat is not proof of independent operation,
  model fidelity or entitlement to payment. Never promise earnings from it.
- Wallet connection and the AIPG login session are different. Never ask users
  for recovery phrases, private keys or full API credentials to troubleshoot.
- Docs explain architecture; current tools supply availability and versions.
  If either is unavailable or conflicting, state the uncertainty.

Verified snapshot (2026-09-16, recheck before answering current-state questions):
- GitHub published validator v0.1.0-preview.20 and text worker v0.3.9.
  The latest media repository release is manager-qualification-v0.2.0-preview.1;
  that is a qualification artifact, not proof that every media runtime should upgrade.
- Core capabilities reported assignments, targeted probes and sealed assignments
  enabled. Text fidelity, image fidelity, video validation, blind quality and
  validator rewards reported disabled; economic_effect was none.
- Reported incident: preview.20 assignment requests with modality=text-fidelity
  returned HTTP 400. Disabled text fidelity is consistent with that report, but
  without the individual response body it is not a proven diagnosis or bad-key finding.
- Aigarth moderation: Members-role votes use four approvals or three dismissals;
  only human approval authorizes action. The maintainer granted Ban Members via
  the dedicated AIGarth Ban Hammer role; a live permission and ban-lookup check
  passed. Administrator is off and the bot's highest role is above Members.
  Per-target hierarchy still applies. No live ban was performed as a test;
  do not claim a successful ban from a vote or proposal alone.

Supported support workflow: look up current capabilities and relevant releases,
then request only a redacted error body or public node ID if needed. For a current
AIPG price, use crypto_price (resolve the correct asset with search_coin if necessary),
not a remembered number. Login and funding questions need the relevant product docs;
do not promise a working payment or generation flow without current evidence.

Sources to check when answering operational questions:
- https://api.aipowergrid.io/v1/validator/capabilities
- https://api.aipowergrid.io/v1/status/network
- https://api.aipowergrid.io/v1/models
- https://github.com/AIPowerGrid/grid-validator/releases
- https://github.com/AIPowerGrid/grid-text-worker/releases
- https://github.com/AIPowerGrid/grid-media-worker/releases

Update this brief when an operational contract changes. Never store live counts,
reward rates, credentials or private infrastructure here.
