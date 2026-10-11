# Telegram onboarding checkpoint

The setup CLI is implemented; live bot creation, token verification and recipient
mapping require the operator. Durable approval requests, update receiver, messages,
decisions and purchasing continuation are not implemented at this checkpoint.
The API does not read these credentials or start Telegram on launch. Nothing in
the setup CLI sends a message or grants purchasing authority.

## Create the bot and verify its recipient

1. Open the official [BotFather](https://t.me/BotFather) and send `/newbot`.
   Choose a display name and an available bot username ending in `bot`.
   Use a dedicated RelayOps bot for this local demonstration.
2. Paste the generated token into `TELEGRAM_BOT_TOKEN` in the existing Git-ignored
   `.env`. Preserve the OpenRouter key, demo settings and original spending ledger.
   Never paste the token into chat, a URL in your browser, frontend variables or Git.
3. Run `npm run telegram:setup -- --prepare` (Windows: `npm.cmd`). The CLI verifies
   the bot via `getMe`, refuses an existing webhook and creates an expiring pairing
   link in local output. Open that link in the intended approver's Telegram account
   and press **Start**. Keep the link private; it expires in 15 real-time minutes.
4. Run `npm run telegram:setup -- --identify`. Only a new private-chat `/start`
   carrying this bot's exact pairing nonce can produce a candidate. The CLI refuses
   ambiguous recipients; it never selects the first/last person to contact the bot.
   Copy the returned bot/user/chat IDs into the matching `.env` fields.
5. Explicitly select `TELEGRAM_APPROVER_ACCOUNT_ID` (the seeded owner is `owner`)
   and `TELEGRAM_APPROVER_LOCALE=en` or `az`. Then run
   `npm run telegram:setup -- --check`. It verifies the bot identity, private-chat
   mapping and existing owner role using a read-only local database connection.

Missing token/mapping, invalid provider responses and network failures use fixed,
secret-free error codes. Raw Telegram response descriptions, transport errors,
user messages and credentials never enter output. Username is display information;
numeric bot/user/chat IDs and the server account define the proposed mapping.
Future callbacks must freshly validate the configured recipient and current owner
role; this CLI check is not a lasting authorization grant.

`--identify` reads at most the first 100 pending updates with `timeout=0`. It sends
no offset or `allowed_updates` change, acknowledges no updates, and starts no daemon.
It does not change/delete a webhook or discard a queue. If Start is not found,
check that the pairing is still valid and no other bot receiver is running; a busy
queue needs explicit review rather than silently dropping older updates. Updates
can expire in Telegram even without acknowledgement. A newly created dedicated
bot avoids interference with another application's receiver.

The pairing nonce/time/bot ID live in ignored `runtime/telegram-setup.json`; running
`--prepare` replaces only that setup session. Candidate output is local personal
configuration; do not publish it. Network requests have a 1–30 second deadline,
redirects are refused, the streamed response is capped at 1 MB and there are no
automatic retries. No provider inference, business writes or reset occurs.

## Evidence and remaining work

Unpaid synthetic HTTP tests exercise real request/response handling, role checks,
bot identity, pairing expiry/replay/ambiguity and fixed error output. These are not
live Telegram verification or durable approval/restart tests. Tasks 12.01–12.03
remain incomplete until the actual operator-owned bot/token/mapping are verified.
The canonical plan remains 185/357; continue at 12.01 rather than skipping setup.

Official references: [bot creation](https://core.telegram.org/bots/features#creating-a-new-bot),
[private start links](https://core.telegram.org/bots/features#deep-linking),
[getUpdates and acknowledgement semantics](https://core.telegram.org/bots/api#getupdates),
[webhook status](https://core.telegram.org/bots/api#getwebhookinfo).
