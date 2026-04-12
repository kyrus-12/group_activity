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
    completedModules: {}, // Stores: { 1: { blue: 'correct', pink: null... }, 2: ... }
    activeGroups: [] 
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
    
    // Send current state immediately on connection
    socket.emit('init-state', gameState);

    socket.on('group-login', (groupNum) => {
        const num = parseInt(groupNum);
        if (!isNaN(num)) {
            if (!gameState.activeGroups.includes(num)) {
                gameState.activeGroups.push(num);
            }
            io.emit('update-active-groups', gameState.activeGroups);
            // Send state again to the specific group logging in to ensure sync
            socket.emit('init-state', gameState);
        }
    });

    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        gameState.timeLeft = 120;
        // Reset only the modules for the new set, keep total scores if desired
        for (let i = 1; i <= 10; i++) {
            gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
        }
        io.emit('set-updated', { 
            setName: gameState.currentSet, 
            completed: gameState.completedModules 
        });
    });

    socket.on('sync-admin-text', (txt) => {
        io.emit('sync-admin-text', txt);
    });

    socket.on('start-timer', () => {
        if (timerInterval) clearInterval(timerInterval);
        gameState.timeLeft = 120;
        gameState.isTimerRunning = true;
        io.emit('timer-tick', gameState.timeLeft);

        timerInterval = setInterval(() => {
            gameState.timeLeft--;
            io.emit('timer-tick', gameState.timeLeft);
            if (gameState.timeLeft <= 0) endRound();
        }, 1000);
    });

    socket.on('submit-module', (data) => {
        let { group, color, isCorrect } = data;
        let gNum = parseInt(group);
        
        if (gameState.completedModules[gNum] && gameState.completedModules[gNum][color] === null) {
            gameState.completedModules[gNum][color] = isCorrect ? 'correct' : 'wrong';
            if (isCorrect) gameState.scores[gNum] += 1;
            
            io.emit('module-synced', { 
                group: gNum, 
                color, 
                status: gameState.completedModules[gNum][color],
                scores: gameState.scores 
            });
            checkAutoFinish();
        }
    });

    // NEW: Handle reset scores request from admin
    socket.on('reset-scores', () => {
        // Reset all scores to 0
        for (let i = 1; i <= 10; i++) {
            gameState.scores[i] = 0;
        }
        io.emit('scores-reset');
        io.emit('update-active-groups', gameState.activeGroups); // Refresh scoreboard
        console.log("Scores reset by admin");
    });

    // NEW: Handle new game request from admin
    socket.on('new-game', () => {
        // Stop any running timer
        if (timerInterval) clearInterval(timerInterval);
        
        // Reset game state completely
        gameState.timeLeft = 120;
        gameState.isTimerRunning = false;
        gameState.currentSet = 'A';
        
        // Reset all scores to 0
        for (let i = 1; i <= 10; i++) {
            gameState.scores[i] = 0;
            gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
        }
        
        // Notify all clients to reset their UI
        io.emit('game-reset');
        io.emit('timer-tick', 120);
        io.emit('set-updated', { 
            setName: gameState.currentSet, 
            completed: gameState.completedModules 
        });
        io.emit('update-active-groups', gameState.activeGroups);
        
        console.log("New game started by admin");
    });

    // Handle request for initial state
    socket.on('get-init-state', () => {
        socket.emit('init-state', gameState);
    });

    function checkAutoFinish() {
        if (!gameState.isTimerRunning || gameState.activeGroups.length === 0) return;
        let allFinished = true;
        for (let num of gameState.activeGroups) {
            const mods = gameState.completedModules[num];
            if (!mods.blue || !mods.pink || !mods.orange || !mods.yellow) {
                allFinished = false;
                break;
            }
        }
        if (allFinished) endRound();
    }

    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`AIGHAM ENGINE LIVE ON PORT ${PORT}`);
});
