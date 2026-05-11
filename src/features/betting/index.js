import { registerCommand, registerModal, registerButton } from '../../interactions/registry.js';
import {
  handleBalance,
  handleBalances,
  handlePredict,
  handleBet,
  handlePredictions,
  handleMyBets,
  handleResolve,
  handleVoidPrediction,
  handleChangeBalance,
  handleBeg,
} from './handlers.js';
import {
  handlePredictModal,
  handleBetModal,
  handleResolveModal,
} from './modals.js';
import { handleBetButton, handleDonateButton } from './buttons.js';

registerCommand('balance',        handleBalance);
registerCommand('balances',       handleBalances);
registerCommand('predict',        handlePredict);
registerCommand('bet',            handleBet);
registerCommand('predictions',    handlePredictions);
registerCommand('mybets',         handleMyBets);
registerCommand('resolve',        handleResolve);
registerCommand('voidprediction', handleVoidPrediction);
registerCommand('changebalance',  handleChangeBalance);
registerCommand('beg',            handleBeg);

registerModal('predict_modal', handlePredictModal);
registerModal('bet_modal',     handleBetModal);
registerModal('resolve_modal', handleResolveModal);

registerButton('bet',    handleBetButton);
registerButton('donate', handleDonateButton);
