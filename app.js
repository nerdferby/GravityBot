import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  ButtonStyleTypes,
  TextStyleTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import {
  getUserBalance,
  createPrediction,
  placeBet,
  resolvePrediction,
  getAllBalances,
  getActivePredictions,
  getPrediction,
  getUserBets,
  changeBalance,
} from './betting.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

// Admin user IDs (add your Discord user ID here)
const ADMIN_IDS = [
  // Add admin Discord user IDs here, e.g., '123456789012345678'
  '218448193661173761'
];

// Allowed channel IDs (leave empty to allow all channels)
// To get a channel ID: Enable Developer Mode in Discord settings,
// right-click the channel, and click "Copy Channel ID"
const ALLOWED_CHANNEL_IDS = [
  // Add channel IDs here, e.g., '123456789012345678'
  // Leave empty array [] to allow all channels
  '419913061097406464',
  '1469016835801219278'
];

function buildOptionsPlaceholder(options, maxLength = 100) {
  if (!Array.isArray(options) || options.length === 0) {
    return 'Enter an option';
  }

  const text = options.join(', ');
  if (text.length <= maxLength) {
    return text;
  }

  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
}

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { id, type, data, member, user } = req.body;

  // Get user ID (works in both guilds and DMs)
  const userId = member?.user?.id || user?.id;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  // Channel restriction check (if enabled)
  if (ALLOWED_CHANNEL_IDS.length > 0) {
    const channelId = req.body.channel?.id || req.body.channel_id;
    if (channelId && !ALLOWED_CHANNEL_IDS.includes(channelId)) {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ This bot can only be used in specific channels.',
          flags: 64, // Ephemeral
        },
      });
    }
  }

  /**
   * Handle slash command requests
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name, options } = data;

    // /balance command
    if (name === 'balance') {
      const userOption = options?.find(opt => opt.name === 'user')?.value;

      // Show specific user's balance
      if (userOption) {
        // Extract user ID from mention format <@123456> or <@!123456>
        const userIdMatch = userOption.match(/^<@!?(\d+)>$/);
        if (!userIdMatch) {
          return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
              content: '❌ Invalid user format. Please tag a user or use "_all".',
              flags: 64,
            },
          });
        }

        const targetUserId = userIdMatch[1];
        const balance = await getUserBalance(targetUserId);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `💰 <@${targetUserId}> has **${balance}** credits.`,
            flags: 64,
          },
        });
      }

      // Show own balance (default)
      const balance = await getUserBalance(userId);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `💰 You have **${balance}** credits.`,
          flags: 64,
        },
      });
    }

    // /balances command
    if (name === 'balances') {
      const balances = await getAllBalances();

      if (balances.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '💰 Everyone has the default balance (100 credits).',
            flags: 64,
          },
        });
      }

      let message = '💰 **All Balances:**\n\n';
      for (const row of balances) {
        message += `<@${row.user_id}>: **${row.balance}** credits\n`;
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: message,
        },
      });
    }

    // /predict command - show modal for creating prediction
    if (name === 'predict') {
      return res.send({
        type: InteractionResponseType.MODAL,
        data: {
          custom_id: 'predict_modal',
          title: 'Create a Prediction',
          components: [
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'question_input',
                  label: 'Question',
                  style: TextStyleTypes.SHORT,
                  placeholder: 'e.g., How long will UK PM last?',
                  required: true,
                  max_length: 200,
                },
              ],
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'options_input',
                  label: 'Options (comma-separated)',
                  style: TextStyleTypes.SHORT,
                  placeholder: '1 week, 2 weeks, 1 month, 3 months',
                  required: true,
                  max_length: 300,
                },
              ],
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'choice_input',
                  label: 'Your Choice',
                  style: TextStyleTypes.SHORT,
                  placeholder: 'Pick from your options above',
                  required: true,
                  max_length: 100,
                },
              ],
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'amount_input',
                  label: 'Bet Amount',
                  style: TextStyleTypes.SHORT,
                  placeholder: 'Credits to bet',
                  required: true,
                  max_length: 10,
                },
              ],
            },
          ],
        },
      });
    }

    // /bet command - show modal for betting
    if (name === 'bet') {
      const predictionId = options.find(opt => opt.name === 'prediction_id').value;
      const prediction = await getPrediction(predictionId);

      if (!prediction) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Prediction #${predictionId} not found. Use \`/predictions\` to see active predictions.`,
            flags: 64,
          },
        });
      }

      if (prediction.resolved) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Prediction #${predictionId} is already resolved.`,
            flags: 64,
          },
        });
      }

      // Show modal for betting (same as button click)
      return res.send({
        type: InteractionResponseType.MODAL,
        data: {
          custom_id: `bet_modal_${predictionId}`,
          title: `Bet on Prediction #${predictionId}`,
          components: [
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'option_input',
                  label: 'Choose an option',
                  style: TextStyleTypes.SHORT,
                  placeholder: buildOptionsPlaceholder(prediction.options),
                  required: true,
                  max_length: 100,
                },
              ],
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'bet_amount_input',
                  label: 'Bet Amount',
                  style: TextStyleTypes.SHORT,
                  placeholder: 'Credits to bet',
                  required: true,
                  max_length: 10,
                },
              ],
            },
          ],
        },
      });
    }

    // /predictions command - view all active predictions
    if (name === 'predictions') {
      const activePredictions = await getActivePredictions();

      if (activePredictions.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '📋 No active predictions. Create one with `/predict`!',
            flags: 64,
          },
        });
      }

      let message = '📋 **Active Predictions:**\n\n';
      const components = [];

      for (const pred of activePredictions.slice(0, 5)) { // Limit to 5 for space
        const totalPot = pred.bets.reduce((sum, bet) => sum + bet.amount, 0);
        message += `**ID ${pred.id}:** ${pred.question}\n`;
        message += `**Options:** ${pred.options.join(', ')}\n`;
        message += `💰 Total pot: ${totalPot} credits | 🎲 ${pred.bets.length} bet(s)\n\n`;

        // Add a "Bet on this" button for each prediction
        components.push({
          type: MessageComponentTypes.ACTION_ROW,
          components: [
            {
              type: MessageComponentTypes.BUTTON,
              style: ButtonStyleTypes.PRIMARY,
              label: `Bet on #${pred.id}`,
              custom_id: `bet_${pred.id}`,
            },
          ],
        });
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: message,
          components: components,
        },
      });
    }

    // /mybets command - view your active bets
    if (name === 'mybets') {
      const userBets = await getUserBets(userId);

      if (userBets.length === 0) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '🎲 You have no active bets.',
            flags: 64,
          },
        });
      }

      let message = '🎲 **Your Active Bets:**\n\n';
      for (const betInfo of userBets) {
        message += `**ID ${betInfo.predictionId}:** ${betInfo.question}\n`;
        message += `Your bet: **${betInfo.bet.prediction}** (${betInfo.bet.amount} credits)\n\n`;
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: message,
          flags: 64,
        },
      });
    }

    // /resolve command - admin only
    if (name === 'resolve') {
      // Check if user is admin
      if (!ADMIN_IDS.includes(userId)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You do not have permission to use this command.',
            flags: 64,
          },
        });
      }

      const predictionId = options.find(opt => opt.name === 'prediction_id').value;
      const prediction = await getPrediction(predictionId);

      if (!prediction) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Prediction #${predictionId} not found.`,
            flags: 64,
          },
        });
      }

      // Show modal with options in placeholder
      return res.send({
        type: InteractionResponseType.MODAL,
        data: {
          custom_id: `resolve_modal_${predictionId}`,
          title: `Resolve Prediction #${predictionId}`,
          components: [
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'outcome_input',
                  label: 'Winning Outcome',
                  style: TextStyleTypes.SHORT,
                  placeholder: buildOptionsPlaceholder(prediction.options),
                  required: true,
                  max_length: 100,
                },
              ],
            },
          ],
        },
      });
    }

    // /changebalance command - admin only
    if (name === 'changebalance') {
      // Check if user is admin
      if (!ADMIN_IDS.includes(userId)) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You do not have permission to use this command.',
            flags: 64,
          },
        });
      }

      const targetUser = options.find(opt => opt.name === 'user').value;
      const action = options.find(opt => opt.name === 'action').value;
      const amount = options.find(opt => opt.name === 'amount').value;

      let changeAmount;
      if (action === 'set') {
        const currentBalance = await getUserBalance(targetUser);
        changeAmount = amount - currentBalance;
      } else {
        changeAmount = action === 'add' ? amount : -amount;
      }

      const result = await changeBalance(targetUser, changeAmount);

      if (!result.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${result.error}`,
            flags: 64,
          },
        });
      }

      let actionText;
      if (action === 'set') {
        actionText = `set to ${amount} credits for`;
      } else {
        actionText = action === 'add' ? 'added to' : 'removed from';
        actionText = `${amount} credits ${actionText}`;
      }
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ ${actionText} <@${targetUser}>'s balance.\n**Old balance:** ${result.oldBalance}\n**New balance:** ${result.newBalance}`,
        },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  /**
   * Handle modal submissions
   */
  if (type === InteractionType.MODAL_SUBMIT) {
    const { custom_id, components } = data;

    // Handle prediction creation modal
    if (custom_id === 'predict_modal') {
      const question = components[0].components[0].value;
      const optionsStr = components[1].components[0].value;
      const yourChoice = components[2].components[0].value;
      const amountStr = components[3].components[0].value;
      const amount = parseInt(amountStr);

      // Validate amount is a number
      if (isNaN(amount) || amount < 1) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Amount must be a positive number.',
            flags: 64,
          },
        });
      }

      // Parse options (comma-separated)
      const predefinedOptions = optionsStr.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);

      if (predefinedOptions.length < 2) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ You must provide at least 2 options (comma-separated).',
            flags: 64,
          },
        });
      }

      // Validate that creator's choice is in the options
      const validChoice = predefinedOptions.find(opt => opt.toLowerCase() === yourChoice.toLowerCase());
      if (!validChoice) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Your choice must match one of the options exactly.\nOptions: ${predefinedOptions.join(', ')}`,
            flags: 64,
          },
        });
      }

      const balance = await getUserBalance(userId);
      if (balance < amount) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Insufficient credits. You have ${balance} credits but need ${amount}.`,
            flags: 64,
          },
        });
      }

      const createResult = await createPrediction(userId, question, predefinedOptions, validChoice, amount);
      if (!createResult.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${createResult.error}`,
            flags: 64,
          },
        });
      }
      const predictionId = createResult.predictionId;

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ Prediction created!\n\n**ID:** ${predictionId}\n**Question:** ${question}\n**Options:**\n${predefinedOptions.map(opt => `• ${opt}`).join('\n')}\n\n<@${userId}> bet **${amount}** credits on: **${validChoice}**\n\nOthers can bet using \`/bet ${predictionId}\` or \`/predictions\`!`,
        },
      });
    }

    // Handle bet modal submission
    if (custom_id.startsWith('bet_modal_')) {
      const predictionId = parseInt(custom_id.split('_')[2]);
      const selectedOption = components[0].components[0].value;
      const amountStr = components[1].components[0].value;
      const amount = parseInt(amountStr);

      if (isNaN(amount) || amount < 1) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ Amount must be a positive number.',
            flags: 64,
          },
        });
      }

      const prediction = await getPrediction(predictionId);
      if (!prediction) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Prediction #${predictionId} not found.`,
            flags: 64,
          },
        });
      }

      const result = await placeBet(predictionId, userId, selectedOption, amount);

      if (!result.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${result.error}`,
            flags: 64,
          },
        });
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `✅ Bet placed!\n\n**Prediction #${predictionId}:** ${prediction.question}\n<@${userId}> bet **${amount}** credits on: **${selectedOption}**`,
        },
      });
    }

    // Handle resolve modal submission
    if (custom_id.startsWith('resolve_modal_')) {
      const predictionId = parseInt(custom_id.split('_')[2]);
      const outcome = components[0].components[0].value;

      const prediction = await getPrediction(predictionId);
      if (!prediction) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Prediction #${predictionId} not found.`,
            flags: 64,
          },
        });
      }

      const result = await resolvePrediction(predictionId, outcome);

      if (!result.success) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ ${result.error}`,
            flags: 64,
          },
        });
      }

      let message = `✅ **Prediction #${predictionId} Resolved!**\n\n`;
      message += `**Question:** ${prediction.question}\n`;
      message += `**Outcome:** ${outcome}\n`;
      message += `**Total Pot:** ${result.totalPot} credits\n\n`;

      if (result.winners.length === 0) {
        message += '🔄 No winners. All bets returned.';
      } else {
        message += '🎉 **Winners:**\n';
        for (const winner of result.winners) {
          message += `<@${winner.userId}> won **${winner.winnings}** credits (profit: **${winner.profit}**)\n`;
        }
      }

      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: message,
        },
      });
    }
  }

  /**
   * Handle button clicks
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    const { custom_id } = data;

    // Handle bet button clicks
    if (custom_id.startsWith('bet_')) {
      const predictionId = parseInt(custom_id.split('_')[1]);
      const prediction = await getPrediction(predictionId);

      if (!prediction) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: `❌ Prediction #${predictionId} not found.`,
            flags: 64,
          },
        });
      }

      const optionsPlaceholder = buildOptionsPlaceholder(prediction.options);

      // Show modal for betting
      return res.send({
        type: InteractionResponseType.MODAL,
        data: {
          custom_id: `bet_modal_${predictionId}`,
          title: `Bet on Prediction #${predictionId}`,
          components: [
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'option_input',
                  label: 'Choose an option',
                  style: TextStyleTypes.SHORT,
                  placeholder: optionsPlaceholder,
                  required: true,
                  max_length: 100,
                },
              ],
            },
            {
              type: MessageComponentTypes.ACTION_ROW,
              components: [
                {
                  type: MessageComponentTypes.INPUT_TEXT,
                  custom_id: 'bet_amount_input',
                  label: 'Bet Amount',
                  style: TextStyleTypes.SHORT,
                  placeholder: 'Credits to bet',
                  required: true,
                  max_length: 10,
                },
              ],
            },
          ],
        },
      });
    }
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
