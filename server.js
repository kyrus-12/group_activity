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
    timeLeft: 30,
    isTimerRunning: false,
    // Tracks module status per group: null (open), 'correct', or 'wrong'
    completedModules: {} 
};

// Initialize data for Groups 1-10
for (let i = 1; i <= 10; i++) {
    gameState.scores[i] = 0;
    gameState.completedModules[i] = { red: null, green: null, yellow: null, orange: null };
}

let timerInterval = null;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('User Connected:', socket.id);

    // 1. SYNC NEW USERS: Sends current scores, set, and locked modules
    socket.emit('init-state', gameState);

    // 2. ADMIN: CHANGE QUESTION SET
    socket.on('change-set', (setName) => {
        gameState.currentSet = setName;
        
        // Reset completion status for the new set so modules can be played again
        for (let i = 1; i <= 10; i++) {
            gameState.completedModules[i] = { red: null, green: null, yellow: null, orange: null };
        }
        
        console.log(`Question set changed to: ${setName}`);
        io.emit('set-updated', { 
            setName: gameState.currentSet, 
            completed: gameState.completedModules 
        });
    });

    // 3. ADMIN: SYNC TEXT (For monitoring what's being answered)
    socket.on('sync-admin-text', (txt) => {
        io.emit('sync-admin-text', txt);
    });

    // 4. GLOBAL TIMER LOGIC
    socket.on('start-timer', () => {
        if (gameState.isTimerRunning) {
            clearInterval(timerInterval);
        }
        
        gameState.timeLeft = 30;
        gameState.isTimerRunning = true;
        io.emit('timer-tick', gameState.timeLeft);

        timerInterval = setInterval(() => {
            gameState.timeLeft--;
            io.emit('timer-tick', gameState.timeLeft);

            if (gameState.timeLeft <= 0) {
                clearInterval(timerInterval);
                gameState.isTimerRunning = false;
                io.emit('timer-end');
            }
        }, 1000);
    });

    // 5. MODULE SUBMISSION & SCORING (The Anti-Cheat Logic)
    socket.on('submit-module', (data) => {
        const { group, color, isCorrect } = data;
        
        // Only process if the group hasn't answered this color yet
        if (gameState.completedModules[group] && gameState.completedModules[group][color] === null) {
            
            // Mark as finished on the server
            gameState.completedModules[group][color] = isCorrect ? 'correct' : 'wrong';
            
            // Add points only if correct
            if (isCorrect) {
                gameState.scores[group] += 10;
            }
            
            console.log(`Group ${group} finished ${color}. Status: ${gameState.completedModules[group][color]}`);

            // Broadcast to ALL devices. 
            // This updates the Admin scoreboard AND locks the module for all group members.
            io.emit('module-synced', { 
                group, 
                color, 
                status: gameState.completedModules[group][color],
                scores: gameState.scores 
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`//////////////////////////////////////////`);
    console.log(`AIGHAM ENGINE LIVE ON PORT ${PORT}`);
    console.log(`//////////////////////////////////////////`);
});
