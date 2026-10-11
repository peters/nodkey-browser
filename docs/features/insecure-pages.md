# Pages without HTTPS

## Preparation

The browser is paired with the fake phone. You need an HTTP page with a sign-in
form on a host name that is not local. For example, map `insecure.test` to
`127.0.0.1` in the test browser (Chromium: `--host-resolver-rules`; Firefox:
`network.dns.localDomains`) and open `http://insecure.test:<site port>/login`.

## Procedure

1. Click in the password field.

   Result: The Nodkey button does not show.

2. Open the popup on that tab.

   Result: The popup shows the site and "This page does not use HTTPS. Nodkey
   does not fill passwords here." The fill buttons are not available.
   (screenshot)

3. Open `http://localhost:<site port>/login` (a local address).

   Result: The Nodkey button shows and the fill works. Local addresses
   (routers, printers, development servers) are permitted.
