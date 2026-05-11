import {
  MessageComponentTypes,
  ButtonStyleTypes,
} from 'discord-interactions';
import {
  getUserBalance,
  getAllBalances,
  getActivePredictions,
  getPrediction,
  getUserBets,
  changeBalance,
  voidPrediction,
} from '../../../betting.js';
import { ephemeral, public_ } from '../../lib/response.js';
import { isAdmin } from '../../lib/auth.js';
import { encode } from '../../lib/customId.js';
import { buildPredictModal, buildBetModal, buildResolveModal } from './modals.js';

function formatTimestamp(dateStr, format = 'F') {
  if (!dateStr) return 'unknown';
  const unixSeconds = Math.floor(new Date(dateStr).getTime() / 1000);
  return `<t:${unixSeconds}:${format}>`;
}

export async function handleBalance(interaction) {
  const { data, userId } = interaction;
  const userOption = data.options?.find(opt => opt.name === 'user')?.value;

  if (userOption) {
    const userIdMatch = userOption.match(/^<@!?(\d+)>$/);
    if (!userIdMatch) {
      return ephemeral('❌ Invalid user format. Please tag a user or use "_all".');
    }
    const targetUserId = userIdMatch[1];
    const balance = await getUserBalance(targetUserId);
    return public_(`💰 <@${targetUserId}> has **${balance}** credits.`);
  }

  const balance = await getUserBalance(userId);
  return ephemeral(`💰 You have **${balance}** credits.`);
}

export async function handleBalances(interaction) {
  const balances = await getAllBalances();

  if (balances.length === 0) {
    return ephemeral('💰 Everyone has the default balance (1000 credits).');
  }

  let message = '💰 **All Balances:**\n\n';
  for (const row of balances) {
    message += `<@${row.user_id}>: **${row.balance}** credits\n`;
  }
  return ephemeral(message);
}

export function handlePredict() {
  return buildPredictModal();
}

export async function handleBet(interaction) {
  const { data } = interaction;
  const predictionId = data.options.find(opt => opt.name === 'prediction_id').value;
  const prediction = await getPrediction(predictionId);

  if (!prediction) {
    return ephemeral(`❌ Prediction #${predictionId} not found. Use \`/predictions\` to see active predictions.`);
  }

  if (prediction.resolved) {
    return ephemeral(`❌ Prediction #${predictionId} is already resolved.`);
  }

  return buildBetModal(predictionId, prediction.options);
}

export async function handlePredictions() {
  const activePredictions = await getActivePredictions();

  if (activePredictions.length === 0) {
    return ephemeral('📋 No active predictions. Create one with `/predict`!');
  }

  let message = '📋 **Active Predictions:**\n\n';
  const components = [];

  // Discord allows a maximum of 5 action rows per message.
  const MAX_PREDICTIONS_SHOWN = 5;
  for (const pred of activePredictions.slice(0, MAX_PREDICTIONS_SHOWN)) {
    const totalPot = pred.bets.reduce((sum, bet) => sum + bet.amount, 0);
    const createdAt = formatTimestamp(pred.createdAt);
    message +=
      `**ID ${pred.id}:** ${pred.question}\n` +
      `**Options:** ${pred.options.join(', ')}\n` +
      `🕒 Created: ${createdAt}\n` +
      `💰 Total pot: ${totalPot} credits | 🎲 ${pred.bets.length} bet(s)\n\n`;

    components.push({
      type: MessageComponentTypes.ACTION_ROW,
      components: [{
        type: MessageComponentTypes.BUTTON,
        style: ButtonStyleTypes.PRIMARY,
        label: `Bet on #${pred.id}`,
        custom_id: encode('bet', pred.id),
      }],
    });
  }

  return public_(message, components);
}

export async function handleMyBets(interaction) {
  const { userId } = interaction;
  const userBets = await getUserBets(userId);

  if (userBets.length === 0) {
    return ephemeral('🎲 You have no active bets.');
  }

  let message = '🎲 **Your Active Bets:**\n\n';
  for (const betInfo of userBets) {
    message +=
      `**ID ${betInfo.predictionId}:** ${betInfo.question}\n` +
      `Your bet: **${betInfo.bet.prediction}** (${betInfo.bet.amount} credits)\n\n`;
  }

  return ephemeral(message);
}

