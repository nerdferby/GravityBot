import { query, withTransaction } from './db.js';

const STARTING_BALANCE = 100;

async function ensureUser(userId, client) {
    const q = client || { query };
    await q.query(
        'INSERT INTO users (user_id, balance) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [userId, STARTING_BALANCE]
    );
}

/**
 * Get a user's balance, initializing if needed
 */
export async function getUserBalance(userId) {
    await ensureUser(userId);
    const result = await query('SELECT balance FROM users WHERE user_id = $1', [userId]);
    return result.rows[0].balance;
}

/**
 * Get all balances excluding default
 */
export async function getAllBalances() {
    const result = await query(
        'SELECT user_id, balance FROM users WHERE balance <> $1 ORDER BY balance DESC',
        [STARTING_BALANCE]
    );
    return result.rows;
}

/**
 * Create a new prediction with predefined options
 */
export async function createPrediction(creatorId, question, options, creatorChoice, creatorAmount) {
    return withTransaction(async (client) => {
        await ensureUser(creatorId, client);

        const balanceResult = await client.query(
            'SELECT balance FROM users WHERE user_id = $1 FOR UPDATE',
            [creatorId]
        );
        const balance = balanceResult.rows[0].balance;
        if (balance < creatorAmount) {
            return { success: false, error: `Insufficient credits. You have ${balance} credits.` };
        }

        const predictionResult = await client.query(
            'INSERT INTO predictions (question, options, creator_id) VALUES ($1, $2, $3) RETURNING id',
            [question, options, creatorId]
        );
        const predictionId = predictionResult.rows[0].id;

        await client.query(
            'INSERT INTO bets (prediction_id, user_id, prediction, amount) VALUES ($1, $2, $3, $4)',
            [predictionId, creatorId, creatorChoice, creatorAmount]
        );

        await client.query(
            'UPDATE users SET balance = balance - $1 WHERE user_id = $2',
            [creatorAmount, creatorId]
        );

        return { success: true, predictionId };
    });
}

/**
 * Place a bet on an existing prediction
 */
export async function placeBet(predictionId, userId, prediction, amount) {
    return withTransaction(async (client) => {
        const predResult = await client.query(
            'SELECT id, options, resolved FROM predictions WHERE id = $1',
            [predictionId]
        );

        if (predResult.rowCount === 0) {
            return { success: false, error: 'Prediction not found' };
        }

        const pred = predResult.rows[0];
        if (pred.resolved) {
            return { success: false, error: 'This prediction is already resolved' };
        }

        const validOption = pred.options.find(opt => opt.toLowerCase() === prediction.toLowerCase());
        if (!validOption) {
            return { success: false, error: `Invalid option. Choose from: ${pred.options.join(', ')}` };
        }

        await ensureUser(userId, client);
        const balanceResult = await client.query(
            'SELECT balance FROM users WHERE user_id = $1 FOR UPDATE',
            [userId]
        );
        const balance = balanceResult.rows[0].balance;
        if (balance < amount) {
            return { success: false, error: `Insufficient credits. You have ${balance} credits.` };
        }

        await client.query(
            'INSERT INTO bets (prediction_id, user_id, prediction, amount) VALUES ($1, $2, $3, $4)',
            [predictionId, userId, prediction, amount]
        );

        await client.query(
            'UPDATE users SET balance = balance - $1 WHERE user_id = $2',
            [amount, userId]
        );

        return { success: true };
    });
}

/**
 * Resolve a prediction and distribute winnings
 */
