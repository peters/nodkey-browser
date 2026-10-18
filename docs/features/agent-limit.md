# The agent limit

The phone limits how many new logins and codes one agent gets in 24 hours
("Agent limit" in the protocol). The extension only shows what the phone
says. The texts must be calm: nothing failed.

## Preparation

The browser is paired with the fake phone. The fake phone mode is `approve`.
Set the limit with `PUT /_fake/quota`.

## Procedure

1. Set `{"state":"warning","new_today":12,"limit":10}`. Fill a login on
   `/login`.

   Result: Nodkey fills the login. The card shows "Filled the login for
   localhost." and below it "This browser got 12 new logins and codes today,
   so your iPhone asks with a notice. Approve each request in the Nodkey
   app." The popup shows the same note under the result. (screenshot)

2. Set `{"state":"paused","new_today":26,"limit":10}`. Fill a login.

   Result: The fields stay empty. The card shows "Nodkey on your iPhone paused
   this browser because it got many new logins and codes today. Resume it
   under Agents in Nodkey." (screenshot)

3. Set `{"state":"paused_by_user"}`. Fill a login.

   Result: The card shows "Nodkey on your iPhone paused this browser. Resume
   it under Agents in Nodkey."

4. Set `{"state":"off"}`.

   Result: Requests work as usual.
