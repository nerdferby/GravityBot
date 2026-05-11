# GravityBot

A Discord bot with a credit-based prediction betting system, a pinboard (starboard) feature, and admin debug tools. Built to be extended — adding new slash commands, modals, or buttons requires only creating new files under `src/features/`, never editing core dispatch code.

---

## Architecture

GravityBot runs as two Heroku processes:

| Process | Entry point | Purpose |
|---------|-------------|---------|
| `web` | `app.js` | Express HTTP server — receives Discord interaction webhooks |
| `worker` | `pinboard-worker.js` | Discord.js gateway client — handles emoji reactions |

### Directory structure

```
├── app.js                    # Express bootstrap (~15 lines)
├── pinboard-worker.js        # Worker bootstrap (~3 lines)
├── commands.js               # Command registration script (npm run register)
├── betting.js                # Prediction/betting business logic
├── db.js                     # PostgreSQL pool + query/withTransaction helpers
├── migrate.js                # Database schema creation + migrations
├── utils.js                  # DiscordRequest HTTP helper, InstallGlobalCommands
│
└── src/
    ├── config.js             # All env-var reads + startup validation
    │
    ├── lib/
    │   ├── response.js       # Discord response builders (ephemeral, public_, modal, pong)
    │   ├── customId.js       # encode/decode for modal and button custom_id values
    │   └── auth.js           # isAdmin() guard
    │
    ├── interactions/
    │   ├── registry.js       # Handler Maps + registerCommand/Modal/Button functions
    │   └── router.js         # POST /interactions dispatch with top-level error boundary
    │
    └── features/
        ├── betting/
        │   ├── commands.js   # BETTING_COMMANDS array (slash command definitions)
        │   ├── handlers.js   # One function per slash command
        │   ├── modals.js     # Modal builders + modal submit handlers
        │   ├── buttons.js    # Button click handlers (bet button, donate button)
        │   └── index.js      # Registers all betting handlers into the registry
        │
        ├── debug/
        │   ├── commands.js   # DEBUG_COMMANDS array
        │   ├── handlers.js   # /debug command handler + subcommands
        │   ├── modals.js     # debug_sql_modal submit handler
        │   ├── buttons.js    # confirm_reset button handler
        │   └── index.js      # Registers all debug handlers into the registry
        │
        └── pinboard/
            ├── commands.js   # PINBOARD_COMMANDS array
            ├── data.js       # Database access layer for pinboard tables
            ├── handlers.js   # /pinboard command handler + subcommands
            ├── index.js      # Registers pinboard command handler
            └── worker/
                ├── helpers.js              # shouldProcessReaction, buildPostPayload, etc.
                ├── handleReactionChange.js # Orchestrates a single reaction event
                └── index.js               # Client setup, event wiring, startWorker()
```

### How the dispatch system works

1. Discord sends a `POST /interactions` webhook to `app.js`.
2. `router.js` receives it, verifies the signature (via middleware), and reads the interaction type.
3. For `APPLICATION_COMMAND`: looks up `data.name` in `commandHandlers`.
4. For `MODAL_SUBMIT`: decodes the `custom_id` namespace, looks it up in `modalHandlers`.
5. For `MESSAGE_COMPONENT`: decodes the `custom_id` namespace, looks it up in `buttonHandlers`.
6. The matched handler function is called and its return value is sent back as the response.

The three Maps in `registry.js` are populated at startup when `app.js` imports the feature index files:

```js
import './src/features/betting/index.js';
import './src/features/debug/index.js';
import './src/features/pinboard/index.js';
```

Each `index.js` calls `registerCommand`, `registerModal`, and `registerButton` for its feature's handlers.

### `custom_id` encoding

Modal and button `custom_id` values use colon-separated namespaces:

```
namespace:part1:part2
```

Examples:
- `bet_modal:12` — the bet modal for prediction #12
- `resolve_modal:5` — the resolve modal for prediction #5
- `bet:3` — the "Bet on #3" button
- `confirm_reset:yes` — the confirm-reset yes button

Use `encode` and `decode` from `src/lib/customId.js`:

```js
import { encode, decode } from '../../lib/customId.js';

const id = encode('bet_modal', predictionId); // → "bet_modal:12"
const { namespace, parts } = decode(id);       // → { namespace: 'bet_modal', parts: ['12'] }
```

The router uses the namespace to look up the handler in the registry map.

---

## How to add a new feature

### Adding a brand-new slash command group

1. **Create `src/features/<name>/commands.js`** — export a `<NAME>_COMMANDS` array of command definition objects:

   ```js
   export const ECONOMY_COMMANDS = [
     {
       name: 'shop',
       description: 'Browse the shop',
       type: 1,
       integration_types: [0],
       contexts: [0],
     },
   ];
   ```

2. **Create `src/features/<name>/handlers.js`** — export one async function per command:

   ```js
   import { ephemeral, public_ } from '../../lib/response.js';

   export async function handleShop(interaction) {
     const { userId } = interaction;
     return public_('🛒 Welcome to the shop!');
   }
   ```

