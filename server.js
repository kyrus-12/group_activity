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
    activeGroups: [] // Track only group numbers that actually logged in
};

// Initialize data for Groups 1-10
function resetGameState() {
    for (let i = 1; i <= 10; i++) {
        if (gameState.scores[i] === undefined) gameState.scores[i] = 0;
        // Matches the new Blue, Pink, Orange, Yellow UI
        gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
    }
}
resetGameState();

let timerInterval = null;

app.use(express.static(path.join(__dirname, 'public')));

// Helper to stop timer and notify clients
function endRound() {
    if (timerInterval) clearInterval(timerInterval);
    gameState.timeLeft = 0;
    gameState.isTimerRunning = false;
    io.emit('timer-tick', 0); // Force UI to show 0
    io.emit('timer-end');
    console.log("Round Ended.");
}

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);
    socket.emit('init-state', gameState);

    // 1. NEW: TRACK ACTIVE LOGINS
    socket.on('group-login', (groupNum) => {
        const num = parseInt(groupNum);
        if (!isNaN(num) && !gameState.activeGroups.includes(num)) {
            gameState.activeGroups.push(num);
            console.log(`Group ${num} is now active.`);
            // Sync active list so Admin UI updates immediately
            io.emit('update-active-groups', gameState.activeGroups);
        }
    });

    // 2. ADMIN: CHANGE QUESTION SET
    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        for (let i = 1; i <= 10; i++) {
            gameState.completedModules[i] = { blue: null, pink: null, orange: null, yellow: null };
        }
        
        console.log(`Question set changed to: ${setName}`);
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
        
        gameState.timeLeft = 30;
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

    // 5. MODULE SUBMISSION (Updated for Dynamic Auto-Finish)
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

            // LOGIC: Check if only the ACTIVE (logged-in) groups are finished
            let allActiveFinished = true;
            
            // Only check groups that have actually logged in
            if (gameState.activeGroups.length > 0) {
                for (let num of gameState.activeGroups) {
                    const mods = gameState.completedModules[num];
                    if (!mods.blue || !mods.pink || !mods.orange || !mods.yellow) {
                        allActiveFinished = false;
                        break;
                    }
                }
            } else {
                allActiveFinished = false; // Don't end if no one is logged in
            }

            if (allActiveFinished && gameState.isTimerRunning) {
                console.log("All active groups finished early! Terminating timer...");
                endRound();
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`AIGHAM ENGINE LIVE ON PORT ${PORT}`);
});
