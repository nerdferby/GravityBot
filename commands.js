import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Betting system commands

const BALANCE_COMMAND = {
  name: 'balance',
  description: 'Check credit balance',
  options: [
    {
      type: 3,
      name: 'user',
      description: 'User to check (tag a user)',
      required: false,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const PREDICT_COMMAND = {
  name: 'predict',
  description: 'Create a new prediction (opens a form)',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const BET_COMMAND = {
  name: 'bet',
  description: 'Place a bet on a prediction (opens a form)',
  options: [
    {
      type: 4,
      name: 'prediction_id',
      description: 'The ID of the prediction',
      required: true,
      min_value: 1,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const PREDICTIONS_COMMAND = {
  name: 'predictions',
  description: 'View all active predictions',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const RESOLVE_COMMAND = {
  name: 'resolve',
  description: '[ADMIN] Resolve a prediction (opens a form)',
  options: [
    {
      type: 4,
      name: 'prediction_id',
      description: 'The ID of the prediction to resolve',
      required: true,
      min_value: 1,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const MYBETS_COMMAND = {
  name: 'mybets',
  description: 'View your active bets',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const BALANCES_COMMAND = {
  name: 'balances',
  description: 'View everyone\'s balance (excludes default 1000)',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const CHANGEBALANCE_COMMAND = {
  name: 'changebalance',
  description: '[ADMIN] Add or remove credits from a user',
  options: [
    {
      type: 6,
      name: 'user',
      description: 'The user to modify',
      required: true,
    },
    {
      type: 3,
      name: 'action',
      description: 'Add, remove, or set credits',
      required: true,
      choices: [
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' },
        { name: 'Set', value: 'set' },
      ],
    },
    {
      type: 4,
      name: 'amount',
      description: 'Amount of credits',
      required: true,
      min_value: 1,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const DEBUG_COMMAND = {
  name: 'debug',
  description: '[ADMIN] Debug database info',
  options: [
    {
      type: 1,
      name: 'stats',
      description: 'Show overall database stats',
    },
    {
      type: 1,
      name: 'prediction',
      description: 'Inspect a prediction and its bets',
      options: [
        {
          type: 4,
          name: 'prediction_id',
          description: 'The ID of the prediction',
          required: true,
          min_value: 1,
        },
      ],
    },
    {
      type: 1,
      name: 'user',
      description: 'Inspect a user balance and bets',
      options: [
        {
          type: 6,
          name: 'user',
          description: 'The user to inspect',
          required: true,
        },
        {
          type: 4,
          name: 'limit',
          description: 'Max bets to show (default 10)',
          required: false,
          min_value: 1,
          max_value: 20,
        },
      ],
    },
    {
      type: 1,
      name: 'recent',
      description: 'Show recent predictions',
      options: [
        {
          type: 4,
          name: 'limit',
          description: 'Max predictions to show (default 5)',
          required: false,
          min_value: 1,
          max_value: 20,
        },
      ],
    },
    {
      type: 1,
      name: 'reset',
      description: 'Reset database (truncate all tables) - DANGEROUS',
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 2],
};

const ALL_COMMANDS = [
  BALANCE_COMMAND,
  PREDICT_COMMAND,
  BET_COMMAND,
  PREDICTIONS_COMMAND,
  RESOLVE_COMMAND,
  MYBETS_COMMAND,
  BALANCES_COMMAND,
  CHANGEBALANCE_COMMAND,
  DEBUG_COMMAND,
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