3. **Create `src/features/<name>/index.js`** — register your handlers:

   ```js
   import { registerCommand } from '../../interactions/registry.js';
   import { handleShop } from './handlers.js';

   registerCommand('shop', handleShop);
   ```

4. **Wire up in `app.js`** — add one import line:

   ```js
   import './src/features/economy/index.js';
   ```

5. **Wire up in `commands.js`** — import and include your commands:

   ```js
   import { ECONOMY_COMMANDS } from './src/features/economy/commands.js';
   const ALL_COMMANDS = [...BETTING_COMMANDS, ...PINBOARD_COMMANDS, ...ECONOMY_COMMANDS];
   ```

6. **Register with Discord:**

   ```sh
   npm run register
   ```

No changes needed to `router.js`, `registry.js`, or any other feature's files.

### Adding a modal to an existing feature

1. Define the modal builder and handler in the feature's `modals.js`:

   ```js
   import { encode, decode } from '../../lib/customId.js';
   import { modal, ephemeral } from '../../lib/response.js';

   export function buildMyModal(itemId) {
     return modal(encode('my_modal', itemId), 'My Modal Title', [ /* components */ ]);
   }

   export async function handleMyModal(interaction) {
     const { parts } = decode(interaction.data.custom_id);
     const itemId = parseInt(parts[0]);
     // ... process submission
     return ephemeral('✅ Done!');
   }
   ```

2. Register it in the feature's `index.js`:

   ```js
   import { registerModal } from '../../interactions/registry.js';
   import { handleMyModal } from './modals.js';

   registerModal('my_modal', handleMyModal);
   ```

The router will route any `MODAL_SUBMIT` with a `custom_id` starting with `my_modal:` to your handler.

### Adding a button to an existing feature

1. Define the handler in the feature's `buttons.js`:

   ```js
   import { encode, decode } from '../../lib/customId.js';
   import { ephemeral } from '../../lib/response.js';

   export async function handleMyButton(interaction) {
     const { parts } = decode(interaction.data.custom_id);
     const action = parts[0]; // e.g. 'confirm' or 'cancel'
     return ephemeral(action === 'confirm' ? '✅ Confirmed!' : '❌ Cancelled.');
   }
   ```

2. Build the button component in your command/modal handler:

   ```js
   import { encode } from '../../lib/customId.js';
   import { MessageComponentTypes, ButtonStyleTypes } from 'discord-interactions';

   const component = {
     type: MessageComponentTypes.BUTTON,
     style: ButtonStyleTypes.PRIMARY,
     label: 'Confirm',
     custom_id: encode('my_action', 'confirm'),
   };
   ```

3. Register it in the feature's `index.js`:

   ```js
   import { registerButton } from '../../interactions/registry.js';
   import { handleMyButton } from './buttons.js';

   registerButton('my_action', handleMyButton);
   ```

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_KEY` | ✅ | Discord app public key (for request verification) |
| `DISCORD_TOKEN` | ✅ | Bot token |
| `APP_ID` | ✅ | Discord application ID |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ADMIN_IDS` | — | Comma-separated Discord user IDs with admin access |
| `ALLOWED_CHANNEL_IDS` | — | Comma-separated channel IDs where the bot responds (empty = all channels) |
| `PINBOARD_MESSAGE_CONTENT_INTENT` | — | Set to `true` to enable the `MessageContent` gateway intent |
| `PORT` | — | HTTP port (default: `3000`) |

---

## Setup

### Prerequisites

