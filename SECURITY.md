# Security

The Nodkey extension fills passwords, one-time codes and passkeys, so a security problem in it
matters. Please tell us about one in private before you tell anyone else.

## Report a problem

Use **Report a vulnerability** under the repository's Security tab
(GitHub private vulnerability reporting). Do not open a public issue.

Tell us what you found, how to make it happen and what an attacker could get. A proof of concept
helps. We answer within a week and tell you when a fix is out. We name you in the release notes if
you want.

## What is in scope

- This repository: the background, the content script, the popup and the settings page.
- How the extension decides where it may fill, for example a page that is not secure or a frame
  from another site.
- How it keeps its keys and a password that waits to be saved
  ([ADR-0002](docs/adr/0002-keys-in-webcrypto.md), [ADR-0005](docs/adr/0005-save-with-sealed-password.md)).

A problem in the protocol code (`nodkey-proto`) belongs in
[peters/nodkey-cli](https://github.com/peters/nodkey-cli/security). If you are not sure, report it
here.

## Supported versions

Only the newest version gets fixes.
