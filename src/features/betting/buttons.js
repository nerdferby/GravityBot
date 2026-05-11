import { getPrediction, donateCredits } from '../../../betting.js';
import { ephemeral, public_ } from '../../lib/response.js';
import { decode } from '../../lib/customId.js';
import { buildBetModal } from './modals.js';

export async function handleDonateButton(interaction) {
  const { data, userId: donorId } = interaction;
  const { parts } = decode(data.custom_id);
  const targetUserId = parts[0];
  const amount = parseInt(parts[1]);

  if (donorId === targetUserId) {
    return ephemeral('You cannot donate to yourself.');
  }

  const result = await donateCredits(donorId, targetUserId, amount);

  if (!result.success) {
    return ephemeral(`❌ ${result.error}`);
  }

  console.log(`[Betting] donorId=${donorId} recipientId=${targetUserId} amount=${amount} action=donate`);
  return public_(`<@${donorId}> donated **${amount}** credit${amount === 1 ? '' : 's'} to <@${targetUserId}>!`);
}

export async function handleBetButton(interaction) {
  const { data } = interaction;
  const { parts } = decode(data.custom_id);
  const predictionId = parseInt(parts[0]);
  const prediction = await getPrediction(predictionId);

  if (!prediction) {
    return ephemeral(`❌ Prediction #${predictionId} not found.`);
  }

  return buildBetModal(predictionId, prediction.options);
}