- Node.js v18+
- PostgreSQL database
- A [Discord application](https://discord.com/developers/applications) with:
  - `applications.commands` scope
  - `bot` scope with **Send Messages** and **Read Message History** permissions
  - **Message Content Intent** enabled (if using pinboard with message content)
  - **Server Members Intent** and **Presence Intent** as needed

### Installation

1. Clone and install:
   ```sh
   git clone <repo-url>
   cd GravityBot
   npm install
   ```

2. Create a `.env` file:
   ```
   PUBLIC_KEY=your_discord_public_key
   DISCORD_TOKEN=your_bot_token
   APP_ID=your_application_id
   DATABASE_URL=postgresql://user:password@localhost:5432/gravitybot
   ADMIN_IDS=your_discord_user_id,another_admin_id
   ALLOWED_CHANNEL_IDS=channel_id_1,channel_id_2
   ```

3. Run the database migration:
   ```sh
   npm run migrate
   ```

4. Register slash commands with Discord:
   ```sh
   npm run register
   ```

5. Start the web process:
   ```sh
   npm start
   ```

6. Start the pinboard worker (separate terminal or process):
   ```sh
   npm run start:worker
   ```

### Local development

Use [ngrok](https://ngrok.com/) or similar to expose `localhost:3000`:

```sh
ngrok http 3000
```

Set the forwarding URL + `/interactions` as the **Interactions Endpoint URL** in your Discord app's Developer Portal.

---

## Commands reference

### Betting

| Command | Who | Description |
|---------|-----|-------------|
| `/predict` | Anyone | Create a new prediction (opens a form) |
| `/predictions` | Anyone | List active predictions with bet buttons |
| `/bet <id>` | Anyone | Place a bet on a prediction (opens a form) |
| `/mybets` | Anyone | View your active bets |
| `/balance [user]` | Anyone | Check credit balance |
| `/balances` | Anyone | View all non-default balances |
| `/resolve <id>` | Admin | Resolve a prediction (opens a form) |
| `/voidprediction <id>` | Admin | Void a prediction and refund all bets |
| `/changebalance <user> <action> <amount>` | Admin | Add, remove, or set a user's credits |

### Begging

| Command | Who | Description |
|---------|-----|-------------|
| `/beg` | Anyone with ≤ 10 credits | Post a public plea for donations with three buttons |

Users with more than 10 credits receive a private "You are too rich to beg" reply. Any other user can click a donate button to transfer 1, 50, or 100 credits to the beggar. Donors cannot donate to themselves.

#### Betting rules

- A user may place multiple bets on the same prediction, including multiple bets on the same option (each bet is a separate row in the `bets` table, and credits are deducted per bet).
- A user may bet on more than one option, but they cannot cover every option. The maximum number of distinct options a user may bet on is **total options − 1**. For example, on a Yes/No prediction a user may only bet on one of the two options.

### Pinboard

| Command | Who | Description |
|---------|-----|-------------|
| `/pinboard setchannel <channel>` | Admin | Set the pinboard destination channel |
| `/pinboard whitelist_add <channel>` | Admin | Monitor a channel for 📌 reactions |
| `/pinboard whitelist_remove <channel>` | Admin | Stop monitoring a channel |
| `/pinboard whitelist_list` | Admin | Show current configuration |
| `/pinboard forcepin <message_url>` | Admin | Manually pin a message |

### Debug (Admin only)

| Subcommand | Description |
|------------|-------------|
| `/debug stats` | Overall database statistics |
| `/debug prediction <id>` | Inspect a prediction and its bets |
| `/debug user <user>` | Inspect a user's balance and bet history |
| `/debug recent [limit]` | Recent predictions |
| `/debug reset` | ⚠️ Truncate all tables |
| `/debug sql` | ⚠️ Execute a raw SQL query |

---

## Database schema

Six tables, created by `npm run migrate`. The migration is idempotent (`CREATE TABLE IF NOT EXISTS`) and safe to re-run.

### `users`

Stores each Discord user and their current credit balance.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `user_id` | `TEXT` | `PRIMARY KEY` | — |
| `balance` | `INTEGER` | `NOT NULL` | `1000` |

### `predictions`

One row per prediction created via `/predict`.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `SERIAL` | `PRIMARY KEY` | — |
| `question` | `TEXT` | `NOT NULL` | — |
| `options` | `TEXT[]` | `NOT NULL` | — |
| `creator_id` | `TEXT` | `NOT NULL` | — |
| `resolved` | `BOOLEAN` | `NOT NULL` | `FALSE` |
| `outcome` | `TEXT` | — | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |

### `bets`

One row per individual bet placed on a prediction. Cascade-deletes when the parent prediction is deleted.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `SERIAL` | `PRIMARY KEY` | — |
| `prediction_id` | `INTEGER` | `NOT NULL`, FK → `predictions(id)` ON DELETE CASCADE | — |
| `user_id` | `TEXT` | `NOT NULL` | — |
| `prediction` | `TEXT` | `NOT NULL` | — |
| `amount` | `INTEGER` | `NOT NULL` | — |

### `pinboard_config`

Single-row configuration table (`id = 1`) for the pinboard feature.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `id` | `INTEGER` | `PRIMARY KEY` | — |
| `target_channel_id` | `TEXT` | — | `NULL` |
| `threshold` | `INTEGER` | `NOT NULL` | `3` |
| `emoji` | `TEXT` | `NOT NULL` | `📌` |

### `pinboard_whitelist`

Source channels that the pinboard worker monitors for reactions.

| Column | Type | Constraints |
|--------|------|-------------|
| `channel_id` | `TEXT` | `PRIMARY KEY` |

### `pinboard_posts`

Tracks which source messages have been posted to the pinboard channel, so they can be edited or deleted when reaction counts change.

| Column | Type | Constraints | Default |
|--------|------|-------------|---------|
| `message_id` | `TEXT` | `PRIMARY KEY` | — |
| `source_channel_id` | `TEXT` | `NOT NULL` | — |
| `pinboard_message_id` | `TEXT` | `NOT NULL` | — |
| `author_id` | `TEXT` | `NOT NULL` | — |
| `reaction_count` | `INTEGER` | `NOT NULL` | `0` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` |

---

## License

[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
