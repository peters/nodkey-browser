# ADR-0005: Seal the password of a save at once

Status: Accepted.
Date: 2026-10-11.

## Context

The extension offers to save a login that the person types into a page. The
person approves the save on the phone. Sometimes the phone does not answer
in 120 seconds. The extension must then keep the login, so that the person can
send it again.

The relay refuses a `request_id` that it saw before. Thus the extension cannot
send the same sealed request again. A new request needs the password again.

## Decision

The protocol seals the password of a `save` request to the phone on its own
(`info` = `nodkey/v1/password`, `aad` = `agent_id`). The sealed password goes
inside the sealed request.

The extension seals the password immediately when the person submits the form.
After that, it keeps only the sealed password, the site and the user name. A
save that waits for the phone is kept in `chrome.storage.local` with the sealed
password. The person can send it again from the popup, as a new request with
the same sealed password. Only the phone can open the password.

When a sign-in has two steps (user name first, password on the next page), the
extension keeps the user name for 5 minutes in session storage. Session
storage is in memory only.

## Consequences

- The extension never keeps a password in clear, also not in memory after the
  submit.
- The app must open the sealed password. That is a change in `peters/nodkey`.
- A save that waits is sealed to one phone. When the person unpairs that
  phone, the extension deletes the save.