export async function resolvePrediction(predictionId, outcome) {
    return withTransaction(async (client) => {
        const predResult = await client.query(
            'SELECT id, question, resolved FROM predictions WHERE id = $1 FOR UPDATE',
            [predictionId]
        );

        if (predResult.rowCount === 0) {
            return { success: false, error: 'Prediction not found' };
        }

        const pred = predResult.rows[0];
        if (pred.resolved) {
            return { success: false, error: 'This prediction is already resolved' };
        }

        const betsResult = await client.query(
            'SELECT user_id, prediction, amount FROM bets WHERE prediction_id = $1',
            [predictionId]
        );
        const bets = betsResult.rows;

        let totalPot = 0;
        const winningBets = [];
        const losingBets = [];

        for (const bet of bets) {
            totalPot += bet.amount;
            if (bet.prediction.toLowerCase() === outcome.toLowerCase()) {
                winningBets.push(bet);
            } else {
                losingBets.push(bet);
            }
        }

        await client.query(
            'UPDATE predictions SET resolved = TRUE, outcome = $2 WHERE id = $1',
            [predictionId, outcome]
        );

        if (winningBets.length === 0) {
            for (const bet of bets) {
                await ensureUser(bet.user_id, client);
                await client.query(
                    'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
                    [bet.amount, bet.user_id]
                );
            }
            return {
                success: true,
                message: 'No winners. All bets returned.',
                winners: [],
                totalPot: totalPot,
            };
        }

        let totalWinningAmount = 0;
        for (const bet of winningBets) {
            totalWinningAmount += bet.amount;
        }

        const winners = [];
        for (const bet of winningBets) {
            const proportion = bet.amount / totalWinningAmount;

            let potForThisWinner = totalPot;
            for (const losingBet of losingBets) {
                if (losingBet.user_id === bet.user_id) {
                    potForThisWinner -= losingBet.amount;
                }
            }

            const winnings = Math.floor(potForThisWinner * proportion);
            await ensureUser(bet.user_id, client);
            await client.query(
                'UPDATE users SET balance = balance + $1 WHERE user_id = $2',
                [winnings, bet.user_id]
            );
            winners.push({
                userId: bet.user_id,
                winnings: winnings,
                originalBet: bet.amount,
                profit: winnings - bet.amount,
            });
        }

        return {
            success: true,
            message: 'Prediction resolved',
            winners: winners,
            totalPot: totalPot,
        };
    });
}

/**
 * Get all active predictions
 */
export async function getActivePredictions() {
    const predsResult = await query(
        'SELECT id, question, options, creator_id, resolved, outcome, created_at FROM predictions WHERE resolved = FALSE ORDER BY created_at DESC'
    );
    const preds = predsResult.rows;
    if (preds.length === 0) {
        return [];
    }

    const ids = preds.map(p => p.id);
    const betsResult = await query(
        'SELECT prediction_id, user_id, prediction, amount FROM bets WHERE prediction_id = ANY($1)',
        [ids]
    );
    const betsByPrediction = {};
    for (const bet of betsResult.rows) {
        if (!betsByPrediction[bet.prediction_id]) {
            betsByPrediction[bet.prediction_id] = [];
        }
        betsByPrediction[bet.prediction_id].push({
            userId: bet.user_id,
            prediction: bet.prediction,
            amount: bet.amount,
        });
    }

    return preds.map(p => ({
        id: p.id,
        question: p.question,
        options: p.options,
        creatorId: p.creator_id,
        bets: betsByPrediction[p.id] || [],
        resolved: p.resolved,
        outcome: p.outcome,
        createdAt: p.created_at,
    }));
}

/**
 * Get a specific prediction
 */
export async function getPrediction(predictionId) {
    const predResult = await query(
        'SELECT id, question, options, creator_id, resolved, outcome, created_at FROM predictions WHERE id = $1',
        [predictionId]
    );
    if (predResult.rowCount === 0) {
        return null;
    }
    const pred = predResult.rows[0];

    const betsResult = await query(
        'SELECT user_id, prediction, amount FROM bets WHERE prediction_id = $1',
        [predictionId]
    );

    return {
        id: pred.id,
        question: pred.question,
        options: pred.options,
        creatorId: pred.creator_id,
        bets: betsResult.rows.map(b => ({
            userId: b.user_id,
            prediction: b.prediction,
            amount: b.amount,
        })),
        resolved: pred.resolved,
        outcome: pred.outcome,
        createdAt: pred.created_at,
    };
}

/**
 * Get user's active bets
 */
export async function getUserBets(userId) {
    const result = await query(
        `
        SELECT p.id AS prediction_id, p.question, b.user_id, b.prediction, b.amount
        FROM bets b
        JOIN predictions p ON p.id = b.prediction_id
        WHERE p.resolved = FALSE AND b.user_id = $1
        ORDER BY p.created_at DESC
        `,
        [userId]
    );

    return result.rows.map(row => ({
        predictionId: row.prediction_id,
        question: row.question,
        bet: {
            userId: row.user_id,
            prediction: row.prediction,
            amount: row.amount,
        },
    }));
}