export async function handleResolve(interaction) {
  const { data, userId } = interaction;

  if (!isAdmin(userId)) {
    return ephemeral('❌ You do not have permission to use this command.');
  }

  const predictionId = data.options.find(opt => opt.name === 'prediction_id').value;
  const prediction = await getPrediction(predictionId);

  if (!prediction) {
    return ephemeral(`❌ Prediction #${predictionId} not found.`);
  }

  return buildResolveModal(predictionId, prediction.options);
}

export async function handleVoidPrediction(interaction) {
  const { data, userId } = interaction;

  if (!isAdmin(userId)) {
    return ephemeral('❌ You do not have permission to use this command.');
  }

  const predictionId = data.options.find(opt => opt.name === 'prediction_id').value;
  const prediction = await getPrediction(predictionId);

  if (!prediction) {
    return ephemeral(`❌ Prediction #${predictionId} not found.`);
  }

  const result = await voidPrediction(predictionId);
  if (!result.success) {
    return ephemeral(`❌ ${result.error}`);
  }

  let message =
    `✅ **Prediction #${predictionId} Voided!**\n\n` +
    `**Question:** ${prediction.question}\n` +
    `**Total Pot Returned:** ${result.totalPot} credits\n\n`;

  if (result.refunds.length === 0) {
    message += '💸 No bets to refund.';
  } else {
    message += '💸 **Refunds:**\n';
    for (const refund of result.refunds) {
      message += `<@${refund.userId}> received **${refund.amount}** credits back\n`;
    }
  }

  return public_(message);
}

const BEG_BALANCE_LIMIT = 10;
const DONATE_AMOUNTS = [1, 50, 100];

function buildDonateButtons(targetUserId) {
  return [{
    type: MessageComponentTypes.ACTION_ROW,
    components: DONATE_AMOUNTS.map(amount => ({
      type: MessageComponentTypes.BUTTON,
      style: ButtonStyleTypes.PRIMARY,
      label: `Donate ${amount} Credit${amount === 1 ? '' : 's'}`,
      custom_id: encode('donate', targetUserId, amount),
    })),
  }];
}

export async function handleBeg(interaction) {
  const { userId, member, user } = interaction;
  const balance = await getUserBalance(userId);

  if (balance > BEG_BALANCE_LIMIT) {
    return ephemeral('You are too rich to beg.');
  }

  const username = member?.nick ?? member?.user?.username ?? user?.username ?? `<@${userId}>`;
  console.log(`[Betting] userId=${userId} balance=${balance} action=beg`);
  return public_(`**${username}** is begging for credits. Click a button to donate or just laugh at them.`, buildDonateButtons(userId));
}

export async function handleChangeBalance(interaction) {
  const { data, userId } = interaction;

  if (!isAdmin(userId)) {
    return ephemeral('❌ You do not have permission to use this command.');
  }

  const targetUser = data.options.find(opt => opt.name === 'user').value;
  const action     = data.options.find(opt => opt.name === 'action').value;
  const amount     = data.options.find(opt => opt.name === 'amount').value;

  let changeAmount;
  if (action === 'set') {
    const currentBalance = await getUserBalance(targetUser);
    changeAmount = amount - currentBalance;
  } else {
    changeAmount = action === 'add' ? amount : -amount;
  }

  const result = await changeBalance(targetUser, changeAmount);
  if (!result.success) {
    return ephemeral(`❌ ${result.error}`);
  }

  let actionText;
  if (action === 'set') {
    actionText = `set to ${amount} credits for`;
  } else {
    actionText = action === 'add'
      ? `${amount} credits added to`
      : `${amount} credits removed from`;
  }

  return public_(`✅ ${actionText} <@${targetUser}>'s balance.\n**Old balance:** ${result.oldBalance}\n**New balance:** ${result.newBalance}`);
}
