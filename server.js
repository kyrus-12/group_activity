const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- GLOBAL STATE MANAGEMENT ---
let gameState = {
    scores: {}, 
    currentSet: 'A',
    timeLeft: 120,
    isTimerRunning: false,
    completedModules: {},
    activeGroups: [] // This list now persists so they can re-enter anytime
};

// Initialize data for Groups 1-10
function resetGameState() {
    for (let i = 1; i <= 10; i++) {
        if (gameState.scores[i] === undefined) gameState.scores[i] = 0;
        gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
    }
}
resetGameState();

let timerInterval = null;

app.use(express.static(path.join(__dirname, 'public')));

// Helper to stop timer
function endRound() {
    if (timerInterval) clearInterval(timerInterval);
    gameState.timeLeft = 0;
    gameState.isTimerRunning = false;
    io.emit('timer-tick', 0);
    io.emit('timer-end');
    console.log("Round Ended.");
}

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);
    
    // Always send the current state so re-entering players see their progress
    socket.emit('init-state', gameState);

    // 1. ALLOW UNLIMITED LOGINS
    socket.on('group-login', (groupNum) => {
        const num = parseInt(groupNum);
        if (!isNaN(num)) {
            // Add to activeGroups if not already there
            if (!gameState.activeGroups.includes(num)) {
                gameState.activeGroups.push(num);
                console.log(`Group ${num} joined the session.`);
            }
            // Notify Admin to show/keep the group card
            io.emit('update-active-groups', gameState.activeGroups);
        }
    });

    // 2. ADMIN: CHANGE QUESTION SET (This is where the list resets)
    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        
        // Reset progress for all groups
        for (let i = 1; i <= 10; i++) {
            gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
        }
        
        console.log(`New Set: ${setName}. Progress cleared.`);
        io.emit('set-updated', { 
            setName: gameState.currentSet, 
            completed: gameState.completedModules 
        });
    });

    // 3. ADMIN: SYNC COMMANDS
    socket.on('sync-admin-text', (txt) => {
        io.emit('sync-admin-text', txt);
    });

    // 4. GLOBAL TIMER LOGIC
    socket.on('start-timer', () => {
        if (timerInterval) clearInterval(timerInterval);
        
        gameState.timeLeft = 120;
        gameState.isTimerRunning = true;
        io.emit('timer-tick', gameState.timeLeft);

        timerInterval = setInterval(() => {
            gameState.timeLeft--;
            io.emit('timer-tick', gameState.timeLeft);
            
            if (gameState.timeLeft <= 0) {
                endRound();
            }
        }, 1000);
    });

    // 5. MODULE SUBMISSION
    socket.on('submit-module', (data) => {
        let { group, color, isCorrect } = data;
        let gNum = parseInt(group);
        
        if (gameState.completedModules[gNum] && gameState.completedModules[gNum][color] === null) {
            gameState.completedModules[gNum][color] = isCorrect ? 'correct' : 'wrong';
            
            if (isCorrect) {
                gameState.scores[gNum] += 10;
            }
            
            io.emit('module-synced', { 
                group: gNum, 
                color, 
                status: gameState.completedModules[gNum][color],
                scores: gameState.scores 
            });

            checkAutoFinish();
        }
    });

    // Helper: Ends round early if all groups that have logged in are finished
    function checkAutoFinish() {
        if (!gameState.isTimerRunning || gameState.activeGroups.length === 0) return;

        let allFinished = true;
        for (let num of gameState.activeGroups) {
            const mods = gameState.completedModules[num];
            // If any module in any active group is still null, they aren't done
            if (!mods.blue || !mods.pink || !mods.orange || !mods.yellow) {
                allFinished = false;
                break;
            }
        }

        if (allFinished) {
            console.log("All active groups finished! Closing timer...");
            endRound();
        }
    }

    socket.on('disconnect', () => {
        // We do NOT remove them from activeGroups here.
        // This allows them to refresh or re-login without the Admin losing their card.
        console.log('User Disconnected');
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`AIGHAM ENGINE LIVE ON PORT ${PORT}`);
});
